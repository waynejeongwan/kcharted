"""
kcharted - Talk of the Charts 예측 데이터 수집 스크립트

talkofthecharts.com 에서 최신 Hot 100 예측 이미지를 가져와
Google Gemini API(무료)로 텍스트 추출 후 Supabase에 저장.

사용:
  python scripts/talkofthecharts_scrape.py
  python scripts/talkofthecharts_scrape.py --url https://... (이미지 URL 직접 지정)
  python scripts/talkofthecharts_scrape.py --dry-run        (저장 없이 파싱 결과만 출력)

필요 환경변수:
  SUPABASE_URL      Supabase 프로젝트 URL
  SUPABASE_KEY      Supabase service_role key
  GEMINI_API_KEY    Google AI Studio API 키 (무료: aistudio.google.com)

예측 단계 (D = 공식 발표 월요일):
  early   : 월(D-7) · 화(D-6)  — 초반 데이터
  midweek : 수(D-5) · 목(D-4)  — 중간
  final   : 토(D-2) · 일(D-1)  — 거의 확정
"""

import os
import re
import sys
import json
import base64
import argparse
from datetime import date, timedelta

import requests
from bs4 import BeautifulSoup

# ── 설정 ──────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hqoovxivfabnwfdjnuvs.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
GEMINI_KEY   = os.environ.get("GEMINI_API_KEY", "")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

TALKOFTHECHARTS_URL = "https://www.talkofthecharts.com"

KPOP_ARTISTS_CACHE: set[str] = set()


# ── 날짜 / 단계 계산 ──────────────────────────────────────
def get_stage_and_chart_date(today: date | None = None) -> tuple[str, date]:
    if today is None:
        today = date.today()
    weekday = today.weekday()  # 0=월 ~ 6=일

    days_until_monday = (7 - weekday) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    chart_date = today + timedelta(days=days_until_monday)

    if weekday in (0, 1):
        stage = "early"
    elif weekday in (2, 3):
        stage = "midweek"
    elif weekday in (5, 6):
        stage = "final"
    else:
        stage = "midweek"

    return stage, chart_date


# ── K-pop 여부 판단 ───────────────────────────────────────
def load_kpop_artists():
    global KPOP_ARTISTS_CACHE
    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/artists",
            headers=SB_HEADERS,
            params={"is_kpop": "eq.true", "select": "name", "limit": 5000},
            timeout=15,
        )
        if resp.ok:
            KPOP_ARTISTS_CACHE = {r["name"].lower() for r in resp.json()}
            print(f"  K-pop 아티스트 {len(KPOP_ARTISTS_CACHE)}명 로드")
    except Exception as e:
        print(f"  [경고] K-pop 아티스트 로드 실패: {e}")


def is_kpop(artist: str) -> bool:
    return artist.lower() in KPOP_ARTISTS_CACHE


# ── 이미지 URL 탐색 ───────────────────────────────────────
def find_prediction_image_url() -> str | None:
    """talkofthecharts.com에서 최신 예측 이미지 URL 탐색"""
    try:
        resp = requests.get(
            TALKOFTHECHARTS_URL,
            headers={"User-Agent": "kcharted-bot/1.0"},
            timeout=15,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        for img in soup.find_all("img"):
            src = img.get("src", "") or img.get("data-src", "")
            if src and any(kw in src.lower() for kw in ["hot100", "hot-100", "prediction", "predict", "chart"]):
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = TALKOFTHECHARTS_URL + src
                print(f"  이미지 발견: {src}")
                return src

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if any(href.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                if href.startswith("/"):
                    href = TALKOFTHECHARTS_URL + href
                if any(kw in href.lower() for kw in ["hot100", "prediction", "chart"]):
                    print(f"  링크 이미지 발견: {href}")
                    return href

        print("  [경고] 자동 이미지 탐색 실패 — --url 옵션으로 직접 지정하세요")
        return None

    except Exception as e:
        print(f"  [오류] 사이트 접속 실패: {e}")
        return None


# ── Gemini Vision으로 차트 추출 ───────────────────────────
def extract_chart_with_gemini(image_url: str) -> list[dict]:
    """
    Google Gemini 1.5 Flash (무료) Vision API로 이미지에서 차트 추출.
    무료 한도: 15 req/min, 1M tokens/day — 주 3회 용도로 충분.
    반환: [{"rank": 1, "title": "...", "artist": "..."}]
    """
    if not GEMINI_KEY:
        raise EnvironmentError("GEMINI_API_KEY 환경변수가 필요합니다. (aistudio.google.com에서 무료 발급)")

    # 이미지 다운로드
    img_resp = requests.get(image_url, headers={"User-Agent": "kcharted-bot/1.0"}, timeout=30)
    img_resp.raise_for_status()
    content_type = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
    img_b64 = base64.standard_b64encode(img_resp.content).decode()

    prompt = (
        "This image shows a Billboard Hot 100 prediction chart. "
        "Extract all visible song entries and return ONLY a JSON array — no explanation, no markdown. "
        'Format: [{"rank": 1, "title": "Song Title", "artist": "Artist Name"}, ...] '
        "Include every entry visible. If rank is missing, infer from position."
    )

    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": content_type, "data": img_b64}},
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 3000},
    }

    api_resp = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_KEY}",
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    api_resp.raise_for_status()

    result = api_resp.json()
    content = result["candidates"][0]["content"]["parts"][0]["text"].strip()

    # 마크다운 코드블록 제거
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

    entries = json.loads(content)
    return [
        {
            "rank": int(e["rank"]),
            "title": str(e.get("title", "")).strip(),
            "artist": str(e.get("artist", "")).strip(),
        }
        for e in entries
        if e.get("rank") and e.get("title")
    ]


# ── Supabase 저장 ──────────────────────────────────────────
def save_to_db(entries: list[dict], stage: str, chart_date: date, image_url: str | None, dry_run: bool):
    rows = [
        {
            "source": "talkofthecharts",
            "stage": stage,
            "chart_date": chart_date.isoformat(),
            "rank": e["rank"],
            "title": e["title"],
            "artist": e["artist"],
            "is_kpop": is_kpop(e["artist"]),
            "image_url": image_url,
        }
        for e in entries
    ]

    if dry_run:
        print(f"\n[DRY RUN] 저장 예정 ({len(rows)}건):")
        for r in rows:
            kpop_flag = "🇰🇷" if r["is_kpop"] else "  "
            print(f"  {r['rank']:3}. {kpop_flag} {r['artist']} — {r['title']}")
        return

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/hot100_predictions",
        headers=SB_HEADERS,
        json=rows,
        timeout=30,
    )
    if resp.ok:
        print(f"  ✅ {len(rows)}건 저장 (stage={stage}, chart_date={chart_date})")
    else:
        print(f"  ❌ 저장 실패: {resp.status_code} {resp.text}")


# ── 메인 ─────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Talk of the Charts 예측 수집")
    parser.add_argument("--url", help="이미지 URL 직접 지정")
    parser.add_argument("--dry-run", action="store_true", help="저장 없이 결과만 출력")
    parser.add_argument("--stage", choices=["early", "midweek", "final"], help="단계 강제 지정")
    parser.add_argument("--chart-date", help="대상 날짜 YYYY-MM-DD")
    args = parser.parse_args()

    print("=== Talk of the Charts 예측 수집 ===\n")

    if args.stage and args.chart_date:
        stage = args.stage
        chart_date = date.fromisoformat(args.chart_date)
    else:
        stage, chart_date = get_stage_and_chart_date()

    print(f"  단계: {stage}  |  예측 대상: {chart_date} (월요일 공식 발표)")

    if not args.dry_run:
        load_kpop_artists()

    # 이미지 URL 결정
    image_url = args.url
    if not image_url:
        print("\n사이트에서 이미지 탐색 중...")
        image_url = find_prediction_image_url()
        if not image_url:
            print("이미지를 찾을 수 없습니다. --url 옵션으로 직접 지정하세요.")
            sys.exit(1)

    print(f"\n이미지: {image_url}")
    print("Gemini로 차트 추출 중...")

    entries = extract_chart_with_gemini(image_url)
    print(f"  추출: {len(entries)}건 / K-pop: {sum(1 for e in entries if is_kpop(e['artist']))}건\n")

    if not entries:
        print("추출 결과 없음. 이미지 URL을 확인하세요.")
        sys.exit(1)

    save_to_db(entries, stage, chart_date, image_url, args.dry_run)
    print("\n완료!")


if __name__ == "__main__":
    main()
