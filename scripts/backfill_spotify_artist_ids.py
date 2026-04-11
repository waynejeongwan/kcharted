"""
kcharted - K-pop 아티스트 spotify_artist_id 자동 채우기

동작:
1. artists 테이블에서 is_kpop=true, canonical_artist_id IS NULL, spotify_artist_id IS NULL 조회
2. 아티스트 이름으로 Spotify 검색 → artist ID 추출
3. DB 업데이트
4. --dry-run: DB 업데이트 없이 결과만 출력

사용:
  python scripts/backfill_spotify_artist_ids.py
  python scripts/backfill_spotify_artist_ids.py --dry-run
"""

import os, re, sys, time, requests

SUPABASE_URL          = os.environ["SUPABASE_URL"]
SUPABASE_KEY          = os.environ["SUPABASE_KEY"]
SPOTIFY_CLIENT_ID     = os.environ["SPOTIFY_CLIENT_ID"]
SPOTIFY_CLIENT_SECRET = os.environ["SPOTIFY_CLIENT_SECRET"]

DRY_RUN = "--dry-run" in sys.argv

# 협업/유닛 패턴 → spotify_artist_id를 세팅하지 않음
COLLAB_PATTERNS = re.compile(
    r' & | With | x | feat\.| ft\.| OST|, .+ Of | vs\.|\+ |'
    r'EXO-[A-Z]|Girls\' Generation-|TTS|JEONGYEON|CHAEYOUNG Of TWICE',
    re.IGNORECASE,
)

# 유사도 통과해도 명백히 잘못된 매칭 → 수동 처리
MANUAL_SKIP = {"LAY", "NCT", "Saja Boys"}  # 이름 일부만 비교해서 잘못 매칭될 수 있는 것

def is_collab(name: str) -> bool:
    return bool(COLLAB_PATTERNS.search(name))

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

def sb_patch(match_params, data):
    resp = requests.patch(f"{SUPABASE_URL}/rest/v1/artists",
                          headers={**HEADERS_SB, "Prefer": "return=minimal"},
                          params=match_params, json=data)
    resp.raise_for_status()

# ── Spotify ────────────────────────────────────────────
def get_spotify_token():
    resp = requests.post("https://accounts.spotify.com/api/token",
                         data={"grant_type": "client_credentials"},
                         auth=(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET))
    resp.raise_for_status()
    return resp.json()["access_token"]

def name_similarity(a: str, b: str) -> float:
    """간단한 문자 집합 기반 유사도 (0~1)"""
    a, b = a.lower(), b.lower()
    if a == b:
        return 1.0
    set_a, set_b = set(a), set(b)
    return len(set_a & set_b) / len(set_a | set_b)

def search_artist(token, name):
    """아티스트 이름으로 Spotify 검색 → (spotify_id, matched_name) 반환
    유사도 0.5 미만이면 None 반환 (너무 다른 매칭 거부)
    """
    resp = requests.get("https://api.spotify.com/v1/search",
                        headers={"Authorization": f"Bearer {token}"},
                        params={"q": name, "type": "artist", "limit": 3})
    if not resp.ok:
        return None, None
    items = resp.json().get("artists", {}).get("items", [])
    if not items:
        return None, None
    # 이름 정확히 일치하는 것 우선
    for item in items:
        if item["name"].lower() == name.lower():
            return item["id"], item["name"]
    # 유사도 가장 높은 것 선택 (0.5 미만이면 거부)
    best = max(items, key=lambda x: name_similarity(name, x["name"]))
    sim = name_similarity(name, best["name"])
    if sim < 0.5:
        return None, None
    return best["id"], best["name"]

# ── 메인 ───────────────────────────────────────────────
def main():
    # 1. 대상 아티스트 조회
    artists = sb_get("artists", {
        "is_kpop": "eq.true",
        "canonical_artist_id": "is.null",
        "spotify_artist_id": "is.null",
        "select": "id,name",
        "order": "name.asc",
    })
    print(f"대상 아티스트: {len(artists)}명")
    if not artists:
        print("모두 채워져 있습니다.")
        return

    # 2. Spotify 토큰
    token = get_spotify_token()
    token_refreshed_at = time.time()

    ok, skipped, failed = 0, 0, []
    collab_skipped = []

    for i, artist in enumerate(artists):
        # 토큰 만료(55분) 대비 갱신
        if time.time() - token_refreshed_at > 3300:
            token = get_spotify_token()
            token_refreshed_at = time.time()

        name = artist["name"]

        # 협업/유닛 아티스트 건너뜀
        if is_collab(name) or any(name.startswith(s) for s in MANUAL_SKIP):
            print(f"  [COLLAB] {name} — 건너뜀")
            collab_skipped.append(name)
            continue

        spotify_id, matched_name = search_artist(token, name)

        if not spotify_id:
            print(f"  [SKIP] {name} — 검색 실패 또는 유사도 부족")
            failed.append(name)
            time.sleep(0.5)
            continue

        # 이름이 다르면 경고
        match_ok = matched_name.lower() == name.lower()
        flag = "" if match_ok else f" ⚠️  매칭: '{matched_name}'"

        print(f"  [{i+1:02d}/{len(artists)}] {name} → {spotify_id}{flag}")

        if not DRY_RUN:
            try:
                sb_patch({"id": f"eq.{artist['id']}"}, {"spotify_artist_id": spotify_id})
                ok += 1
            except requests.HTTPError as e:
                if e.response is not None and e.response.status_code == 409:
                    print(f"    → [CONFLICT] 이미 다른 행에 동일 ID 존재, 건너뜀")
                    failed.append(f"{name} (conflict: {spotify_id})")
                else:
                    raise
        else:
            skipped += 1

        time.sleep(0.2)  # rate limit

    print()
    if DRY_RUN:
        effective = len(artists) - len(collab_skipped) - len(failed)
        print(f"[DRY RUN] 업데이트 예정: {effective}개 | 협업 건너뜀: {len(collab_skipped)}개 | 실패: {len(failed)}개")
    else:
        print(f"완료 — 업데이트: {ok}개 | 협업 건너뜀: {len(collab_skipped)}개 | 실패: {len(failed)}개")

    if collab_skipped:
        print("\n협업/유닛 건너뜀 (수동 처리 필요):")
        for n in collab_skipped:
            print(f"  - {n}")

    if failed:
        print("\nSpotify에서 찾지 못한 아티스트:")
        for n in failed:
            print(f"  - {n}")

if __name__ == "__main__":
    main()
