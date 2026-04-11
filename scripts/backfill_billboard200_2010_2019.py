"""
kcharted - Billboard 200 히스토리컬 데이터 백필 스크립트
2010년 1월 ~ 2019년 12월 주간 차트를 Supabase에 저장
"""

import os
import sys
import time
import requests
import billboard
from datetime import date, timedelta

# ── 설정 (환경변수) ────────────────────────────────────
#SUPABASE_URL = os.environ["SUPABASE_URL"]
#SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SUPABASE_URL = "https://hqoovxivfabnwfdjnuvs.supabase.co"
SUPABASE_KEY = "sb_publishable_CrRpudFHAa2Sh5SlckI8tA_njNc-ju0"

BB_CHART_NAME = "billboard-200"
CHART_SLUG    = "billboard-200"

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

def upsert_track(title, artist_id, is_album=True):
    existing = sb_get("tracks", {"title": f"ilike.{title}", "artist_id": f"eq.{artist_id}", "select": "id,is_album"})
    if existing:
        track_id = existing[0]["id"]
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

def date_already_stored(chart_id, chart_date_str):
    """해당 날짜의 데이터가 이미 DB에 있는지 확인 (rank=1 체크)"""
    rows = sb_get("chart_entries", {
        "chart_id": f"eq.{chart_id}",
        "chart_date": f"eq.{chart_date_str}",
        "rank": "eq.1",
        "select": "id",
    })
    return len(rows) > 0

# ── 주간 날짜 생성 ────────────────────────────────────
def weekly_dates(start: date, end: date):
    """start부터 end까지 7일 간격 날짜 리스트 반환"""
    dates = []
    current = start
    while current <= end:
        dates.append(current)
        current += timedelta(weeks=1)
    return dates

# ── 메인 ──────────────────────────────────────────────
def backfill(start_date: date, end_date: date, delay: float = 3.0, skip_existing: bool = True):
    chart_id = get_chart_id(CHART_SLUG)
    weeks = weekly_dates(start_date, end_date)
    total = len(weeks)

    print(f"[kcharted] Billboard 200 백필 시작")
    print(f"  기간: {start_date} ~ {end_date}")
    print(f"  총 {total}주 처리 예정\n")

    seen_dates = set()  # billboard API가 반환하는 실제 날짜 기준 중복 방지
    success = 0
    skipped = 0
    failed = 0

    for i, query_date in enumerate(weeks, 1):
        print(f"[{i:3}/{total}] 요청 날짜: {query_date}", end=" ... ", flush=True)

        try:
            chart = billboard.ChartData(BB_CHART_NAME, date=str(query_date))
        except Exception as e:
            print(f"❌ 수집 실패: {e}")
            failed += 1
            time.sleep(delay)
            continue

        actual_date = str(chart.date) if chart.date else str(query_date)

        if actual_date in seen_dates:
            print(f"건너뜀 (중복 날짜 {actual_date})")
            skipped += 1
            time.sleep(delay)
            continue
        seen_dates.add(actual_date)

        if skip_existing and date_already_stored(chart_id, actual_date):
            print(f"건너뜀 (이미 저장됨 {actual_date})")
            skipped += 1
            time.sleep(delay)
            continue

        print(f"저장 중 ({actual_date}, {len(chart)}곡)")

        for entry in chart:
            try:
                artist_id = upsert_artist(entry.artist)
                track_id  = upsert_track(entry.title, artist_id, is_album=True)
                sb_upsert("chart_entries", {
                    "chart_id": chart_id,
                    "track_id": track_id,
                    "rank": entry.rank,
                    "chart_date": actual_date,
                }, "chart_id,chart_date,rank")
            except Exception as e:
                print(f"    ⚠️ {entry.rank}위 저장 실패: {e}")

        success += 1
        time.sleep(delay)

    print(f"\n✅ 완료: {success}주 저장, {skipped}주 건너뜀, {failed}주 실패")


if __name__ == "__main__":
    # 인자: [start_date] [end_date] [delay_seconds]
    # 예) python backfill_billboard200_2010_2019.py 2010-01-01 2019-12-31 3
    start = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date(2010, 1, 1)
    end   = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date(2019, 12, 31)
    delay = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0

    backfill(start, end, delay=delay)
