"""
kcharted - kworb.net K-pop Spotify 스트리밍 데이터 수집 스크립트

kworb.net/spotify/kpop.html 에서 K-pop 누적 스트리밍 데이터를 수집해
Supabase에 저장.

사용:
  python scripts/kworb_scrape.py            # 총 스트리밍 수치만 (빠름, 약 1분)
  python scripts/kworb_scrape.py --milestones  # 마일스톤까지 수집 (느림, 약 30-60분)
  python scripts/kworb_scrape.py --dry-run  # 저장 없이 결과 출력

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
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hqoovxivfabnwfdjnuvs.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

UA = {"User-Agent": "kcharted-bot/1.0 (kcharted.com)"}
KWORB_KPOP_URL = "https://kworb.net/spotify/kpop.html"

MILESTONES = [
    (100_000_000, "days_to_100m", "reached_100m_at"),
    (500_000_000, "days_to_500m", "reached_500m_at"),
    (1_000_000_000, "days_to_1b", "reached_1b_at"),
]


# ── kworb 파싱 ────────────────────────────────────────────
def parse_num(s: str) -> Optional[int]:
    s = s.replace(",", "").replace("+", "").strip()
    try:
        return int(s)
    except ValueError:
        return None


def scrape_main_page() -> list[dict]:
    """kworb.net K-pop 메인 페이지에서 총 스트리밍 수치 수집"""
    print(f"kworb K-pop 페이지 수집 중: {KWORB_KPOP_URL}")
    resp = requests.get(KWORB_KPOP_URL, headers=UA, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table")
    if not table:
        print("  [오류] 테이블을 찾을 수 없습니다.")
        return []

    results = []
    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue

        # 아티스트명
        artist = tds[0].get_text(strip=True)
        if not artist:
            continue

        # 트랙명 + Spotify ID
        title_td = tds[1]
        link = title_td.find("a")
        title = link.get_text(strip=True) if link else title_td.get_text(strip=True)
        spotify_id = None
        if link and link.get("href"):
            m = re.search(r"/track/([^_/]+)", link["href"])
            if m:
                spotify_id = m.group(1)

        # 총 스트리밍
        total = parse_num(tds[2].get_text(strip=True))
        if total is None or total <= 0:
            continue

        # 일간 스트리밍 (선택)
        daily = None
        if len(tds) >= 4:
            daily = parse_num(tds[3].get_text(strip=True))

        results.append({
            "artist_name": artist,
            "track_title": title,
            "spotify_track_id": spotify_id,
            "total_streams": total,
            "daily_streams": daily,
        })

    print(f"  수집된 트랙: {len(results)}개")
    return results


def scrape_track_milestones(spotify_id: str) -> dict:
    """
    개별 트랙 페이지에서 마일스톤 날짜와 발매일 추정값 수집.
    kworb 트랙 요약 페이지: /spotify/track/{id}_summary.html
    """
    url = f"https://kworb.net/spotify/track/{spotify_id}_summary.html"
    try:
        resp = requests.get(url, headers=UA, timeout=20)
        if not resp.ok:
            return {}
    except Exception as e:
        print(f"    [경고] {spotify_id}: {e}")
        return {}

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        return {}

    # 헤더에서 컬럼 구조 파악
    header_cells = [th.get_text(strip=True).lower() for th in table.find_all("th")]

    # 날짜, 누적(total) 또는 일간(daily) 컬럼 인덱스
    date_col = next((i for i, h in enumerate(header_cells) if "date" in h or "날" in h), 0)
    total_col = next((i for i, h in enumerate(header_cells) if "total" in h or "cumul" in h), None)
    daily_col = next((i for i, h in enumerate(header_cells) if "daily" in h or "stream" in h and "total" not in h), 1)

    history: list[tuple[date, int]] = []
    running = 0

    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue

        # 날짜 파싱
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

        # 누적 or 일간
        if total_col is not None and total_col < len(tds):
            total = parse_num(tds[total_col].get_text(strip=True))
            if total:
                history.append((entry_date, total))
        elif daily_col < len(tds):
            daily = parse_num(tds[daily_col].get_text(strip=True))
            if daily:
                running += daily
                history.append((entry_date, running))

    if not history:
        return {}

    history.sort(key=lambda x: x[0])
    first_date = history[0][0]

    result: dict = {"release_date": first_date.isoformat()}

    for threshold, key_days, key_date in MILESTONES:
        for entry_date, total in history:
            if total >= threshold:
                days = (entry_date - first_date).days
                result[key_days] = days
                result[key_date] = entry_date.isoformat()
                break

    return result


# ── Supabase 저장 ──────────────────────────────────────────
def upsert_stats(rows: list[dict], dry_run: bool) -> list[int]:
    """kpop_spotify_stats에 upsert, 저장된 id 목록 반환"""
    if dry_run:
        for r in rows[:5]:
            streams_b = r["total_streams"] / 1_000_000_000
            print(f"  {r['artist_name']} — {r['track_title']} | {streams_b:.2f}B")
        if len(rows) > 5:
            print(f"  ... ({len(rows) - 5}개 더)")
        return []

    BATCH = 100
    ids = []
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/kpop_spotify_stats",
            headers={**SB_HEADERS, "Prefer": "return=representation,resolution=merge-duplicates"},
            params={"on_conflict": "spotify_track_id"},
            json=batch,
            timeout=30,
        )
        if resp.ok:
            ids.extend(r["id"] for r in resp.json())
        else:
            print(f"  [오류] upsert 실패: {resp.status_code} {resp.text[:200]}")
    return ids


def save_snapshot(stat_id: int, total_streams: int, dry_run: bool):
    """kpop_stream_snapshots에 오늘 스냅샷 저장 (성장 곡선용)"""
    if dry_run:
        return
    today = date.today().isoformat()
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/kpop_stream_snapshots",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates"},
        json={"stat_id": stat_id, "snapshot_date": today, "total_streams": total_streams},
        timeout=10,
    )
    if not resp.ok:
        print(f"    [경고] 스냅샷 저장 실패 (stat_id={stat_id}): {resp.status_code}")


def update_milestones(spotify_id: str, db_id: int, milestones: dict, dry_run: bool):
    if not milestones or dry_run:
        return
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/kpop_spotify_stats",
        headers=SB_HEADERS,
        params={"id": f"eq.{db_id}"},
        json=milestones,
        timeout=15,
    )
    if not resp.ok:
        print(f"    [경고] 마일스톤 업데이트 실패 (id={db_id}): {resp.status_code}")


# ── 메인 ─────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="kworb K-pop 스트리밍 데이터 수집")
    parser.add_argument("--milestones", action="store_true",
                        help="각 트랙별 마일스톤 날짜까지 수집 (느림, 초기 실행 시 권장)")
    parser.add_argument("--dry-run", action="store_true", help="저장 없이 결과 출력")
    parser.add_argument("--top", type=int, default=0,
                        help="마일스톤 수집할 상위 N개 트랙만 (0=전체, 기본 0)")
    args = parser.parse_args()

    print("=== kworb K-pop 스트리밍 수집 ===\n")

    # 1. 메인 페이지에서 총 스트리밍 수치 수집
    tracks = scrape_main_page()
    if not tracks:
        print("수집된 데이터가 없습니다.")
        sys.exit(1)

    # 2. DB 저장 (upsert)
    print(f"\nDB 저장 중... ({len(tracks)}트랙)")
    rows = [
        {
            "track_title": t["track_title"],
            "artist_name": t["artist_name"],
            "spotify_track_id": t["spotify_track_id"],
            "total_streams": t["total_streams"],
            "daily_streams": t["daily_streams"],
            "updated_at": date.today().isoformat(),
        }
        for t in tracks
        if t.get("spotify_track_id")  # ID 없는 트랙 제외
    ]

    stat_ids = upsert_stats(rows, args.dry_run)
    print(f"  저장 완료: {len(stat_ids)}개")

    # 3. 스냅샷 저장 (성장 곡선용)
    if stat_ids and not args.dry_run:
        # 상위 50개 트랙만 스냅샷 저장
        top_tracks = [t for t in tracks if t.get("spotify_track_id")][:50]
        id_map = {
            rows[i]["spotify_track_id"]: stat_ids[i]
            for i in range(min(len(rows), len(stat_ids)))
        }
        for t in top_tracks:
            sid = id_map.get(t["spotify_track_id"])
            if sid:
                save_snapshot(sid, t["total_streams"], args.dry_run)
        print(f"  스냅샷 저장: 상위 {len(top_tracks)}트랙")

    # 4. 마일스톤 수집 (선택)
    if args.milestones:
        milestone_targets = [t for t in tracks if t.get("spotify_track_id")]
        if args.top > 0:
            milestone_targets = milestone_targets[:args.top]
        milestone_targets = [t for t in milestone_targets if t["total_streams"] >= 100_000_000]

        print(f"\n마일스톤 수집 중... (100M+ 트랙: {len(milestone_targets)}개)")
        id_map = {
            rows[i]["spotify_track_id"]: stat_ids[i]
            for i in range(min(len(rows), len(stat_ids)))
        } if stat_ids else {}

        for idx, t in enumerate(milestone_targets, 1):
            sid = t["spotify_track_id"]
            print(f"  [{idx}/{len(milestone_targets)}] {t['artist_name']} — {t['track_title']}")
            milestones = scrape_track_milestones(sid)
            db_id = id_map.get(sid)
            if db_id and milestones:
                update_milestones(sid, db_id, milestones, args.dry_run)
                flags = []
                if milestones.get("days_to_100m") is not None:
                    flags.append(f"100M:{milestones['days_to_100m']}일")
                if milestones.get("days_to_500m") is not None:
                    flags.append(f"500M:{milestones['days_to_500m']}일")
                if milestones.get("days_to_1b") is not None:
                    flags.append(f"1B:{milestones['days_to_1b']}일")
                if flags:
                    print(f"    → {' / '.join(flags)}")
            time.sleep(0.5)  # 서버 부하 방지

    print("\n완료!")


if __name__ == "__main__":
    main()
