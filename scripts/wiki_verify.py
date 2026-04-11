"""
kcharted - Wikipedia vs kcharted API 정합성 검증 스크립트

Wikipedia K-pop Billboard 페이지를 크롤링해서
kcharted API 데이터와 비교, 불일치 리포트 출력.
"""

import re
import sys
import json
import unicodedata
import requests
from html.parser import HTMLParser

# ── 설정 ───────────────────────────────────────────────
KCHARTED_API = "https://kcharted.com/api"
# 로컬 테스트 시: KCHARTED_API = "http://localhost:3000/api"

WIKI_ALBUMS_URL = "https://en.wikipedia.org/wiki/List_of_K-pop_albums_on_the_Billboard_charts"
WIKI_SONGS_URL  = "https://en.wikipedia.org/wiki/List_of_K-pop_songs_on_the_Billboard_charts"

SUPABASE_URL = "https://hqoovxivfabnwfdjnuvs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxb292eGl2ZmFibndmZGpudXZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg2NzI2MiwiZXhwIjoyMDkwNDQzMjYyfQ.CG4MAGpOAeeBH6i8NvgOVi5sgO6PWQfmp_pgztP3_-w"

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# ── Wikipedia 파서 (섹션 헤딩 기반) ────────────────────
class WikiSectionParser(HTMLParser):
    """섹션 제목과 테이블을 매핑해서 파싱"""
    def __init__(self):
        super().__init__()
        self.section_tables: list[tuple[str, dict]] = []  # [(section, table), ...]
        self._cur_section = "Unknown"
        self._cur_table = None
        self._cur_row = []
        self._cur_cell = ""
        self._in_cell = False
        self._tag = None
        self._in_heading = False
        self._heading_text = ""

    def handle_starttag(self, tag, attrs):
        if tag in ("h2", "h3", "h4"):
            self._in_heading = True
            self._heading_text = ""
        elif tag == "table":
            self._cur_table = {"headers": [], "rows": []}
        elif tag in ("th", "td") and self._cur_table is not None:
            self._in_cell = True
            self._tag = tag
            self._cur_cell = ""
        elif tag == "br" and self._in_cell:
            self._cur_cell += " "

    def handle_endtag(self, tag):
        if tag in ("h2", "h3", "h4"):
            text = re.sub(r"\s+", " ", self._heading_text).strip()
            if text:
                self._cur_section = text
            self._in_heading = False
        elif tag == "table" and self._cur_table is not None:
            self.section_tables.append((self._cur_section, self._cur_table))
            self._cur_table = None
        elif tag in ("th", "td") and self._in_cell:
            text = re.sub(r"\s+", " ", self._cur_cell).strip()
            text = re.sub(r"\[\w+\]", "", text).strip()
            if self._tag == "th":
                self._cur_table["headers"].append(text)
            else:
                self._cur_row.append(text)
            self._in_cell = False
        elif tag == "tr" and self._cur_table is not None:
            if self._cur_row:
                self._cur_table["rows"].append(self._cur_row)
            self._cur_row = []

    def handle_data(self, data):
        if self._in_heading:
            self._heading_text += data
        elif self._in_cell:
            self._cur_cell += data


def fetch_wiki_table_by_section(url: str, section_keyword: str) -> dict | None:
    """섹션 제목에 keyword가 포함된 테이블 하나만 반환"""
    resp = requests.get(url, headers={"User-Agent": "kcharted-bot/1.0"}, timeout=15)
    resp.raise_for_status()
    parser = WikiSectionParser()
    parser.feed(resp.text)
    for section, table in parser.section_tables:
        if section_keyword.lower() in section.lower():
            return table
    return None


def clean_title(s: str) -> str:
    """따옴표, 괄호 주석, 공백 정리"""
    s = re.sub(r'[\""\u201c\u201d\u2018\u2019]', '', s)
    s = re.sub(r'\(.*?\)', '', s)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s


def clean_artist(s: str) -> str:
    s = re.sub(r'&amp;', '&', s)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s


def parse_peak(s: str) -> int | None:
    """'1(Total 4 weeks)' → 1,  '99' → 99"""
    m = re.match(r"(\d+)", s.strip())
    return int(m.group(1)) if m else None


def parse_weeks(s: str) -> int | None:
    """'20', '1 (R) 19' → 첫 번째 숫자"""
    m = re.match(r"(\d+)", s.strip())
    return int(m.group(1)) if m else None


# ── kcharted API 데이터 가져오기 ───────────────────────
def get_kcharted_hot100():
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/get_kpop_hot100_rankings",
                         headers=SB_HEADERS, json={}, timeout=15)
    resp.raise_for_status()
    # normalize 키로 저장해 위키와 동일 기준으로 비교
    return {normalize_artist(r["artist"]): r for r in resp.json()}


def get_kcharted_billboard200():
    resp = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/get_kpop_billboard200_rankings",
                         headers=SB_HEADERS, json={}, timeout=15)
    resp.raise_for_status()
    return {normalize_artist(r["artist"]): r for r in resp.json()}


# ── Wikipedia 데이터 파싱 ──────────────────────────────
def parse_wiki_rows(tbl: dict) -> list[dict]:
    """단일 테이블에서 행 추출 (열: chart_date, artist, title, peak, weeks)"""
    records = []
    if not tbl:
        return records

    headers = [h.lower() for h in tbl["headers"]]

    def col(keywords):
        for i, h in enumerate(headers):
            if any(k in h for k in keywords):
                return i
        return None

    i_artist = col(["artist"])
    i_title  = col(["song", "album", "title"])
    i_peak   = col(["peak"])
    i_weeks  = col(["week"])
    i_date   = col(["date"])

    if i_artist is None or i_title is None or i_peak is None:
        return records

    for row in tbl["rows"]:
        def get(idx):
            return row[idx].strip() if idx is not None and idx < len(row) else ""

        peak = parse_peak(get(i_peak))
        if peak is None:
            continue

        records.append({
            "artist": clean_artist(get(i_artist)),
            "title":  clean_title(get(i_title)),
            "peak":   peak,
            "weeks":  parse_weeks(get(i_weeks)),
            "date":   get(i_date) if i_date is not None else "",
        })
    return records


# ── 비교 로직 ──────────────────────────────────────────

# 위키 아티스트명 → kcharted DB 아티스트명 매핑 (소문자)
WIKI_TO_KCHARTED: dict[str, str] = {
    "txt": "tomorrow x together",
    "jungkook": "jung kook",
    "big bang": "bigbang",
    "suga (agust d)": "agust d",
    "agust d": "agust d",
    "juice wrld & suga": "agust d",
    "fifty fifty": "fifty fifty",
    "rosé": "rose",
    "rosé & bruno mars": "rose",
    "alex warren & rosé": "rose",
    "charlie puth feat. jungkook": "jung kook",
    "jungkook feat. latto": "jung kook",
    "jungkook & jack harlow": "jung kook",
    "the kid laroi, jungkook & central cee": "jung kook",
    "rm with youjeen": "rm",
    "megan thee stallion & rm": "rm",
    "jisoo & zayn malik": "jisoo & zayn",
    "jisoo & zayn": "jisoo & zayn",
    "jisoo": "jisoo & zayn",
    "wonder girls": "wonder girls",
    "girls' generation-tts": "girls' generation-tts",
    "jackson wang": "jackson wang",
    "le sserafim": "le sserafim",
    "dpr ian": "dpr ian",
    "s.coups x mingyu": "cxm: s.coups x mingyu",
    "dk x seungkwan": "dk x seungkwan",
    "monsta x": "monsta x",
    "stray kids": "stray kids",
    "huntrix, ejae, audrey nuna & rei ami": "katseye",
    "kpop demon hunters": "kpop demon hunters ost",
}

SEPARATORS_NORM = (" featuring ", " feat. ", " & ", " x ", " with ", " and ", ", ")

def normalize_artist(name: str) -> str:
    """위키 아티스트명 → kcharted 비교용 키로 정규화"""
    # 유니코드 정규화 (é vs É 등 합성/분해 차이 통일)
    low = unicodedata.normalize("NFC", name).lower().strip()

    # 1. 직접 매핑
    if low in WIKI_TO_KCHARTED:
        return WIKI_TO_KCHARTED[low].replace(" ", "-")

    # 2. 피처링 분리 후 K-pop 핵심 아티스트 추출
    kpop_keywords = [
        "bts", "blackpink", "stray kids", "twice", "enhypen", "newjeans",
        "ateez", "aespa", "le sserafim", "jimin", "jung kook", "j-hope",
        "jin", "psy", "illit", "nmixx", "katseye", "p1harmony",
        "wonder girls", "cl", "bigbang", "big bang", "girls' generation",
        "shinee", "exo", "got7", "monsta x", "nct 127", "nct dream",
        "super m", "tomorrow x together", "(g)i-dle", "ive", "itzy", "loona",
        "agust d", "rm", "rosé", "jisoo", "lisa", "jennie", "v",
        "jung kook", "jackson wang", "dpr ian", "fifty fifty",
        "le sserafim", "stray kids",
    ]
    for k in kpop_keywords:
        if k in low:
            return k.replace(" ", "-")

    return low.replace(" ", "-")


def check_albums(verbose=True):
    print("=" * 60)
    print("📀 Billboard 200 K-pop Albums 검증")
    print("=" * 60)

    tbl = fetch_wiki_table_by_section(WIKI_ALBUMS_URL, "Billboard 200")
    wiki_rows = parse_wiki_rows(tbl)
    kcharted = get_kcharted_billboard200()

    # Wikipedia 아티스트별 best peak 집계
    wiki_artists: dict[str, dict] = {}
    for r in wiki_rows:
        key = normalize_artist(r["artist"])
        if key not in wiki_artists:
            wiki_artists[key] = {"peak": r["peak"], "count": 1, "raw": r["artist"]}
        else:
            wiki_artists[key]["count"] += 1
            if r["peak"] < wiki_artists[key]["peak"]:
                wiki_artists[key]["peak"] = r["peak"]

    issues = []

    # 1. Wikipedia에 있지만 kcharted에 없는 아티스트
    for wiki_key, wiki_data in wiki_artists.items():
        found = wiki_key in kcharted
        if not found:
            issues.append({
                "type": "MISSING_IN_KCHARTED",
                "artist": wiki_data["raw"],
                "wiki_peak": wiki_data["peak"],
                "wiki_albums": wiki_data["count"],
            })

    _print_issues(issues, wiki_artists, kcharted, "albums")
    return issues


def check_songs(verbose=True):
    print()
    print("=" * 60)
    print("🎵 Billboard Hot 100 K-pop Songs 검증")
    print("=" * 60)

    tbl = fetch_wiki_table_by_section(WIKI_SONGS_URL, "Billboard Hot 100")
    wiki_rows = parse_wiki_rows(tbl)
    kcharted = get_kcharted_hot100()

    wiki_artists: dict[str, dict] = {}
    for r in wiki_rows:
        key = normalize_artist(r["artist"])
        if key not in wiki_artists:
            wiki_artists[key] = {"peak": r["peak"], "count": 1, "raw": r["artist"]}
        else:
            wiki_artists[key]["count"] += 1
            if r["peak"] < wiki_artists[key]["peak"]:
                wiki_artists[key]["peak"] = r["peak"]

    issues = []

    for wiki_key, wiki_data in wiki_artists.items():
        found = wiki_key in kcharted
        if not found:
            issues.append({
                "type": "MISSING_IN_KCHARTED",
                "artist": wiki_data["raw"],
                "wiki_peak": wiki_data["peak"],
                "wiki_songs": wiki_data["count"],
            })

    _print_issues(issues, wiki_artists, kcharted, "songs")
    return issues


FEAT_SEPS = (" featuring ", " feat.", " with ", " & ", " x ", ", ")

def is_featuring(artist_name: str) -> bool:
    low = artist_name.lower()
    return any(sep in low for sep in FEAT_SEPS)


def _print_issues(issues, wiki_artists, kcharted, kind):
    missing = [i for i in issues if i["type"] == "MISSING_IN_KCHARTED"]
    mismatches = [i for i in issues if i["type"] == "PEAK_MISMATCH"]

    # kcharted 아티스트 중 Feat. 제외한 단독 아티스트 수
    kcharted_solo = {k: v for k, v in kcharted.items() if not is_featuring(v["artist"])}

    print(f"\nWikipedia 아티스트 수: {len(wiki_artists)}")
    print(f"kcharted 아티스트 수:  {len(kcharted)}명 (Feat. 제외: {len(kcharted_solo)}명)")

    if missing:
        print(f"\n⚠️  kcharted 누락 아티스트 ({len(missing)}명):")
        for m in missing:
            cnt = m.get('wiki_albums') or m.get('wiki_songs', '?')
            print(f"  - {m['artist']} | wiki peak #{m['wiki_peak']} | {cnt} {kind}")
    else:
        print(f"\n✅ 누락 아티스트 없음")

    if mismatches:
        print(f"\n⚠️  Peak rank 불일치 ({len(mismatches)}건):")
        for m in mismatches:
            print(f"  - {m['artist']}: kcharted #{m['kcharted_peak']} vs wiki #{m['wiki_peak']} (차이: {m['diff']})")
    else:
        print(f"✅ Peak rank 불일치 없음")


# ── 메인 ──────────────────────────────────────────────
if __name__ == "__main__":
    output_json = "--json" in sys.argv

    album_issues = check_albums()
    song_issues  = check_songs()

    total = len(album_issues) + len(song_issues)
    print(f"\n{'=' * 60}")
    print(f"총 {total}건의 불일치 발견")

    if output_json:
        with open("wiki_verify_result.json", "w") as f:
            json.dump({"albums": album_issues, "songs": song_issues}, f, ensure_ascii=False, indent=2)
        print("결과 저장: wiki_verify_result.json")

    sys.exit(0 if total == 0 else 1)
