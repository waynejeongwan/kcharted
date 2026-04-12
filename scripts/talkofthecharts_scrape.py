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
import subprocess
import time
from datetime import date, timedelta

import io
import requests
from PIL import Image

# ── 설정 ──────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://hqoovxivfabnwfdjnuvs.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
GEMINI_KEY     = os.environ.get("GEMINI_API_KEY", "")
ANTHROPIC_KEY  = os.environ.get("ANTHROPIC_API_KEY", "")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

X_PROFILE_URL = "https://x.com/talkofthecharts"
CHROME_LOAD_WAIT = 10  # 페이지 로딩 대기 초

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


# ── 이미지 URL 탐색 (Chrome AppleScript) ─────────────────
def find_prediction_image_url() -> str | None:
    """
    로컬 Chrome(로그인 상태)으로 X 페이지를 열고
    AppleScript + JS로 최신 트윗 이미지 URL을 추출.
    macOS 전용. Chrome에서 보기 > 개발자 > Apple Events의 자바스크립트 허용 필요.
    """
    # X 탭 찾기 → 없으면 새로 열기, 있으면 포커스 후 새로고침
    focus_or_open = (
        'tell application "Google Chrome"\n'
        '  set found to false\n'
        '  repeat with w in windows\n'
        '    repeat with t in tabs of w\n'
        f'      if URL of t contains "x.com/talkofthecharts" then\n'
        '        set active tab index of w to tab index of t\n'
        '        set index of w to 1\n'
        '        reload t\n'
        '        set found to true\n'
        '        exit repeat\n'
        '      end if\n'
        '    end repeat\n'
        '    if found then exit repeat\n'
        '  end repeat\n'
        '  if not found then\n'
        f'    open location "{X_PROFILE_URL}"\n'
        '  end if\n'
        'end tell'
    )
    subprocess.run(["osascript", "-e", focus_or_open], capture_output=True)
    print(f"  X 탭 로딩 대기 {CHROME_LOAD_WAIT}초...")
    time.sleep(CHROME_LOAD_WAIT)

    # X 탭을 직접 찾아서 JS 실행
    js = (
        "(function(){"
        "var imgs=Array.from(document.querySelectorAll('article img'))"
        ".map(function(i){return i.src;})"
        ".filter(function(s){return s.indexOf('pbs.twimg.com/media')>=0;})"
        ".map(function(s){return s.replace(/name=[^&]+/,'name=large');});"
        "var unique=[...new Set(imgs)];"
        "return JSON.stringify(unique.slice(0,5));"
        "})()"
    )
    applescript = (
        'tell application "Google Chrome"\n'
        '  repeat with w in windows\n'
        '    repeat with t in tabs of w\n'
        '      if URL of t contains "x.com/talkofthecharts" then\n'
        f'        set r to execute t javascript "{js}"\n'
        '        return r\n'
        '      end if\n'
        '    end repeat\n'
        '  end repeat\n'
        '  return ""\n'
        'end tell'
    )
    result = subprocess.run(["osascript", "-e", applescript], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [오류] AppleScript 실패: {result.stderr.strip()}")
        return None

    raw = result.stdout.strip()
    if not raw:
        print("  [경고] 이미지 없음 — 페이지가 아직 로드 중이거나 X 로그인 필요")
        return None

    try:
        imgs = json.loads(raw)
    except json.JSONDecodeError:
        print(f"  [오류] JSON 파싱 실패: {raw[:100]}")
        return None

    if not imgs:
        print("  [경고] 트윗 이미지를 찾지 못함")
        return None

    print(f"  이미지 {len(imgs)}개 발견, 첫 번째 사용: {imgs[0]}")
    return imgs[0]


# ── Claude Vision으로 차트 추출 ──────────────────────────
def extract_chart_with_claude(image_url: str) -> list[dict]:
    """
    Anthropic Claude Vision API로 이미지에서 차트 추출.
    반환: [{"rank": 1, "title": "...", "artist": "..."}]
    """
    if not ANTHROPIC_KEY:
        raise EnvironmentError("ANTHROPIC_API_KEY 환경변수가 필요합니다.")

    # 이미지 다운로드
    img_resp = requests.get(image_url, headers={"User-Agent": "kcharted-bot/1.0"}, timeout=30)
    img_resp.raise_for_status()
    img_b64 = base64.standard_b64encode(img_resp.content).decode()
    content_type = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()

    prompt = (
        "This image shows a Billboard Hot 100 prediction chart. "
        "Extract all visible song entries and return ONLY a JSON array — no explanation, no markdown. "
        'Format: [{"rank": 1, "title": "Song Title", "artist": "Artist Name"}, ...] '
        "Include every entry visible. If rank is missing, infer from position."
    )

    payload = {
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 3000,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": content_type, "data": img_b64},
                },
                {"type": "text", "text": prompt},
            ],
        }],
    }

    api_resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    api_resp.raise_for_status()

    content = api_resp.json()["content"][0]["text"].strip()
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

    entries = extract_chart_with_claude(image_url)
    print(f"  추출: {len(entries)}건 / K-pop: {sum(1 for e in entries if is_kpop(e['artist']))}건\n")

    if not entries:
        print("추출 결과 없음. 이미지 URL을 확인하세요.")
        sys.exit(1)

    save_to_db(entries, stage, chart_date, image_url, args.dry_run)
    print("\n완료!")


if __name__ == "__main__":
    main()
