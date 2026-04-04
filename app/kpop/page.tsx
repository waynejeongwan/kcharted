import Link from 'next/link'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface ArtistRanking {
  artist: string
  best_peak_rank: number
  songs_at_peak: number
  total_songs: number
  top40_songs: number
  total_weeks: number
}

async function getKpopRankings(): Promise<ArtistRanking[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_kpop_hot100_rankings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({}),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function peakDisplay(rank: number, count: number) {
  const ordinal = rank === 1 ? '1위' : `${rank}위`
  return count > 1 ? `${ordinal}×${count}곡` : `${ordinal}×1곡`
}

export default async function KpopPage() {
  const rankings = await getKpopRankings()

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← 전체 차트
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">🇰🇷 K-pop on Billboard Hot 100</h1>
        <p className="text-zinc-400">Billboard Hot 100 역대 K-pop 아티스트 종합 기록</p>
      </div>

      {/* 아티스트 순위 */}
      <section>
        <div className="flex items-baseline gap-2 mb-4">
          <h2 className="text-lg font-semibold text-zinc-300">
            Billboard Hot 100 K-pop 역대 아티스트 순위
          </h2>
          <span className="text-xs text-zinc-500">최고순위 우선 · 동순위는 곡수 기준</span>
        </div>

        {rankings.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <p className="text-4xl mb-3">📊</p>
            <p>데이터 준비 중...</p>
            <p className="text-xs mt-2 text-zinc-700">Supabase SQL Editor에서 get_kpop_hot100_rankings 함수를 실행해주세요</p>
          </div>
        ) : (
          <>
            {/* 헤더 */}
            <div className="grid grid-cols-[2rem_1fr_auto] gap-2 px-3 py-1.5 text-xs text-zinc-600 font-medium mb-1">
              <span>#</span>
              <span>아티스트</span>
              <div className="flex gap-4 text-right">
                <span className="w-16">최고순위</span>
                <span className="w-12">Top100</span>
                <span className="w-12">Top40</span>
                <span className="w-12">총주수</span>
              </div>
            </div>

            <div className="space-y-1">
              {rankings.map((s, i) => (
                <div
                  key={s.artist}
                  className={`grid grid-cols-[2rem_1fr_auto] gap-2 items-center px-3 py-3 rounded-xl transition-colors
                    ${i < 3 ? 'bg-zinc-900 border border-zinc-800' : 'hover:bg-zinc-900/60'}
                  `}
                >
                  {/* 순위 번호 */}
                  <span className={`text-center font-bold text-sm ${
                    i === 0 ? 'text-yellow-400' :
                    i === 1 ? 'text-zinc-300' :
                    i === 2 ? 'text-amber-600' :
                    'text-zinc-600'
                  }`}>
                    {i + 1}
                  </span>

                  {/* 아티스트명 */}
                  <p className="font-semibold text-white truncate">{s.artist}</p>

                  {/* 통계 */}
                  <div className="flex gap-4 items-center text-right">
                    <span className="w-16 text-pink-400 font-mono text-sm font-bold">
                      {peakDisplay(s.best_peak_rank, s.songs_at_peak)}
                    </span>
                    <span className="w-12 text-zinc-300 font-mono text-sm">{s.total_songs}</span>
                    <span className="w-12 text-zinc-400 font-mono text-sm">{s.top40_songs}</span>
                    <span className="w-12 text-zinc-500 font-mono text-sm">{s.total_weeks}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-4 text-xs text-zinc-600 px-3">
              <span>최고순위: 해당 아티스트가 기록한 최고 차트 위치 (곡수 포함)</span>
              <span>·</span>
              <span>Top100/40: Hot 100 진입 곡수</span>
              <span>·</span>
              <span>총주수: 모든 곡의 차트 체류 주수 합계</span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
