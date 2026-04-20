"""
kcharted - Billboard 차트 수집 스크립트 (GitHub Actions용)
Billboard Hot 100 / Billboard 200 → Supabase 저장
"""

import os
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
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

CHARTS = {
    "billboard-hot-100": "hot-100",
    "billboard-200":     "billboard-200",
}

HEADERS_SB = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

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
            print(f"  ⚠️ {resp.status_code} 에러, {wait}초 후 재시도...")
            time.sleep(wait)
            continue
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

def upsert_track(title, artist_id, is_album=False):
    existing = sb_get("tracks", {"title": f"ilike.{title}", "artist_id": f"eq.{artist_id}", "select": "id,is_album"})
    if existing:
        track_id = existing[0]["id"]
        # is_album=True로 업그레이드가 필요한 경우 업데이트
        if is_album and not existing[0].get("is_album"):
            requests.patch(f"{SUPABASE_URL}/rest/v1/tracks",
                           headers={**HEADERS_SB, "Prefer": "return=minimal"},
                           params={"id": f"eq.{track_id}"},
                           json={"is_album": True})
        return track_id
    return sb_post("tracks", {"title": title, "artist_id": artist_id, "is_album": is_album})[0]["id"]

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
    print(f"[kcharted] Billboard 차트 수집 시작 ({chart_date or '최신'})\n")
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

        for entry in chart:
            artist_id = upsert_artist(entry.artist)
            track_id  = upsert_track(entry.title, artist_id, is_album=is_album)
            upsert_chart_entry(chart_id, track_id, entry.rank, chart_date_actual)
            print(f"  {entry.rank:3}. {entry.title} - {entry.artist}")

        print(f"  ✅ {len(chart)}곡 저장 완료 (날짜: {chart_date_actual})\n")

if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else None
    collect(d)
