"""
kcharted - Billboard 차트 수집 스크립트 (GitHub Actions용)
Billboard Hot 100 / Billboard 200 → Supabase 저장
Spotify API로 cover_url / spotify_id 보강
"""

import os
import re
import time
import requests
from datetime import date

try:
    import billboard
    if not hasattr(billboard, 'ChartData'):
        raise ImportError("billboard.ChartData not found — wrong package installed. Need 'billboard.py', not 'billboard'")
except ImportError as e:
    raise SystemExit(f"[오류] billboard 패키지 문제: {e}\n실행: pip install 'billboard.py'")

# ── 설정 (환경변수) ────────────────────────────────────
SUPABASE_URL          = re.sub(r"[\r\n\t\s]", "", os.environ["SUPABASE_URL"])
SUPABASE_KEY          = re.sub(r"[\r\n\t\s]", "", os.environ["SUPABASE_KEY"])
SPOTIFY_CLIENT_ID     = re.sub(r"[\r\n\t\s]", "", os.environ.get("SPOTIFY_CLIENT_ID", ""))
SPOTIFY_CLIENT_SECRET = re.sub(r"[\r\n\t\s]", "", os.environ.get("SPOTIFY_CLIENT_SECRET", ""))

CHARTS = {
    "billboard-hot-100": "hot-100",
    "billboard-200":     "billboard-200",
}

HEADERS_SB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# ── Spotify 토큰 ───────────────────────────────────────
_spotify_token = None
_spotify_token_expiry = 0.0

def get_spotify_token():
    global _spotify_token, _spotify_token_expiry
    if not SPOTIFY_CLIENT_ID or not SPOTIFY_CLIENT_SECRET:
        return None
    if _spotify_token and time.time() < _spotify_token_expiry:
        return _spotify_token
    resp = requests.post("https://accounts.spotify.com/api/token",
                         data={"grant_type": "client_credentials"},
                         auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET), timeout=10)
    if resp.ok:
        _spotify_token = resp.json()["access_token"]
        _spotify_token_expiry = time.time() + 3500
        return _spotify_token
    return None

def spotify_search(title: str, artist: str, is_album: bool) -> dict:
    """Spotify Search API로 cover_url과 spotify_id 반환. 실패 시 빈 dict."""
    token = get_spotify_token()
    if not token:
        return {}
    q_type = "album" if is_album else "track"
    query = f"{title} {artist}"
    try:
        resp = requests.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query, "type": q_type, "limit": 1},
            timeout=10,
        )
        if resp.status_code == 429:
            time.sleep(int(resp.headers.get("Retry-After", 5)))
            return {}
        if not resp.ok:
            return {}
        data = resp.json()
        items = data.get(f"{q_type}s", {}).get("items", [])
        if not items:
            return {}
        item = items[0]
        images = item.get("images", []) if is_album else (item.get("album", {}).get("images", []))
        cover_url = images[0]["url"] if images else None
        return {"spotify_id": item["id"], "cover_url": cover_url}
    except Exception:
        return {}

# ── Supabase 헬퍼 ──────────────────────────────────────
def sb_get(table, params):
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS_SB, params=params)
    resp.raise_for_status()
    return resp.json()

def sb_post(table, data):
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/{table}",
                         headers={**HEADERS_SB, "Prefer": "return=representation"}, json=data)
    resp.raise_for_status()
    return resp.json()

def sb_upsert(table, data, on_conflict, retries=5):
    for attempt in range(retries):
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/{table}",
                             headers={**HEADERS_SB, "Prefer": "resolution=merge-duplicates,return=representation"},
                             params={"on_conflict": on_conflict}, json=data)
        if resp.ok:
            return resp.json()
        if resp.status_code in (500, 502, 503, 504) and attempt < retries - 1:
            wait = 10 * (attempt + 1)
            print(f"  ⚠️ {resp.status_code} 에러, {wait}초 후 재시도... ({resp.text[:200]})")
            time.sleep(wait)
            continue
        print(f"  ❌ upsert 실패 ({table}): {resp.status_code} {resp.text[:300]}")
        resp.raise_for_status()

# ── 아티스트/트랙/차트 헬퍼 ───────────────────────────
SEPARATORS = (" Featuring ", " featuring ", " feat. ", " Feat. ", " & ", " x ", " X ")

def find_kpop_canonical(name):
    """이름에서 K-pop 메인 아티스트를 찾아 (canonical_id, is_kpop) 반환"""
    for sep in SEPARATORS:
        if sep in name:
            parts = [p.strip() for p in name.split(sep)]
            for part in parts:
                row = sb_get("artists", {"name": f"ilike.{part}", "select": "id,is_kpop,canonical_artist_id"})
                if row and row[0].get("is_kpop"):
                    canon_id = row[0].get("canonical_artist_id") or row[0]["id"]
                    return canon_id, True
            break
    return None, None

def upsert_artist(name):
    existing = sb_get("artists", {"name": f"ilike.{name}", "select": "id,is_kpop,canonical_artist_id"})
    if existing:
        return existing[0]["id"]

    canon_id, inherited_kpop = find_kpop_canonical(name)

    payload = {"name": name}
    if inherited_kpop:
        payload["is_kpop"] = True
    if canon_id:
        payload["canonical_artist_id"] = canon_id

    return sb_post("artists", payload)[0]["id"]

def upsert_track(title, artist_id, artist_name, is_album=False):
    existing = sb_get("tracks", {"title": f"ilike.{title}", "artist_id": f"eq.{artist_id}",
                                  "select": "id,is_album,cover_url,spotify_id"})
    if existing:
        track_id = existing[0]["id"]
        patch = {}
        # is_album 업그레이드
        if is_album and not existing[0].get("is_album"):
            patch["is_album"] = True
        # cover_url / spotify_id 없으면 보강
        if not existing[0].get("cover_url") or not existing[0].get("spotify_id"):
            sp = spotify_search(title, artist_name, is_album)
            if sp.get("cover_url"):
                patch["cover_url"] = sp["cover_url"]
            if sp.get("spotify_id"):
                patch["spotify_id"] = sp["spotify_id"]
        if patch:
            requests.patch(f"{SUPABASE_URL}/rest/v1/tracks",
                           headers={**HEADERS_SB, "Prefer": "return=minimal"},
                           params={"id": f"eq.{track_id}"},
                           json=patch)
        return track_id

    # 신규 트랙 — Spotify에서 커버 가져오기
    sp = spotify_search(title, artist_name, is_album)
    payload = {"title": title, "artist_id": artist_id, "is_album": is_album}
    if sp.get("cover_url"):
        payload["cover_url"] = sp["cover_url"]
    if sp.get("spotify_id"):
        payload["spotify_id"] = sp["spotify_id"]
    return sb_post("tracks", payload)[0]["id"]

def get_chart_id(slug):
    rows = sb_get("charts", {"slug": f"eq.{slug}", "select": "id"})
    if not rows:
        raise ValueError(f"charts 테이블에 slug='{slug}' 없음")
    return rows[0]["id"]

def upsert_chart_entry(chart_id, track_id, rank, chart_date):
    sb_upsert("chart_entries", {
        "chart_id": chart_id, "track_id": track_id,
        "rank": rank, "chart_date": str(chart_date),
    }, "chart_id,chart_date,rank")

# ── 메인 ──────────────────────────────────────────────
def collect(chart_date=None):
    has_spotify = bool(get_spotify_token())
    print(f"[kcharted] Billboard 차트 수집 시작 ({chart_date or '최신'}) | Spotify 커버아트: {'✅' if has_spotify else '❌ (SPOTIFY_CLIENT_ID/SECRET 없음)'}\n")

    for slug, bb_name in CHARTS.items():
        print(f"📊 {slug} 수집 중...")
        try:
            chart = billboard.ChartData(bb_name, date=chart_date)
        except Exception as e:
            print(f"  ❌ 수집 실패: {e}")
            continue

        chart_date_actual = str(chart.date) if chart.date else str(date.today())
        chart_id = get_chart_id(slug)
        is_album = (bb_name == "billboard-200")

        saved = 0
        for entry in chart:
            try:
                artist_id = upsert_artist(entry.artist)
                track_id  = upsert_track(entry.title, artist_id, entry.artist, is_album=is_album)
                upsert_chart_entry(chart_id, track_id, entry.rank, chart_date_actual)
                saved += 1
                print(f"  {entry.rank:3}. {entry.title} - {entry.artist}")
            except Exception as e:
                print(f"  ❌ 저장 실패 ({entry.rank}. {entry.title}): {e}")

        print(f"  ✅ {saved}/{len(chart)}곡 저장 완료 (날짜: {chart_date_actual})\n")

if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else None
    collect(d)
