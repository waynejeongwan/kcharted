"""
kcharted - K-pop Spotify 스트리밍 수집 (kworb.net)

DB의 is_kpop=True && spotify_artist_id IS NOT NULL 아티스트를 동적으로 조회해
kworb.net 아티스트 페이지에서 누적 스트리밍 데이터를 수집.

하드코딩된 목록 없음 → 새 아티스트가 DB에 추가되면 다음 실행에 자동 포함.

사용:
  python scripts/kworb_scrape.py            # 일반 수집 (스트리밍 수치)
  python scripts/kworb_scrape.py --milestones  # 마일스톤 날짜까지 수집
  python scripts/kworb_scrape.py --check     # 커버리지 검증 (누락 리포트)
  python scripts/kworb_scrape.py --dry-run   # 저장 없이 출력

필요 환경변수:
  SUPABASE_URL  Supabase URL
  SUPABASE_KEY  Supabase service_role 키
"""

import os
import re
import sys
import time
import argparse
from datetime import date, datetime
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ── 설정 ──────────────────────────────────────────────────
def _clean_env(key: str, default: str = "") -> str:
    """환경변수에서 줄바꿈/공백 문자를 제거 (GitHub Secrets 복붙 오염 방지)"""
    return re.sub(r"[\r\n\t\s]", "", os.environ.get(key, default))

SUPABASE_URL          = _clean_env("SUPABASE_URL", "https://hqoovxivfabnwfdjnuvs.supabase.co")
SUPABASE_KEY          = _clean_env("SUPABASE_KEY")
SPOTIFY_CLIENT_ID     = _clean_env("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = _clean_env("SPOTIFY_CLIENT_SECRET")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

UA = {"User-Agent": "Mozilla/5.0 (compatible; kcharted-bot/1.0; +https://kcharted.com)"}

# ── Spotify 토큰 ───────────────────────────────────────────
_spotify_token: Optional[str] = None
_spotify_token_expiry: float = 0.0

def get_spotify_token() -> Optional[str]:
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

def get_track_info(spotify_track_id: str, kpop_artist_id: str) -> tuple[bool, Optional[str]]:
    """
    Spotify API로 트랙 아티스트를 확인하고 피처링 여부를 판단.
    반환: (is_valid, main_artist)
      - is_valid: kpop_artist_id가 트랙 아티스트에 포함되면 True
      - main_artist: K-pop 아티스트가 피처링인 경우 원곡 아티스트 이름, 원곡이면 None
    """
    token = get_spotify_token()
    if not token:
        return True, None  # 토큰 없으면 검증 생략
    resp = requests.get(f"https://api.spotify.com/v1/tracks/{spotify_track_id}",
                        headers={"Authorization": f"Bearer {token}"}, timeout=10)
    if not resp.ok:
        return True, None  # API 오류시 통과
    artists = resp.json().get("artists", [])
    artist_ids = [a["id"] for a in artists]

    if kpop_artist_id not in artist_ids:
        return False, None  # 이 아티스트의 곡이 아님

    # K-pop 아티스트가 첫 번째(원곡) 아티스트인지 확인
    if artists and artists[0]["id"] == kpop_artist_id:
        return True, None  # 원곡 아티스트 → main_artist 불필요

    # 피처링: 원곡 아티스트(들) 이름 반환
    main_names = [a["name"] for a in artists if a["id"] != kpop_artist_id]
    main_artist = " & ".join(main_names) if main_names else None
    return True, main_artist

MILESTONES = [
    (100_000_000,   "days_to_100m", "reached_100m_at"),
    (500_000_000,   "days_to_500m", "reached_500m_at"),
    (1_000_000_000, "days_to_1b",   "reached_1b_at"),
]


# ── DB 조회 ───────────────────────────────────────────────
def get_kpop_artists_from_db() -> list[dict]:
    """
    DB에서 is_kpop=True AND spotify_artist_id IS NOT NULL 인 아티스트 목록 조회.
    canonical 아티스트만 포함 (canonical_artist_id IS NULL).
    """
    all_artists = []
    offset = 0
    limit = 1000
    while True:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/artists",
            headers=SB_HEADERS,
            params={
                "is_kpop": "eq.true",
                "spotify_artist_id": "not.is.null",
                "canonical_artist_id": "is.null",
                "select": "id,name,spotify_artist_id",
                "limit": limit,
                "offset": offset,
            },
            timeout=15,
        )
        resp.raise_for_status()
        batch = resp.json()
        all_artists.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return all_artists


def get_kpop_artists_without_spotify_id() -> list[dict]:
    """spotify_artist_id 없는 K-pop 아티스트 목록 (커버리지 갭 확인용)"""
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/artists",
        headers=SB_HEADERS,
        params={
            "is_kpop": "eq.true",
            "spotify_artist_id": "is.null",
            "canonical_artist_id": "is.null",
            "select": "id,name",
            "order": "name",
            "limit": 1000,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def get_artists_in_charts_but_no_streams() -> list[dict]:
    """
    chart_entries에 기록은 있지만 kpop_spotify_stats에 없는 K-pop 아티스트.
    (커버리지 갭 확인용)
    """
    # Supabase RPC가 없으므로 간접 방식: DB에서 K-pop 아티스트 ID 목록 조회
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/kpop_spotify_stats",
        headers=SB_HEADERS,
        params={"select": "artist_name", "limit": 5000},
        timeout=15,
    )
    if not resp.ok:
        return []
    covered = {r["artist_name"].lower() for r in resp.json()}

    all_kpop = get_kpop_artists_from_db()
    missing = [a for a in all_kpop if a["name"].lower() not in covered]
    return missing


# ── kworb 파싱 ────────────────────────────────────────────
def parse_num(s: str) -> Optional[int]:
    s = re.sub(r"[,\s+]", "", s.strip())
    try:
        return int(s)
    except ValueError:
        return None


def safe_get(url: str, retries: int = 3, delay: float = 2.0) -> Optional[requests.Response]:
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=UA, timeout=20)
            if resp.status_code == 429:
                wait = delay * (2 ** attempt)
                print(f"    Rate limited — {wait:.0f}s 대기...")
                time.sleep(wait)
                continue
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp
        except requests.exceptions.RequestException as e:
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                print(f"    [오류] {url}: {e}")
    return None


def scrape_artist_songs(artist_name: str, spotify_artist_id: str) -> list[dict]:
    """
    kworb 아티스트 페이지에서 트랙별 누적 스트리밍 수집.
    URL: https://kworb.net/spotify/artist/{ID}_songs.html
    """
    url = f"https://kworb.net/spotify/artist/{spotify_artist_id}_songs.html"
    resp = safe_get(url)
    if resp is None:
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    # 곡 목록 테이블 찾기 (Song Title 헤더가 있는 것)
    table = None
    for t in soup.find_all("table"):
        ths = [th.get_text(strip=True).lower() for th in t.find_all("th")]
        if any("song" in h or "title" in h for h in ths):
            table = t
            break
    if not table:
        return []

    headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
    col_song  = next((i for i, h in enumerate(headers) if "song" in h or "title" in h), 0)
    col_total = next((i for i, h in enumerate(headers) if "stream" in h and "daily" not in h), 1)
    col_daily = next((i for i, h in enumerate(headers) if "daily" in h), None)

    results = []
    rejected = 0
    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue

        title_td = tds[col_song] if col_song < len(tds) else tds[0]
        link = title_td.find("a")
        title = link.get_text(strip=True) if link else title_td.get_text(strip=True)
        if not title:
            continue

        track_id = None
        if link and link.get("href"):
            # https://open.spotify.com/track/XXXX 또는 /spotify/track/XXXX.html
            m = re.search(r"/track/([A-Za-z0-9]+)", link["href"])
            if m:
                track_id = m.group(1)

        total = parse_num(tds[col_total].get_text(strip=True)) if col_total < len(tds) else None
        if not total or total <= 0:
            continue

        # Spotify 아티스트 검증: 트랙이 실제로 이 아티스트의 것인지 확인 + 피처링 감지
        main_artist = None
        if track_id:
            is_valid, main_artist = get_track_info(track_id, spotify_artist_id)
            if not is_valid:
                rejected += 1
                if rejected <= 3:
                    print(f"\n    [검증 실패] '{title}' — 실제 아티스트 불일치 (spotify_artist_id={spotify_artist_id})")
                continue

        daily = None
        if col_daily is not None and col_daily < len(tds):
            daily = parse_num(tds[col_daily].get_text(strip=True))

        results.append({
            "artist_name": artist_name,
            "track_title": title,
            "spotify_track_id": track_id,
            "total_streams": total,
            "daily_streams": daily,
            "main_artist": main_artist,  # None이면 K-pop 아티스트가 원곡, 문자열이면 피처링
        })

    if rejected > 3:
        print(f"\n    [검증 실패] 총 {rejected}개 트랙 제외 (아티스트 불일치)")
    elif rejected > 0:
        print(f"\n    [검증] {rejected}개 트랙 제외")

    return results


def scrape_track_milestones(spotify_track_id: str) -> dict:
    """kworb 트랙 히스토리 페이지에서 마일스톤 날짜 수집"""
    url = f"https://kworb.net/spotify/track/{spotify_track_id}.html"
    resp = safe_get(url)
    if resp is None:
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        return {}

    headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
    date_col  = next((i for i, h in enumerate(headers) if "date" in h), 0)
    total_col = next((i for i, h in enumerate(headers) if "total" in h), None)
    daily_col = next((i for i, h in enumerate(headers) if "daily" in h or "stream" in h), 1)

    history: list[tuple[date, int]] = []
    running = 0

    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue
        date_str = tds[date_col].get_text(strip=True) if date_col < len(tds) else ""
        entry_date = None
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                entry_date = datetime.strptime(date_str, fmt).date()
                break
            except ValueError:
                continue
        if entry_date is None:
            continue

        if total_col is not None and total_col < len(tds):
            v = parse_num(tds[total_col].get_text(strip=True))
            if v:
                history.append((entry_date, v))
        elif daily_col < len(tds):
            v = parse_num(tds[daily_col].get_text(strip=True))
            if v:
                running += v
                history.append((entry_date, running))

    if not history:
        return {}

    history.sort(key=lambda x: x[0])
    first_date = history[0][0]
    result: dict = {"release_date": first_date.isoformat()}

    for threshold, key_days, key_date in MILESTONES:
        for entry_date, total in history:
            if total >= threshold:
                result[key_days] = (entry_date - first_date).days
                result[key_date] = entry_date.isoformat()
                break
    return result


# ── Supabase 저장 ──────────────────────────────────────────
def upsert_stats(rows: list[dict], dry_run: bool) -> dict[str, int]:
    if dry_run:
        for r in rows[:5]:
            print(f"  [DRY] {r['artist_name']} — {r['track_title']} | {r['total_streams']:,}")
        if len(rows) > 5:
            print(f"  ... ({len(rows) - 5}개 더)")
        return {}

    id_map: dict[str, int] = {}
    today = date.today().isoformat()
    BATCH = 100

    for i in range(0, len(rows), BATCH):
        batch = [{**r, "updated_at": today} for r in rows[i:i + BATCH] if r.get("spotify_track_id")]
        if not batch:
            continue
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/kpop_spotify_stats",
            headers={**SB_HEADERS, "Prefer": "return=representation,resolution=merge-duplicates"},
            params={"on_conflict": "spotify_track_id"},
            json=batch,
            timeout=30,
        )
        if resp.ok:
            for r in resp.json():
                if r.get("spotify_track_id"):
                    id_map[r["spotify_track_id"]] = r["id"]
        else:
            print(f"  [오류] upsert 실패: {resp.status_code} {resp.text[:200]}")
    return id_map


def save_snapshot(stat_id: int, total_streams: int):
    today = date.today().isoformat()
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/kpop_stream_snapshots",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
        json={"stat_id": stat_id, "snapshot_date": today, "total_streams": total_streams},
        timeout=10,
    )
    if not resp.ok:
        print(f"    [경고] 스냅샷 저장 실패 (stat_id={stat_id}): {resp.status_code}")


def update_milestones(db_id: int, milestones: dict):
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/kpop_spotify_stats",
        headers=SB_HEADERS,
        params={"id": f"eq.{db_id}"},
        json=milestones,
        timeout=15,
    )
    if not resp.ok:
        print(f"    [경고] 마일스톤 업데이트 실패 (id={db_id}): {resp.status_code}")


# ── 커버리지 검증 ─────────────────────────────────────────
def run_coverage_check():
    """
    누락 리포트 출력:
    1. spotify_artist_id가 없는 K-pop 아티스트 (kworb 수집 불가)
    2. spotify_artist_id는 있지만 kworb 수집 결과가 없는 아티스트
    """
    print("=== 커버리지 검증 ===\n")

    # 1. spotify_artist_id 미등록
    no_id = get_kpop_artists_without_spotify_id()
    print(f"① spotify_artist_id 미등록 K-pop 아티스트: {len(no_id)}명")
    for a in no_id[:30]:
        print(f"  id={a['id']} | {a['name']}")
    if len(no_id) > 30:
        print(f"  ... ({len(no_id) - 30}명 더)")

    # 2. ID는 있지만 수집 데이터 없음
    not_scraped = get_artists_in_charts_but_no_streams()
    print(f"\n② ID 등록됐지만 스트리밍 데이터 없는 아티스트: {len(not_scraped)}명")
    for a in not_scraped[:30]:
        print(f"  id={a['id']} | {a['name']} | spotify_id={a.get('spotify_artist_id','')}")
    if len(not_scraped) > 30:
        print(f"  ... ({len(not_scraped) - 30}명 더)")

    # 3. 수집 현황 요약
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/kpop_spotify_stats",
        headers=SB_HEADERS,
        params={"select": "count", "limit": 1},
        timeout=10,
    )
    if resp.ok:
        count = resp.headers.get("Content-Range", "").split("/")[-1]
        print(f"\n③ kpop_spotify_stats 총 트랙 수: {count}")

    total_kpop = get_kpop_artists_from_db()
    print(f"④ spotify_artist_id 등록 K-pop 아티스트: {len(total_kpop)}명")
    print(f"\n커버리지 갭: {len(no_id)}명이 spotify_artist_id 없음 → admin 페이지 또는 SQL로 추가 필요")


# ── 메인 ─────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="K-pop Spotify 스트리밍 수집 (kworb.net)")
    parser.add_argument("--milestones", action="store_true", help="100M+ 트랙 마일스톤 날짜 수집")
    parser.add_argument("--top",        type=int, default=0,  help="마일스톤: 아티스트당 상위 N개 (0=전체)")
    parser.add_argument("--check",      action="store_true",  help="커버리지 검증만 실행")
    parser.add_argument("--dry-run",    action="store_true",  help="저장 없이 결과 출력")
    args = parser.parse_args()

    if args.check:
        run_coverage_check()
        return

    print("=== K-pop Spotify 스트리밍 수집 ===\n")

    # ① DB에서 아티스트 목록 조회
    print("DB에서 K-pop 아티스트 목록 조회 중...")
    db_artists = get_kpop_artists_from_db()
    print(f"  대상: {len(db_artists)}명 (is_kpop=True, spotify_artist_id 있음)\n")

    if not db_artists:
        print("  [오류] 대상 아티스트 없음. artists 테이블에 spotify_artist_id를 등록하세요.")
        print("  → scripts/kworb_scrape.py --check 로 현황 확인 가능")
        sys.exit(1)

    # ② kworb 수집
    all_tracks: list[dict] = []
    failed: list[str] = []

    for idx, artist in enumerate(db_artists, 1):
        name = artist["name"]
        sid  = artist["spotify_artist_id"]
        print(f"  [{idx:3}/{len(db_artists)}] {name}...", end=" ", flush=True)
        tracks = scrape_artist_songs(name, sid)
        if tracks:
            print(f"{len(tracks)}곡")
            all_tracks.extend(tracks)
        else:
            print("(없음 — kworb 페이지 없음)")
            failed.append(f"{name} ({sid})")
        time.sleep(0.8)

    # ③ 중복 제거 (같은 track_id → 최대 스트림 유지)
    dedup: dict[str, dict] = {}
    for t in all_tracks:
        tid = t.get("spotify_track_id")
        key = tid if tid else f"{t['artist_name']}|{t['track_title']}"
        if key not in dedup or t["total_streams"] > dedup[key]["total_streams"]:
            dedup[key] = t

    unique = sorted(dedup.values(), key=lambda x: x["total_streams"], reverse=True)
    print(f"\n수집: {len(all_tracks)}곡 → 중복 제거 후 {len(unique)}곡")

    if unique:
        print("Top 5:")
        for t in unique[:5]:
            print(f"  {t['total_streams']:>15,}  {t['artist_name']} — {t['track_title']}")

    # ④ 저장
    print(f"\nDB 저장 중...")
    id_map = upsert_stats(unique, args.dry_run)

    if not args.dry_run:
        print(f"  저장: {len(id_map)}개")
        # 상위 100개 스냅샷
        for t in [t for t in unique if t.get("spotify_track_id")][:100]:
            sid = id_map.get(t["spotify_track_id"])
            if sid:
                save_snapshot(sid, t["total_streams"])
        print(f"  스냅샷: 상위 {min(100, len(unique))}개")

    # ⑤ 마일스톤
    if args.milestones:
        targets = [t for t in unique if t.get("spotify_track_id") and t["total_streams"] >= 100_000_000]
        if args.top > 0:
            artist_cnt: dict[str, int] = {}
            filtered = []
            for t in targets:
                a = t["artist_name"]
                artist_cnt[a] = artist_cnt.get(a, 0) + 1
                if artist_cnt[a] <= args.top:
                    filtered.append(t)
            targets = filtered

        print(f"\n마일스톤 수집: {len(targets)}트랙 (100M+)")
        for idx, t in enumerate(targets, 1):
            tid = t["spotify_track_id"]
            db_id = id_map.get(tid)
            print(f"  [{idx}/{len(targets)}] {t['artist_name']} — {t['track_title']}")
            m = scrape_track_milestones(tid)
            if m and db_id and not args.dry_run:
                update_milestones(db_id, m)
                flags = []
                if m.get("days_to_100m"): flags.append(f"100M:{m['days_to_100m']}일")
                if m.get("days_to_500m"): flags.append(f"500M:{m['days_to_500m']}일")
                if m.get("days_to_1b"):   flags.append(f"1B:{m['days_to_1b']}일")
                if flags:
                    print(f"    → {' / '.join(flags)}")
            time.sleep(0.5)

    # ⑥ 결과 요약
    print(f"\n=== 완료 ===")
    print(f"  수집 성공: {len(db_artists) - len(failed)}명")
    if failed:
        print(f"  kworb 페이지 없음 ({len(failed)}명):")
        for f in failed:
            print(f"    - {f}")
        print(f"  → 위 아티스트는 kworb에 페이지가 없거나 Spotify ID가 틀린 것입니다.")
        print(f"    --check 옵션으로 전체 커버리지 상태를 확인하세요.")


if __name__ == "__main__":
    main()
