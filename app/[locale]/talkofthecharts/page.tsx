import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Link } from '@/navigation'
import type { Metadata } from 'next'

interface PredictionRow {
  id: number
  stage: string
  chart_date: string
  rank: number
  title: string
  artist: string
  is_kpop: boolean
  scraped_at: string
  image_url: string | null
}

interface Snapshot {
  chart_date: string
  stage: string
  scraped_at: string
  entries: PredictionRow[]
}

async function getPredictions(): Promise<Snapshot[]> {
  try {
    const supabase = await createSupabaseServerClient()

    // Get the 3 most recent (chart_date, stage) pairs
    const { data: keys } = await supabase
      .from('hot100_predictions')
      .select('chart_date, stage, scraped_at')
      .order('chart_date', { ascending: false })
      .order('scraped_at', { ascending: false })
      .limit(100)

    if (!keys) return []

    // Deduplicate: latest scraped_at per (chart_date, stage)
    const seen = new Map<string, { chart_date: string; stage: string; scraped_at: string }>()
    for (const k of keys) {
      const key = `${k.chart_date}__${k.stage}`
      if (!seen.has(key)) seen.set(key, k)
    }

    // Take the 3 most recent snapshots
    const snapshots = [...seen.values()].slice(0, 3)

    const results: Snapshot[] = []
    for (const snap of snapshots) {
      const { data: entries } = await supabase
        .from('hot100_predictions')
        .select('id, stage, chart_date, rank, title, artist, is_kpop, scraped_at, image_url')
        .eq('chart_date', snap.chart_date)
        .eq('stage', snap.stage)
        .order('rank')
        .limit(100)

      results.push({
        chart_date: snap.chart_date,
        stage: snap.stage,
        scraped_at: snap.scraped_at,
        entries: entries ?? [],
      })
    }

    return results
  } catch {
    return []
  }
}

function stageInfo(stage: string, ko: boolean) {
  if (stage === 'final')   return { label: ko ? 'Final' : 'Final',     color: 'text-green-400', dot: '🟢', desc: ko ? '높은 정확도 (거의 확정)' : 'High accuracy (near-final)' }
  if (stage === 'midweek') return { label: ko ? 'Midweek' : 'Midweek', color: 'text-yellow-400', dot: '🟡', desc: ko ? '중간 정확도' : 'Medium accuracy' }
  return { label: ko ? 'Early' : 'Early', color: 'text-red-400', dot: '🔴', desc: ko ? '낮은 정확도 (초반 데이터)' : 'Low accuracy (early data)' }
}

function formatDate(dateStr: string, locale: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatDateTime(dtStr: string, locale: string) {
  return new Date(dtStr).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const ko = locale === 'ko'
  const title = ko ? 'Talk of the Charts — Hot 100 예측' : 'Talk of the Charts — Hot 100 Predictions'
  const description = ko
    ? 'Talk of the Charts의 Billboard Hot 100 주간 예측 데이터. K-pop 여부 포함.'
    : 'Billboard Hot 100 weekly predictions by Talk of the Charts, with K-pop flags.'
  return { title, description }
}

export default async function TalkOfTheChartsPage({ params }: Props) {
  const { locale } = await params
  const ko = locale === 'ko'
  const snapshots = await getPredictions()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← {ko ? '홈' : 'Home'}
      </Link>

      <div className="mb-8">
        <p className="text-xs text-violet-400 font-semibold uppercase tracking-wide mb-1">
          🔮 {ko ? '예측' : 'Prediction'}
        </p>
        <h1 className="text-3xl font-bold text-white mb-2">Talk of the Charts</h1>
        <p className="text-zinc-400 text-sm">
          {ko
            ? '@talkofthecharts의 Billboard Hot 100 주간 예측 · 주 3회 자동 업데이트'
            : '@talkofthecharts Billboard Hot 100 weekly predictions · Auto-updated 3× per week'}
        </p>
      </div>

      {/* Stage guide */}
      <div className="flex flex-wrap gap-3 mb-8">
        {(['early', 'midweek', 'final'] as const).map((s) => {
          const info = stageInfo(s, ko)
          return (
            <div key={s} className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs">
              <span>{info.dot}</span>
              <span className={`font-semibold ${info.color}`}>{info.label}</span>
              <span className="text-zinc-500">—</span>
              <span className="text-zinc-400">{info.desc}</span>
            </div>
          )
        })}
      </div>

      {snapshots.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <p className="text-zinc-500 text-lg mb-2">📭</p>
          <p className="text-zinc-400">{ko ? '아직 예측 데이터가 없습니다.' : 'No prediction data yet.'}</p>
          <p className="text-zinc-600 text-sm mt-1">
            {ko ? '매주 월 · 수 · 토 자동으로 수집됩니다.' : 'Auto-collected every Mon · Wed · Sat.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {snapshots.map((snap) => {
            const info = stageInfo(snap.stage, ko)
            const kpopCount = snap.entries.filter((e) => e.is_kpop).length
            return (
              <section key={`${snap.chart_date}-${snap.stage}`} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {/* Snapshot header */}
                <div className="px-5 py-4 border-b border-zinc-800 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{info.dot}</span>
                    <span className={`text-sm font-bold ${info.color}`}>{info.label}</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">
                      {ko ? `${formatDate(snap.chart_date, locale)} 차트 예측` : `Prediction for ${formatDate(snap.chart_date, locale)}`}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {ko ? `수집: ${formatDateTime(snap.scraped_at, locale)}` : `Collected: ${formatDateTime(snap.scraped_at, locale)}`}
                      {kpopCount > 0 && (
                        <span className="ml-2 text-pink-400">🇰🇷 {ko ? `K-pop ${kpopCount}곡` : `${kpopCount} K-pop`}</span>
                      )}
                    </p>
                  </div>
                  <div className="ml-auto text-xs text-zinc-600 hidden sm:block">{info.desc}</div>
                </div>

                {/* Table */}
                <div className="hidden sm:grid grid-cols-[3rem_1fr_1fr_3rem] gap-2 px-5 py-2 text-xs text-zinc-600 font-medium border-b border-zinc-800">
                  <span className="text-center">#</span>
                  <span>{ko ? '곡명' : 'Title'}</span>
                  <span>{ko ? '아티스트' : 'Artist'}</span>
                  <span className="text-center">K-pop</span>
                </div>

                <div className="divide-y divide-zinc-800/50">
                  {snap.entries.map((e) => (
                    <div key={e.rank} className="flex sm:grid sm:grid-cols-[3rem_1fr_1fr_3rem] gap-2 items-center px-5 py-3">
                      {/* Desktop */}
                      <span className={`hidden sm:block text-center font-bold text-sm ${
                        e.rank === 1 ? 'text-yellow-400' : e.rank <= 3 ? 'text-zinc-300' : 'text-zinc-600'
                      }`}>{e.rank}</span>
                      <span className="hidden sm:block text-sm text-white font-medium truncate">{e.title}</span>
                      <span className="hidden sm:block text-sm text-zinc-400 truncate">{e.artist}</span>
                      <span className="hidden sm:block text-center">{e.is_kpop ? '🇰🇷' : ''}</span>

                      {/* Mobile */}
                      <span className={`sm:hidden w-6 text-center font-bold text-sm shrink-0 ${
                        e.rank === 1 ? 'text-yellow-400' : e.rank <= 3 ? 'text-zinc-300' : 'text-zinc-600'
                      }`}>{e.rank}</span>
                      <div className="sm:hidden flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">
                          {e.is_kpop && <span className="mr-1">🇰🇷</span>}{e.title}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">{e.artist}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Image source */}
                {snap.entries[0]?.image_url && (
                  <div className="px-5 py-3 border-t border-zinc-800 text-xs text-zinc-600">
                    {ko ? '원본 이미지: ' : 'Source image: '}
                    <a href={snap.entries[0].image_url} target="_blank" rel="noopener noreferrer"
                      className="text-zinc-500 hover:text-white underline underline-offset-2 break-all">
                      {snap.entries[0].image_url}
                    </a>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      <p className="mt-8 text-center text-zinc-700 text-xs">
        {ko
          ? '예측 데이터 출처: Talk of the Charts (@talkofthecharts)'
          : 'Prediction data source: Talk of the Charts (@talkofthecharts)'}
      </p>
    </div>
  )
}
