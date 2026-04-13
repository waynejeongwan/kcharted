"""
kcharted - Talk of the Charts 예측 데이터 수집 스크립트

talkofthecharts X(@talkofthecharts) 계정에서 최신 Hot 100 예측 이미지를 가져와
Claude Vision API로 텍스트 추출 후 Supabase에 저장.

사용:
  python scripts/talkofthecharts_scrape.py
  python scripts/talkofthecharts_scrape.py --url https://... (이미지 URL 직접 지정)
  python scripts/talkofthecharts_scrape.py --dry-run        (저장 없이 파싱 결과만 출력)

필요 환경변수:
  SUPABASE_URL        Supabase 프로젝트 URL
  SUPABASE_KEY        Supabase service_role key
  ANTHROPIC_API_KEY   Claude API 키
  NOTIFY_EMAIL        결과 수신 이메일 (선택)
  GMAIL_ADDRESS       발신 Gmail 주소 (선택, 이메일 발송 시 필요)
  GMAIL_APP_PASSWORD  Gmail 앱 비밀번호 (선택, 이메일 발송 시 필요)

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
import smtplib
import traceback
import tempfile
from datetime import date, timedelta
from difflib import SequenceMatcher
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import requests
from PIL import Image
import io

# ── 설정 ──────────────────────────────────────────────────
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "https://hqoovxivfabnwfdjnuvs.supabase.co").strip()
SUPABASE_KEY   = os.environ.get("SUPABASE_KEY", "").strip()
ANTHROPIC_KEY  = os.environ.get("ANTHROPIC_API_KEY", "").strip()
NOTIFY_EMAIL   = os.environ.get("NOTIFY_EMAIL", "jeongwan@gmail.com").strip()
GMAIL_ADDRESS  = os.environ.get("GMAIL_ADDRESS", "").strip()
GMAIL_APP_PW   = os.environ.get("GMAIL_APP_PASSWORD", "").strip()

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

X_PROFILE_URL  = "https://x.com/talkofthecharts"
CHROME_LOAD_WAIT = 10   # 페이지 로딩 대기 초
APPLESCRIPT_RETRIES = 3  # AppleScript 재시도 횟수

KPOP_ARTISTS_CACHE: set[str] = set()

# 실행 로그 (이메일 발송용)
_log_lines: list[str] = []

def log(msg: str):
    print(msg)
    _log_lines.append(msg)


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
            log(f"  K-pop 아티스트 {len(KPOP_ARTISTS_CACHE)}명 로드")
    except Exception as e:
        log(f"  [경고] K-pop 아티스트 로드 실패: {e}")


def is_kpop(artist: str) -> bool:
    return artist.lower() in KPOP_ARTISTS_CACHE


# ── 이미지 URL + 트윗 텍스트 탐색 (Chrome AppleScript) ───
def find_prediction_tweet() -> dict | None:
    """
    로컬 Chrome으로 X 페이지를 열고 AppleScript + JS로
    최신 트윗의 텍스트와 첫 번째 이미지 URL을 추출.
    반환: {"text": "...", "image_url": "https://..."}
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
    log(f"  X 탭 로딩 대기 {CHROME_LOAD_WAIT}초...")
    time.sleep(CHROME_LOAD_WAIT)

    # JS를 임시 파일에 저장한 뒤 AppleScript에서 파일을 읽어 실행
    # → AppleScript 문자열 내 이스케이프 문제 완전 회피
    js_code = """\
(function(){
  var articles = Array.from(document.querySelectorAll('article'));
  var result = [];
  for (var i = 0; i < Math.min(5, articles.length); i++) {
    var a = articles[i];
    var imgs = Array.from(a.querySelectorAll('img'))
      .map(function(x){ return x.src; })
      .filter(function(s){ return s.indexOf('pbs.twimg.com/media') >= 0; })
      .map(function(s){ return s.replace(/name=[^&]+/, 'name=orig'); });
    var unique = Array.from(new Set(imgs));
    if (unique.length === 0) continue;
    var testid = 'tweetText';
    var textEl = a.querySelector('[data-testid="' + testid + '"]');
    var text = textEl ? textEl.innerText : '';
    result.push({text: text, images: unique});
  }
  return JSON.stringify(result.slice(0, 3));
})()"""

    js_tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8')
    js_tmp.write(js_code)
    js_tmp.close()
    js_path = js_tmp.name

    # AppleScript: JS 파일을 읽어서 execute javascript로 실행
    applescript = f'''\
set jsFile to open for access POSIX file "{js_path}"
set jsCode to read jsFile
close access jsFile
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "x.com/talkofthecharts" then
        set r to execute t javascript jsCode
        return r
      end if
    end repeat
  end repeat
  return ""
end tell'''

    for attempt in range(1, APPLESCRIPT_RETRIES + 1):
        result = subprocess.run(["osascript", "-e", applescript], capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            break
        log(f"  [시도 {attempt}/{APPLESCRIPT_RETRIES}] AppleScript 실패: {result.stderr.strip()[:100]}")
        if attempt < APPLESCRIPT_RETRIES:
            log(f"  {5 * attempt}초 후 재시도...")
            time.sleep(5 * attempt)

    try:
        os.unlink(js_path)
    except Exception:
        pass

    if result.returncode != 0 or not result.stdout.strip():
        return None

    raw = result.stdout.strip()
    try:
        tweets = json.loads(raw)
    except json.JSONDecodeError:
        log(f"  [오류] JSON 파싱 실패: {raw[:100]}")
        return None

    if not tweets:
        log("  [경고] 이미지 있는 트윗을 찾지 못함")
        return None

    tweet = tweets[0]
    images = tweet.get("images", [])
    if not images:
        return None

    # 첫 번째 이미지만 사용 (4장 중 1~25위 이미지)
    image_url = images[0]
    tweet_text = tweet.get("text", "")

    log(f"  트윗 텍스트: {tweet_text[:100]}")
    log(f"  이미지 {len(images)}장 발견, 첫 번째 사용: {image_url}")
    return {"text": tweet_text, "image_url": image_url}


# ── Claude Vision으로 차트 추출 ──────────────────────────
def extract_chart_with_claude(image_url: str, tweet_text: str = "") -> tuple[list[dict], str | None, str | None]:
    """
    Anthropic Claude Vision API로 이미지 + 트윗 텍스트에서 차트 + 메타데이터 추출.
    반환: (entries, stage, chart_date)
    """
    if not ANTHROPIC_KEY:
        raise EnvironmentError("ANTHROPIC_API_KEY 환경변수가 필요합니다.")

    img_resp = requests.get(image_url, headers={"User-Agent": "kcharted-bot/1.0"}, timeout=30)
    img_resp.raise_for_status()
    img_b64 = base64.standard_b64encode(img_resp.content).decode()
    content_type = img_resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()

    tweet_hint = f'\n\nTweet text for context: "{tweet_text}"' if tweet_text else ""

    prompt = (
        "This image shows a Billboard Hot 100 prediction chart (typically ranks 1-25).{tweet_hint}\n\n"
        "1. Determine the stage and chart_date:\n"
        "   - Look for 'Early', 'Midweek', or 'Final' in the image title or tweet text → stage=early/midweek/final\n"
        "   - Find the chart date (e.g. 'April 18th, 2026') → chart_date in YYYY-MM-DD format\n"
        "2. Extract ALL visible song entries (rank + title + artist).\n"
        "Return ONLY a JSON object — no explanation, no markdown.\n"
        'Format: {{"stage": "final", "chart_date": "2026-04-18", "entries": [{{"rank": 1, "title": "Song Title", "artist": "Artist Name"}}, ...]}}'
    ).format(tweet_hint=tweet_hint)

    payload = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 3000,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": content_type, "data": img_b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    }

    api_resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json=payload,
        timeout=60,
    )
    api_resp.raise_for_status()

    content = api_resp.json()["content"][0]["text"].strip()
    content = re.sub(r"^```(?:json)?\s*", "", content)
    content = re.sub(r"\s*```$", "", content)

    parsed = json.loads(content)
    stage = parsed.get("stage")
    chart_date = parsed.get("chart_date")
    entries = [
        {
            "rank": int(e["rank"]),
            "title": str(e.get("title", "")).strip(),
            "artist": str(e.get("artist", "")).strip(),
        }
        for e in parsed.get("entries", [])
        if e.get("rank") and e.get("title")
    ]
    # 상위 20위까지만 저장
    entries = [e for e in entries if e["rank"] <= 20]
    return entries, stage, chart_date


# ── 최신 Hot 100 기반 아티스트명 보정 ────────────────────────
def load_latest_hot100() -> dict[str, str]:
    """
    Supabase에서 가장 최근 Billboard Hot 100 데이터를 조회해
    {title_lower: artist_name} 딕셔너리 반환.
    """
    try:
        # 최신 chart_date 조회
        charts_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/charts",
            headers=SB_HEADERS,
            params={"slug": "eq.billboard-hot-100", "select": "id", "limit": "1"},
            timeout=10,
        )
        if not charts_resp.ok or not charts_resp.json():
            return {}
        chart_id = charts_resp.json()[0]["id"]

        latest_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/chart_entries",
            headers=SB_HEADERS,
            params={"chart_id": f"eq.{chart_id}", "select": "chart_date", "order": "chart_date.desc", "limit": "1"},
            timeout=10,
        )
        if not latest_resp.ok or not latest_resp.json():
            return {}
        latest_date = latest_resp.json()[0]["chart_date"]

        # 해당 날짜 전체 차트 (track_id 포함)
        entries_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/chart_entries",
            headers=SB_HEADERS,
            params={"chart_id": f"eq.{chart_id}", "chart_date": f"eq.{latest_date}", "select": "track_id", "limit": "100"},
            timeout=10,
        )
        if not entries_resp.ok:
            return {}
        track_ids = [e["track_id"] for e in entries_resp.json()]
        if not track_ids:
            return {}

        tracks_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/tracks",
            headers=SB_HEADERS,
            params={"id": f"in.({','.join(str(t) for t in track_ids)})", "select": "title,artist_id", "limit": "100"},
            timeout=10,
        )
        if not tracks_resp.ok:
            return {}
        tracks = tracks_resp.json()

        artist_ids = list({t["artist_id"] for t in tracks})
        artists_resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/artists",
            headers=SB_HEADERS,
            params={"id": f"in.({','.join(str(a) for a in artist_ids)})", "select": "id,name", "limit": "200"},
            timeout=10,
        )
        if not artists_resp.ok:
            return {}
        artist_map = {a["id"]: a["name"] for a in artists_resp.json()}

        result = {}
        for t in tracks:
            title_key = t["title"].strip().lower()
            artist_name = artist_map.get(t["artist_id"], "")
            if title_key and artist_name:
                result[title_key] = artist_name

        print(f"  Hot 100 참조 데이터 로드: {len(result)}곡 ({latest_date})")
        return result

    except Exception as e:
        print(f"  [경고] Hot 100 참조 데이터 로드 실패: {e}")
        return {}


def title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def correct_artists(entries: list[dict], hot100_lookup: dict[str, str]) -> list[dict]:
    """
    추출된 entries의 아티스트명을 최신 Hot 100 데이터로 보정.
    제목 유사도 50% 이상인 경우에만 보정.
    """
    if not hot100_lookup:
        return entries

    corrected = []
    for e in entries:
        title = e["title"].strip()
        best_score = 0.0
        best_artist = None
        best_match_title = None

        for ref_title, ref_artist in hot100_lookup.items():
            score = title_similarity(title, ref_title)
            if score > best_score:
                best_score = score
                best_artist = ref_artist
                best_match_title = ref_title

        if best_score >= 0.5 and best_artist and best_artist != e["artist"]:
            log(f"  [보정] #{e['rank']} '{title}': '{e['artist']}' → '{best_artist}' (유사도 {best_score:.0%}, 참조: '{best_match_title}')")
            e = {**e, "artist": best_artist}
        corrected.append(e)

    return corrected


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
        log(f"\n[DRY RUN] 저장 예정 ({len(rows)}건):")
        for r in rows:
            kpop_flag = "🇰🇷" if r["is_kpop"] else "  "
            log(f"  {r['rank']:3}. {kpop_flag} {r['artist']} — {r['title']}")
        return

    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/hot100_predictions",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        params={"on_conflict": "chart_date,stage,rank"},
        json=rows,
        timeout=30,
    )
    if resp.ok:
        log(f"  ✅ {len(rows)}건 저장 (stage={stage}, chart_date={chart_date})")
    else:
        log(f"  ❌ 저장 실패: {resp.status_code} {resp.text}")


# ── 이메일 발송 ───────────────────────────────────────────
def send_email(subject: str, body: str):
    if not GMAIL_ADDRESS or not GMAIL_APP_PW or not NOTIFY_EMAIL:
        return
    try:
        msg = MIMEMultipart()
        msg["From"] = GMAIL_ADDRESS
        msg["To"] = NOTIFY_EMAIL
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as smtp:
            smtp.login(GMAIL_ADDRESS, GMAIL_APP_PW)
            smtp.send_message(msg)
        print(f"  📧 결과 메일 발송: {NOTIFY_EMAIL}")
    except Exception as e:
        print(f"  [경고] 메일 발송 실패: {e}")


# ── 메인 ─────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Talk of the Charts 예측 수집")
    parser.add_argument("--url", help="이미지 URL 직접 지정")
    parser.add_argument("--tweet-text", default="", help="트윗 텍스트 직접 지정")
    parser.add_argument("--dry-run", action="store_true", help="저장 없이 결과만 출력")
    parser.add_argument("--stage", choices=["early", "midweek", "final"], help="단계 강제 지정")
    parser.add_argument("--chart-date", help="대상 날짜 YYYY-MM-DD")
    args = parser.parse_args()

    log("=== Talk of the Charts 예측 수집 ===\n")

    success = False
    error_msg = ""

    try:
        if args.stage and args.chart_date:
            stage = args.stage
            chart_date = date.fromisoformat(args.chart_date)
        else:
            stage, chart_date = get_stage_and_chart_date()

        log(f"  단계: {stage}  |  예측 대상: {chart_date} (월요일 공식 발표)")

        if not args.dry_run:
            load_kpop_artists()

        # 이미지 URL 결정
        image_url = args.url
        tweet_text = args.tweet_text

        if not image_url:
            log("\n사이트에서 이미지 탐색 중...")
            tweet = find_prediction_tweet()
            if not tweet:
                raise RuntimeError("이미지를 찾을 수 없습니다. --url 옵션으로 직접 지정하세요.")
            image_url = tweet["image_url"]
            tweet_text = tweet["text"]

        log(f"\n이미지: {image_url}")
        log("Claude로 차트 추출 중...")

        entries, img_stage, img_chart_date = extract_chart_with_claude(image_url, tweet_text)

        # 이미지/트윗에서 추출한 stage/chart_date 우선 사용
        if img_stage and img_chart_date:
            log(f"  이미지 기준: stage={img_stage}, chart_date={img_chart_date}")
            stage = img_stage
            chart_date = date.fromisoformat(img_chart_date)
        else:
            log(f"  이미지에서 메타데이터 추출 실패 — 날짜 계산값 사용: stage={stage}, chart_date={chart_date}")

        # 이미지 로컬 저장
        img_dir = os.path.join(os.path.dirname(__file__), "..", "data", "prediction-images")
        os.makedirs(img_dir, exist_ok=True)
        img_filename = f"{chart_date}_{stage}.jpg"
        img_path = os.path.join(img_dir, img_filename)
        img_bytes = requests.get(image_url, headers={"User-Agent": "kcharted-bot/1.0"}, timeout=30).content
        with open(img_path, "wb") as f:
            f.write(img_bytes)
        log(f"  이미지 저장: data/prediction-images/{img_filename}")

        if not entries:
            raise RuntimeError("추출 결과 없음. 이미지 URL을 확인하세요.")

        # 최신 Hot 100 데이터로 아티스트명 보정
        log("Hot 100 참조 데이터로 아티스트명 보정 중...")
        hot100_lookup = load_latest_hot100()
        entries = correct_artists(entries, hot100_lookup)

        kpop_count = sum(1 for e in entries if is_kpop(e['artist']))
        log(f"  추출: {len(entries)}건 / K-pop: {kpop_count}건\n")

        save_to_db(entries, stage, chart_date, image_url, args.dry_run)
        log("\n완료!")
        success = True

    except Exception as e:
        error_msg = traceback.format_exc()
        log(f"\n[오류] {e}")
        log(error_msg)

    finally:
        # 이메일 발송
        body = "\n".join(_log_lines)
        if success:
            subject = f"[kcharted] ✅ Talk of the Charts 수집 완료 ({date.today()})"
        else:
            subject = f"[kcharted] ❌ Talk of the Charts 수집 실패 ({date.today()})"
        send_email(subject, body)

        if not success:
            sys.exit(1)


if __name__ == "__main__":
    main()
