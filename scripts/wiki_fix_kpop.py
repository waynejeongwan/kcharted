"""
kcharted - Wikipedia K-pop 아티스트 DB 수정 스크립트

Wikipedia K-pop Billboard 페이지에서 아티스트명을 추출해
DB에서 is_kpop=True 로 업데이트 (누락 수정).

로직:
  - 단독 아티스트명: DB에서 찾아 is_kpop=True
  - 복합 이름 ("A feat. B", "A & B"):
      1. 전체 이름 그대로 DB 검색 → 있으면 is_kpop=True
      2. 파트 분리 후, 각 파트를 DB 검색
         → 이미 is_kpop=True 인 경우만 유지 (비K팝 피처링 아티스트 오염 방지)
         → is_kpop=False/NULL 이면 '모름' 상태로 두고 후보 리스트만 출력
"""

import re
import sys
import time
import requests
from html.parser import HTMLParser

SUPABASE_URL = "https://hqoovxivfabnwfdjnuvs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxb292eGl2ZmFibndmZGpudXZzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg2NzI2MiwiZXhwIjoyMDkwNDQzMjYyfQ.CG4MAGpOAeeBH6i8NvgOVi5sgO6PWQfmp_pgztP3_-w"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

WIKI_ALBUMS_URL = "https://en.wikipedia.org/wiki/List_of_K-pop_albums_on_the_Billboard_charts"
WIKI_SONGS_URL  = "https://en.wikipedia.org/wiki/List_of_K-pop_songs_on_the_Billboard_charts"

SEPARATORS = (" Featuring ", " featuring ", " feat. ", " Feat. ",
              " & ", " x ", " X ", " with ", " With ",
              " and ", " + ", " × ", " / ")

# Wikipedia K-pop 페이지에 등장하지만 K-pop 아티스트가 아닌 피처링 파트너들
NON_KPOP_NAMES = {
    "halsey", "coldplay", "ed sheeran", "benny blanco", "snoop dogg",
    "nicki minaj", "cardi b", "megan thee stallion", "doja cat", "dua lipa",
    "selena gomez", "charlie puth", "bruno mars", "maroon 5", "skrillex",
    "diplo", "dj khaled", "dj snake", "marshmello", "major lazer",
    "steve aoki", "david guetta", "alesso", "sam feldt", "r3hab",
    "anitta", "becky g", "natti natasha", "jason derulo", "jawsh 685",
    "zayn malik", "tame impala", "lenny kravitz", "pharrell williams",
    "anderson .paak", "j. cole", "jack harlow", "juice wrld", "future",
    "kodak black", "nle choppa", "latto", "gloRilla", "doechii", "raye",
    "central cee", "iann dior", "odetari", "d4vd", "charli xcx",
    "24kgoldn", "french montana", "miguel", "tinashe", "erykah badu",
    "fall out boy", "jonas brothers", "baauer", "m.i.a.", "nile rodgers",
    "tom morello", "xavi", "zara larsson", "sofia carson", "bing crosby",
    "bea miller", "alex warren", "dominic fike", "lauv", "max",
    "desiigner", "lady gaga", "rosalía", "la fouine", "don toliver",
    "little simz", "moses sumney", "jd beck", "peder elias",
    "umi", "wolftyla", "rei ami", "clotilde verry", "lily-rose depp",
    "madison beer", "jaira burns", "becky g, keke palmer",
    "gallant", "play-n-skillz", "leslie grace", "reik", "christopher",
    "r3hab, amber", "thutmose", "mahalia", "kali uchis",
    "young miko", "corsak", "sam feldt", "bumkey", "mew suppasit",
    "suppasit jongcheveevat", "bryan chase", "mayzin", "colde",
    "paul blanco", "sokodomo", "jibin", "sam kim", "giriboy",
    "peakboy", "beenzino", "taeyang feat. beenzino",
}


# ── Wikipedia 파서 (섹션 기반) ───────────────────────────
class WikiSectionParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.section_tables: list[tuple[str, dict]] = []
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
    resp = requests.get(url, headers={"User-Agent": "kcharted-bot/1.0"}, timeout=15)
    resp.raise_for_status()
    parser = WikiSectionParser()
    parser.feed(resp.text)
    for section, table in parser.section_tables:
        if section_keyword.lower() in section.lower():
            return table
    return None


def parse_artist_names(tbl: dict | None) -> set[str]:
    artists = set()
    if not tbl:
        return artists
    headers = [h.lower() for h in tbl["headers"]]
    i_artist = None
    for i, h in enumerate(headers):
        if "artist" in h:
            i_artist = i
            break
    if i_artist is None:
        return artists
    for row in tbl["rows"]:
        if i_artist < len(row):
            raw = row[i_artist].strip()
            raw = re.sub(r"\[\w+\]", "", raw).strip()
            if raw:
                artists.add(raw)
    return artists


def is_compound(name: str) -> bool:
    return any(sep in name for sep in SEPARATORS)


def split_parts(name: str) -> list[str]:
    parts = [name]
    for sep in SEPARATORS:
        new_parts = []
        for p in parts:
            new_parts.extend(p.split(sep))
        parts = new_parts
    return [p.strip() for p in parts if p.strip()]


def is_non_kpop(name: str) -> bool:
    return name.lower() in NON_KPOP_NAMES


# ── Supabase 헬퍼 ─────────────────────────────────────────
def sb_get(table, params):
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, params=params)
    resp.raise_for_status()
    return resp.json()


def sb_patch(table, params, data):
    resp = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**HEADERS, "Prefer": "return=representation"},
        params=params,
        json=data,
    )
    resp.raise_for_status()
    return resp.json()


def find_in_db(name: str):
    return sb_get("artists", {"name": f"ilike.{name}", "select": "id,name,is_kpop,canonical_artist_id"})


def set_kpop(artist_id: int, name: str, dry_run: bool):
    if not dry_run:
        sb_patch("artists", {"id": f"eq.{artist_id}"}, {"is_kpop": True})
        time.sleep(0.1)
    print(f"  {'[DRY]' if dry_run else ''} ✅ SET is_kpop=True  id={artist_id} | {name}")


# ── 메인 ─────────────────────────────────────────────────
def main(dry_run=False):
    print("Wikipedia K-pop 아티스트 목록 수집 중...")
    album_tbl = fetch_wiki_table_by_section(WIKI_ALBUMS_URL, "Billboard 200")
    song_tbl  = fetch_wiki_table_by_section(WIKI_SONGS_URL, "Billboard Hot 100")

    raw_artists = parse_artist_names(album_tbl) | parse_artist_names(song_tbl)
    print(f"  Wikipedia 원본 항목: {len(raw_artists)}개\n")

    fixed = []
    already_kpop = []
    not_found = []
    skipped_non_kpop = []
    need_manual = []  # 복합명에서 K-pop 파트 불명확한 경우

    for raw in sorted(raw_artists):
        # 1. 전체 이름으로 DB 검색
        rows = find_in_db(raw)
        if rows:
            for r in rows:
                if r.get("is_kpop"):
                    already_kpop.append(r)
                elif is_non_kpop(raw):
                    skipped_non_kpop.append(r)
                else:
                    fixed.append(r)
                    set_kpop(r["id"], r["name"], dry_run)
            continue

        # 2. 전체 이름 없음 → 복합명이면 파트 분리
        if is_compound(raw):
            parts = split_parts(raw)
            for part in parts:
                if is_non_kpop(part):
                    continue
                part_rows = find_in_db(part)
                for r in part_rows:
                    if r.get("is_kpop"):
                        already_kpop.append({**r, "_from": raw})
                    elif is_non_kpop(r["name"]):
                        skipped_non_kpop.append(r)
                    else:
                        # 복합명 파트 - K-pop 여부 불확실 → 후보로만 기록
                        need_manual.append({**r, "_compound": raw})
        else:
            not_found.append(raw)

    print(f"\n=== 결과 ===")
    print(f"  수정됨 (is_kpop=True 설정): {len(fixed)}명")
    print(f"  이미 K-pop:                 {len(already_kpop)}명")
    print(f"  비K팝 피처링 스킵:           {len(skipped_non_kpop)}명")
    print(f"  DB 미존재:                  {len(not_found)}명")
    print(f"  복합명 K-pop 여부 불확실:    {len(need_manual)}명 (수동 확인 필요)")

    if fixed:
        print("\n[수정된 아티스트]")
        for r in fixed:
            print(f"  id={r['id']} | {r['name']}")

    if need_manual:
        print("\n[복합명에서 발견 - K-pop 여부 수동 확인 필요]")
        seen = set()
        for r in need_manual:
            key = r["id"]
            if key not in seen:
                seen.add(key)
                print(f"  id={r['id']} | {r['name']} (출처: {r['_compound']})")

    if not_found:
        print(f"\n[DB 미존재 ({len(not_found)}명) - 백필 후 재실행 필요]")
        for n in sorted(not_found):
            print(f"  {n}")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("=== DRY RUN 모드 (실제 변경 없음) ===\n")
    main(dry_run=dry_run)
