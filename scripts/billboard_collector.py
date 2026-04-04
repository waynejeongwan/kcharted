"""
kcharted - Billboard 차트 수집 스크립트 (GitHub Actions용)
Billboard Hot 100 / Billboard 200 → Supabase 저장
"""

import os
import time
import requests
import billboard
from datetime import date

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
def upsert_artist(name):
    existing = sb_get("artists", {"name": f"eq.{name}", "select": "id"})
    if existing:
        return existing[0]["id"]
    return sb_post("artists", {"name": name})[0]["id"]

def upsert_track(title, artist_id, is_album=False):
    existing = sb_get("tracks", {"title": f"eq.{title}", "artist_id": f"eq.{artist_id}", "select": "id"})
    if existing:
        return existing[0]["id"]
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
