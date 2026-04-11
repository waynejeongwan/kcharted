"""
kcharted - Spotify 장르 기반 K-pop 아티스트 자동 분류 스크립트

동작:
1. artists 테이블에서 is_kpop IS NULL 인 아티스트 조회
2. Spotify에서 아티스트 검색 → 장르 확인
3. K-pop 장르면 is_kpop=true, 아니면 is_kpop=false 로 업데이트
4. canonical_artist_id 있는 파생 아티스트(featuring 등)는 canonical 기준으로 상속
"""

import os, sys, time, requests

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SPOTIFY_CLIENT_ID     = os.environ["SPOTIFY_CLIENT_ID"]
SPOTIFY_CLIENT_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]

KPOP_GENRES = {
    "k-pop", "korean pop", "k-rap", "k-indie", "k-rock",
    "korean r&b", "korean hip hop", "korean ost", "k-pop boy group",
    "k-pop girl group", "korean idol", "korean pop",
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

def sb_patch(table, match_params, data):
    resp = requests.patch(f"{SUPABASE_URL}/rest/v1/{table}",
                          headers={**HEADERS_SB, "Prefer": "return=minimal"},
                          params=match_params, json=data)
    resp.raise_for_status()

# ── Spotify 토큰 ───────────────────────────────────────
def get_spotify_token():
    resp = requests.post("https://accounts.spotify.com/api/token",
                         data={"grant_type": "client_credentials"},
                         auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET))
    resp.raise_for_status()
    return resp.json()["access_token"]

def spotify_get_genres(token, artist_name):
    """아티스트 이름으로 Spotify 검색 → 장르 목록 반환"""
    resp = requests.get("https://api.spotify.com/v1/search",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"q": artist_name, "type": "artist", "limit": 1})
    if not resp.ok:
        return []
    items = resp.json().get("artists", {}).get("items", [])
    if not items:
        return []
    return [g.lower() for g in items[0].get("genres", [])]

def is_kpop_genres(genres):
    return any(g in KPOP_GENRES or "k-pop" in g or "korean" in g for g in genres)

# ── 메인 ──────────────────────────────────────────────
def classify(dry_run=False):
    token = get_spotify_token()
    token_time = time.time()

    # canonical 아티스트만 먼저 처리 (canonical_artist_id IS NULL)
    artists = sb_get("artists", {
        "is_kpop": "is.null",
        "canonical_artist_id": "is.null",
        "select": "id,name,spotify_id",
        "order": "id",
        "limit": 2000,
    })

    print(f"미분류 canonical 아티스트: {len(artists)}명\n")
    kpop_count = 0
    non_kpop_count = 0

    for i, artist in enumerate(artists, 1):
        # 토큰 만료 대비 (50분마다 갱신)
        if time.time() - token_time > 3000:
            token = get_spotify_token()
            token_time = time.time()

        name = artist["name"]
        genres = spotify_get_genres(token, name)
        is_kpop = is_kpop_genres(genres)

        flag = "🇰🇷 K-pop" if is_kpop else "➖ non"
        print(f"[{i:4}/{len(artists)}] {flag} | {name}")
        if genres and is_kpop:
            print(f"          genres: {genres}")

        if not dry_run:
            sb_patch("artists", {"id": f"eq.{artist['id']}"}, {"is_kpop": is_kpop})

        if is_kpop:
            kpop_count += 1
        else:
            non_kpop_count += 1

        time.sleep(0.3)  # Spotify rate limit

    print(f"\n✅ 완료: K-pop {kpop_count}명, non-K-pop {non_kpop_count}명")

    # canonical 분류 완료 후 파생 아티스트(featuring 등) is_kpop 상속
    print("\n파생 아티스트 is_kpop 상속 중...")
    derived = sb_get("artists", {
        "is_kpop": "is.null",
        "canonical_artist_id": "not.is.null",
        "select": "id,name,canonical_artist_id",
        "limit": 5000,
    })
    inherited = 0
    for a in derived:
        canon = sb_get("artists", {"id": f"eq.{a['canonical_artist_id']}", "select": "is_kpop"})
        if canon and canon[0].get("is_kpop") is not None:
            if not dry_run:
                sb_patch("artists", {"id": f"eq.{a['id']}"}, {"is_kpop": canon[0]["is_kpop"]})
            inherited += 1
    print(f"✅ 파생 아티스트 {inherited}명 상속 완료")

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("🔍 DRY RUN 모드 (DB 업데이트 없음)\n")
    classify(dry_run=dry_run)
