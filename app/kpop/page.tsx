import { supabase } from '@/lib/supabase'
import Link from 'next/link'

async function getKpopStats() {
  // K-pop 아티스트별 Hot 100 진입 통계 (뷰 사용)
  const { data: stats } = await supabase
    .from('kpop_hot100_stats')
    .select('*')
    .limit(30)

  // 최근 Hot 100에 오른 K-pop 곡 (최신 날짜 기준)
  const { data: chart } = await supabase
    .from('charts').select('id').eq('slug', 'billboard-hot-100').single()

  let recentKpop: any[] = []
  if (chart) {
    const { data: latest } = await supabase
      .from('chart_entries').select('chart_date')
      .eq('chart_id', chart.id)
      .order('chart_date', { ascending: false })
      .limit(1).single()

    if (latest) {
      const { data } = await supabase
        .from('chart_entries')
        .select(`rank, chart_date, tracks ( title, cover_url, artists ( name, is_kpop ) )`)
        .eq('chart_id', chart.id)
        .eq('chart_date', latest.chart_date)
        .order('rank', { ascending: true })

      recentKpop = (data ?? []).filter((e: any) => e.tracks?.artists?.is_kpop)
    }
  }

  return { stats: stats ?? [], recentKpop }
}

export default async function KpopPage() {
  const { stats, recentKpop } = await getKpopStats()

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← 전체 차트
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">🇰🇷 K-pop on Billboard</h1>
        <p className="text-zinc-400">Billboard Hot 100 K-pop 역사적 기록 & 통계</p>
      </div>

      {/* 최신 Hot 100 K-pop */}
      {recentKpop.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-semibold mb-4 text-zinc-300">
            이번 주 Hot 100 K-pop
            <span className="ml-2 text-sm font-normal text-zinc-500">({recentKpop.length}곡)</span>
          </h2>
          <div className="space-y-1">
            {recentKpop.map((e: any) => (
              <div key={e.rank} className="flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-zinc-900 transition-colors">
                <span className="w-8 text-right text-zinc-500 font-mono text-sm shrink-0">{e.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white truncate">{e.tracks?.title}</p>
                  <p className="text-zinc-500 text-sm">{e.tracks?.artists?.name}</p>
                </div>
                <span className="text-xs bg-pink-500/15 text-pink-400 px-2 py-0.5 rounded-full border border-pink-500/20">
                  🇰🇷 K-pop
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 아티스트별 통계 */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-zinc-300">
          Hot 100 K-pop 아티스트 순위
          <span className="ml-2 text-sm font-normal text-zinc-500">역대 진입 횟수 기준</span>
        </h2>

        {stats.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <p className="text-4xl mb-3">📊</p>
            <p>역사적 데이터 수집 중...</p>
            <p className="text-sm mt-1">잠시 후 다시 확인해주세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats.map((s: any, i: number) => (
              <div key={s.artist}
                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors">
                <span className="w-6 text-center text-zinc-500 font-bold text-sm shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{s.artist}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    최고 순위 #{s.peak_rank} · {s.unique_songs}곡 · {s.weeks_on_chart}주
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-pink-400 font-bold">{s.total_entries}</p>
                  <p className="text-zinc-600 text-xs">진입 횟수</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
