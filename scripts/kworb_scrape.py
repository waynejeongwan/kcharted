"""
kcharted - K-pop Spotify 스트리밍 데이터 수집 스크립트

kworb.net 아티스트 페이지에서 K-pop 아티스트별 누적 스트리밍 데이터를 수집.
URL 형식: https://kworb.net/spotify/artist/{SPOTIFY_ARTIST_ID}_songs.html

사용:
  python scripts/kworb_scrape.py           # 전체 수집
  python scripts/kworb_scrape.py --dry-run # 저장 없이 출력

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

UA = {"User-Agent": "Mozilla/5.0 (compatible; kcharted-bot/1.0; +https://kcharted.com)"}

# ── 주요 K-pop 아티스트 Spotify ID 목록 ──────────────────
# Spotify 아티스트 ID: open.spotify.com/artist/{ID}
KPOP_ARTISTS = [
    # 그룹
    ("BTS",                   "3Nrfpe0tUJi4K4DXYWgMUX"),
    ("BLACKPINK",             "41MozSoPIsD1dJM0CLPjZF"),
    ("TWICE",                 "7n2Ycct7Beij7Dj7meI4X0"),
    ("EXO",                   "3cjEqqelV9zb4BYE3KB9YN"),
    ("GOT7",                  "2iELj47CilSVIXPQ7B3BqR"),
    ("Stray Kids",            "2koUyBIThFkbIYFSgBjXEP"),
    ("ENHYPEN",               "0xRXCcSX89eobfrKeRUXt0"),
    ("NewJeans",              "2FXJeEFGMiNIBXaZCYBTDz"),
    ("ATEEZ",                 "1z4g3DjQBjQJAzOOq5oHoT"),
    ("aespa",                 "6wK8sOI1YGHCCZBZQBxSqI"),
    ("IVE",                   "6RHTUrRF63xao58xh9FXYJ"),
    ("ITZY",                  "2KC9Qb60EaY0dW3jVwHTGa"),
    ("(G)I-DLE",              "2AfmfGFre8PeXfvkOxREGQ"),
    ("NMIXX",                 "0GDGKpJFhVpcjIGF8N6Fek"),
    ("ILLIT",                 "4FHlFxvVPXSbcmNBBjGvKS"),
    ("MONSTA X",              "5TnIGCy5OcH9LsqXS8dqnC"),
    ("NCT 127",               "7f4ignLSHJOEPlxfgxJYLk"),
    ("NCT DREAM",             "1gBUSTR3TyDdTVFIaQnIOk"),
    ("WayV",                  "1crBPvUKeTWM2fLB5rIpuD"),
    ("SuperM",                "1tJ8qgbPRcmEjuIx45dVns"),
    ("SHINee",                "4cFsaFnALAXqzEixfLhCQC"),
    ("BIGBANG",               "0iEtIxbK0KxaSlF7G42ZOp"),
    ("2NE1",                  "2NNq47DFCOknb9gu49ZBSZ"),
    ("WINNER",                "6ELMGuCKxiLfUFpMJX01xt"),
    ("iKON",                  "5dwE9TNDI8PZuRnCVqYFKL"),
    ("SEVENTEEN",             "7nqOGRxlXj7N2JYbgNEjYH"),
    ("LOONA",                 "1gnOGsY5FiTEJFoEmKZNhR"),
    ("Red Velvet",            "1z7b1HCOMMtGmlyHNBOCHm"),
    ("Girls' Generation",     "4WFsNbMC9kbGOsATiQSYPp"),
    ("f(x)",                  "1glPRpnDDcFRysMQ1bGGxA"),
    ("Super Junior",          "4oGKPlCM0RhBKHh8zJDR1y"),
    ("TVXQ",                  "0aHBYzjE51KbBMcmVjlKoV"),
    ("B.A.P",                 "4hA2FMqajB7MFq5IlpS3c2"),
    ("DAY6",                  "1R2sl2xeEFLKKFdUgqpOBU"),
    ("2PM",                   "0gxy4QT7gQovRPxpBHCLfG"),
    ("4MINUTE",               "7e0LpKQ39mALq4LNJPi3CH"),
    ("Kara",                  "7Ia7kpfVgFTi3RMSA5fXv8"),
    ("Wonder Girls",          "7iaBuGxPoTqOaJEfVIp6cQ"),
    ("miss A",                "15Sgu3VFLxXGStpidMhV5s"),
    ("SISTAR",                "6bKMjQh3KoFqKB5ZCxk90d"),
    ("T-ARA",                 "5jQI2r1RDBLSe6uZzCpBML"),
    ("Apink",                 "0HWlMIRpL2kzm8kOqbbrT7"),
    ("Mamamoo",               "4GdMGDmMCiHBKCJnZcB9fR"),
    ("ASTRO",                 "3TzKjAqe2AEpxDlTJFHgjk"),
    ("P1Harmony",             "0vKZMeMGkYbTbkDnRBb0TQ"),
    ("THE BOYZ",              "2eBxhzOFqpNnGJMsHXFJGb"),
    ("CIX",                   "6LGz8O7xFMJqQ1uEQd6Kx5"),
    ("ONF",                   "2yLa0QULdQr4gkIpomcalO"),
    ("TXT",                   "4Ll4UcfsQQu38Hxvt8YhWR"),
    ("VERIVERY",              "4pFY3B3Mw7AGMT5tJCz1o4"),
    ("Weeekly",               "6KdtEPxcXRRUMFwxrEfaMy"),
    ("tripleS",               "5cAkgAyVoOYCsGlUh0wSVf"),
    ("fromis_9",              "5TI8yMpIlLGaZKHBxFH4e3"),
    ("Kep1er",                "2qTRMDvMRXNUZFcBp2ZOia"),
    ("LE SSERAFIM",           "6n5sFXHMUDEFDfbT09cuyU"),
    ("KATSEYE",               "5cRKAuOeJE5FqSF6s2b2T5"),
    # 솔로
    ("PSY",                   "1r3sGHo5aIxFpMZDlYBHpJ"),
    ("IU",                    "3HqSZб4y048G5lkh1UrMXJ"),
    ("CL",                    "3oYVnDBb9QsPVCoHKaqGMQ"),
    ("Taeyang",               "0YcLb5GbFqNHuFhPGkGxhN"),
    ("G-Dragon",              "5JdoeIPsOBuIABjIVAqoXC"),
    ("Zico",                  "5FovSmzDEGm0eOPEWTGZXt"),
    ("Jay Park",              "2iiSFQbYIWCfcm3QHXhEPb"),
    ("Jessi",                 "7AKXNBKF2r2xJKRLfZCGJW"),
    ("HyunA",                 "6T6TBY4f1HiCDdMflD7Kmq"),
    ("Taeyeon",               "2nkdd69GQ5UD4Gq6XGXU4D"),
    ("Taemin",                "1Cs0zKBU1kc0i8ypK3B9ai"),
    ("Baekhyun",              "6bErdbWuONBniqOJyPZt1N"),
    ("Chen",                  "6TA6QPggA9IkxMQRUkfXDZ"),
    ("Chanyeol",              "1QGDwwrEiGo8MUfcJbdUAv"),
    ("Kai",                   "6mfK6Q2tzLMEchAr0e9Lyw"),
    ("Lay",                   "4i9LoHGN02ANBbixiHBY31"),
    ("Sehun",                 "09TIAJVgSDSLT5bV0qMZDp"),
    ("SUGA / Agust D",        "2aSmF7BKSn42jNoxdkKBsK"),
    ("J-Hope",                "1OwarW4LEHnoep20ixRA0y"),
    ("RM",                    "3Nrfpe0tUJi4K4DXYWgMUX"),  # BTS 메인 계정 공유
    ("Jimin",                 "1oSPZhvZMIrWW5I41kPkkY"),
    ("V (Kim Taehyung)",      "1Cx6vMnCHPlgPblBMV7hNH"),
    ("Jung Kook",             "6HaGTQPmzraZnuqPpqB7YO"),
    ("Jin",                   "2XHFHbJVNkBB1TsshNShT1"),
    ("Jisoo",                 "3JYjRKiuKobRPQRr0I3hHV"),
    ("Jennie",                "6gg4mhMwIAzHf15VHQN2WT"),
    ("Lisa",                  "5NHx6e3ABuiGIrO1Oa0tAm"),
    ("Rosé",                  "3eqjTLE0HfPfh78zjh6TqT"),
    ("Hwasa",                 "2pFl8bHIU3N5q9DfEZWOFr"),
    ("Solar",                 "1bBVn7UMPvHj5tO36bVv6g"),
    ("Moonbyul",              "72uaBkSLkVPbzCHOuMSJGN"),
    ("Wheein",                "0WRePfPvj6P5mZFyHAfYtA"),
    ("Jackson Wang",          "6l3HvQ5sa6mXTsMTB6G5gY"),
    ("Mark (GOT7)",           "2QhMDJbLrjQcBzFdF4BXAW"),
    ("BamBam",                "6eDqHjH9HOhmoqMBILkqkJ"),
    ("Yugyeom",               "7k6aBKtxLCIClRXA2b2Tnl"),
    ("DPR Ian",               "57kkYfpqGM0OvMiZtcr6KN"),
    ("Kang Daniel",           "0gBRMgdQNBNAblW2N2VHYA"),
    ("Wanna One",             "4yubPJEPdY6E7t00sVOiEU"),
    ("Weki Meki",             "0hnWfSVVfRLH9Vj6RWBLAL"),
    ("Brave Girls",           "1l4vXAjxm3OlFvUP6Iy7O2"),
    ("STAYC",                 "5ENFGmRkLCNSFOWDvHHfqn"),
    ("ailee",                 "2ZO7bB9JpCiGUfhLRmNiqK"),
    ("10CM",                  "6PXTsRwJzFf7MYbMjSmHVN"),
    ("Zico",                  "5FovSmzDEGm0eOPEWTGZXt"),
    ("Block B",               "5kDlQqnRQGBmWwp3O2MVSQ"),
    ("BEAST/Highlight",       "4j7T12FuZHCPMiZQb29GEv"),
    ("Infinite",              "0IWK4nIPy5mPFYBtq7OYhm"),
    ("B1A4",                  "0G0y9UjEnj2VExzDfSRGNP"),
    ("Nu'est",                "0E6hRkd9r3iyXGYBWBpQfE"),
    ("CNBLUE",                "4i9LoHGN02ANBbixiHBY31"),
    ("FT Island",             "3dlOR86MXF2PcNsBLgM7Ng"),
    ("Epik High",             "5IbEL7mSvKQDifmvZDUEMY"),
    ("Hyukoh",                "4dqoqv3E3lnHkFplGovuFq"),
    ("Jannabi",               "4byAoFGgP6E1jVSHFnMjPN"),
    ("BIG Naughty",           "3oKNwFdL0nmJmOBBJlZl6q"),
    ("OOHYO",                 "3SKPXCnBtKOCN3sXqYnvMY"),
    ("lIlBOI",                "1YJSZBgFQgKGklefz3VFwQ"),
    ("Lim Chang-jung",        "3JN9E3gfIKfNQ1PZNJ7DSF"),
    ("Lee Hyori",             "5FiJ6bUEQMHQNRLSxuvfkm"),
    ("BoA",                   "14MtKDL2XsoaSVB9l8oN0V"),
    ("Rain",                  "5I4vMHxoEHQqwEPq9iVBEo"),
    ("Crush",                 "0ULHbIV5mOvYjH2X7gR24G"),
    ("Dean",                  "0hBnNGJaxZXXTgROTlRv7m"),
    ("Zion.T",                "6IWxHgGDiQqOaU5HLlXnQf"),
    ("pH-1",                  "5a9nxjKiRMxlCaSBHpvFKt"),
    ("Kid Milli",             "2J6T9RHJJP0BFeSm5JVHM5"),
    ("Heize",                 "3V43TQvbKAlEMQqMjDdAjV"),
    ("SOLE",                  "1Gl8KjcNQxMiXZuPUlE6wS"),
    ("Hoody",                 "1p6QRIiH2eLCdBVRJVlRSc"),
    ("Sogumm",                "0Gd0qYh5nN1UZJJHbxLbXz"),
    ("MINO",                  "7iBdKO3Gn6Fqik5gM6hGXj"),
    ("Song Mino",             "7iBdKO3Gn6Fqik5gM6hGXj"),
    ("Bobby",                 "2REHlALOrqCUqaHDOe6gFW"),
    ("Chanwoo",               "4dF7OHwl5HfZFKCBrDp0O8"),
    ("GD x Taeyang",          "1JEZT37VqLRGnHqeEbMpIr"),
    ("Seungri",               "0GDGkpJFhVpcjIGF8N6Fek"),
    ("Daesung",               "5fFmEJLHJQNFJO7xOjBVFV"),
    ("T.O.P",                 "6Jdvd1QvI9kKKGmhPeWpjt"),
]

MILESTONES = [
    (100_000_000,   "days_to_100m", "reached_100m_at"),
    (500_000_000,   "days_to_500m", "reached_500m_at"),
    (1_000_000_000, "days_to_1b",   "reached_1b_at"),
]


# ── 유틸 ─────────────────────────────────────────────────
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
                print(f"    Rate limited, {delay * (attempt + 1):.0f}s 대기...")
                time.sleep(delay * (attempt + 1))
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


# ── kworb 아티스트 페이지 파싱 ────────────────────────────
def scrape_artist_songs(artist_name: str, spotify_artist_id: str) -> list[dict]:
    """
    kworb 아티스트 페이지에서 트랙별 누적 스트리밍 수집
    URL: https://kworb.net/spotify/artist/{ID}_songs.html
    """
    url = f"https://kworb.net/spotify/artist/{spotify_artist_id}_songs.html"
    resp = safe_get(url)
    if resp is None:
        print(f"  [{artist_name}] 페이지 없음 (ID: {spotify_artist_id})")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table")
    if not table:
        print(f"  [{artist_name}] 테이블 없음")
        return []

    # 헤더에서 컬럼 파악
    headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
    # kworb 컬럼: Song, Streams, Daily (또는 유사)
    col_song   = next((i for i, h in enumerate(headers) if "song" in h or "title" in h), 0)
    col_total  = next((i for i, h in enumerate(headers) if "total" in h or "stream" in h and "daily" not in h), 1)
    col_daily  = next((i for i, h in enumerate(headers) if "daily" in h), None)

    results = []
    for tr in table.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue

        # 트랙명 + Spotify track ID
        title_td = tds[col_song] if col_song < len(tds) else tds[0]
        link = title_td.find("a")
        title = link.get_text(strip=True) if link else title_td.get_text(strip=True)
        if not title:
            continue

        track_id = None
        if link and link.get("href"):
            m = re.search(r"/track/([A-Za-z0-9]+)", link["href"])
            if m:
                track_id = m.group(1)

        total = parse_num(tds[col_total].get_text(strip=True)) if col_total < len(tds) else None
        if total is None or total <= 0:
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
        })

    return results


def scrape_track_milestones(spotify_track_id: str) -> dict:
    """
    kworb 트랙 히스토리 페이지에서 마일스톤 날짜 수집
    URL: https://kworb.net/spotify/track/{ID}.html
    """
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
    """kpop_spotify_stats upsert, {spotify_track_id: db_id} 맵 반환"""
    if dry_run:
        for r in rows[:5]:
            print(f"  [DRY] {r['artist_name']} — {r['track_title']} | {r['total_streams']:,}")
        if len(rows) > 5:
            print(f"  ... ({len(rows) - 5}개 더)")
        return {}

    id_map: dict[str, int] = {}
    BATCH = 100
    today = date.today().isoformat()

    for i in range(0, len(rows), BATCH):
        batch = [
            {**r, "updated_at": today}
            for r in rows[i:i + BATCH]
            if r.get("spotify_track_id")
        ]
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


# ── 메인 ─────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="K-pop Spotify 스트리밍 수집 (kworb.net)")
    parser.add_argument("--milestones", action="store_true",
                        help="100M+ 트랙의 마일스톤 날짜까지 수집 (느림)")
    parser.add_argument("--top", type=int, default=0,
                        help="마일스톤 수집: 아티스트당 상위 N개 트랙 (0=전체)")
    parser.add_argument("--dry-run", action="store_true", help="저장 없이 결과 출력")
    args = parser.parse_args()

    print("=== K-pop Spotify 스트리밍 수집 (kworb.net) ===\n")
    print(f"대상 아티스트: {len(KPOP_ARTISTS)}명\n")

    all_tracks: list[dict] = []

    for idx, (artist_name, spotify_id) in enumerate(KPOP_ARTISTS, 1):
        print(f"[{idx:3}/{len(KPOP_ARTISTS)}] {artist_name}...", end=" ", flush=True)
        tracks = scrape_artist_songs(artist_name, spotify_id)
        if tracks:
            print(f"{len(tracks)}곡")
            all_tracks.extend(tracks)
        else:
            print("(없음)")
        time.sleep(0.8)

    # 중복 제거 (같은 track_id가 여러 아티스트에 등록된 경우 최대 스트림 유지)
    dedup: dict[str, dict] = {}
    for t in all_tracks:
        tid = t.get("spotify_track_id")
        if tid:
            if tid not in dedup or t["total_streams"] > dedup[tid]["total_streams"]:
                dedup[tid] = t
        # track_id 없는 것도 포함 (artist+title 키로)
        else:
            key = f"{t['artist_name']}|{t['track_title']}"
            if key not in dedup:
                dedup[key] = t

    unique_tracks = list(dedup.values())
    unique_tracks.sort(key=lambda x: x["total_streams"], reverse=True)

    print(f"\n총 {len(all_tracks)}곡 수집 → 중복 제거 후 {len(unique_tracks)}곡")
    print(f"Top 5 스트리밍:")
    for t in unique_tracks[:5]:
        print(f"  {t['total_streams']:>15,}  {t['artist_name']} — {t['track_title']}")

    # DB 저장
    print(f"\nDB 저장 중...")
    id_map = upsert_stats(unique_tracks, args.dry_run)
    if not args.dry_run:
        print(f"  저장 완료: {len(id_map)}개")

        # 상위 100개 스냅샷
        top100 = [t for t in unique_tracks if t.get("spotify_track_id")][:100]
        for t in top100:
            sid = id_map.get(t["spotify_track_id"])
            if sid:
                save_snapshot(sid, t["total_streams"])
        print(f"  스냅샷 저장: {len(top100)}개")

    # 마일스톤 수집
    if args.milestones:
        milestone_targets = [
            t for t in unique_tracks
            if t.get("spotify_track_id") and t["total_streams"] >= 100_000_000
        ]
        if args.top > 0:
            # 아티스트당 top N개
            artist_count: dict[str, int] = {}
            filtered = []
            for t in milestone_targets:
                a = t["artist_name"]
                artist_count[a] = artist_count.get(a, 0) + 1
                if artist_count[a] <= args.top:
                    filtered.append(t)
            milestone_targets = filtered

        print(f"\n마일스톤 수집: {len(milestone_targets)}트랙 (100M+)")
        for idx, t in enumerate(milestone_targets, 1):
            sid = t["spotify_track_id"]
            db_id = id_map.get(sid)
            print(f"  [{idx}/{len(milestone_targets)}] {t['artist_name']} — {t['track_title']}")
            m = scrape_track_milestones(sid)
            if m and db_id and not args.dry_run:
                update_milestones(db_id, m)
                flags = []
                if m.get("days_to_100m") is not None: flags.append(f"100M:{m['days_to_100m']}일")
                if m.get("days_to_500m") is not None: flags.append(f"500M:{m['days_to_500m']}일")
                if m.get("days_to_1b")   is not None: flags.append(f"1B:{m['days_to_1b']}일")
                if flags:
                    print(f"    → {' / '.join(flags)}")
            time.sleep(0.5)

    print("\n완료!")


if __name__ == "__main__":
    main()
