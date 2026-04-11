import { getTranslations } from 'next-intl/server'
import { Link } from '@/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { Metadata } from 'next'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function sbPost(rpc: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: '{}',
    cache: 'no-store',
  })
  if (!res.ok) return []
  return res.json()
}

interface KpopEntry {
  artist: string
  total_score: number
  best_peak_rank: number
}

interface Hot100Entry {
  rank: number
  title: string
  artist: string
  is_kpop: boolean
}

interface PredictionEntry {
  rank: number
  title: string
  artist: string
  is_kpop: boolean
  stage: string
  chart_date: string
}

async function getLatestHot100Top10(): Promise<Hot100Entry[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: chart } = await supabase.from('charts').select('id').eq('slug', 'billboard-hot-100').single()
    if (!chart) return []

    const { data: latest } = await supabase
      .from('chart_entries').select('chart_date').eq('chart_id', chart.id)
      .order('chart_date', { ascending: false }).limit(1).single()
    if (!latest) return []

    const { data: entries } = await supabase
      .from('chart_entries').select('rank, track_id')
      .eq('chart_id', chart.id).eq('chart_date', latest.chart_date)
      .order('rank').limit(10)
    if (!entries) return []

    const trackIds = entries.map((e) => e.track_id)
    const { data: tracks } = await supabase
      .from('tracks').select('id, title, artist_id').in('id', trackIds)
    if (!tracks) return []

    const artistIds = [...new Set(tracks.map((t) => t.artist_id))]
    const { data: artists } = await supabase
      .from('artists').select('id, name, is_kpop, canonical_artist_id').in('id', artistIds)
    if (!artists) return []

    // Build lookup maps
    const trackMap = new Map(tracks.map((t) => [t.id, t]))
    const artistMap = new Map(artists.map((a) => [a.id, a]))

    return entries.map((e) => {
      const track = trackMap.get(e.track_id)
      const artist = track ? artistMap.get(track.artist_id) : null
      const canonicalArtist = artist?.canonical_artist_id
        ? artistMap.get(artist.canonical_artist_id) : null
      const isKpop = !!(artist?.is_kpop || canonicalArtist?.is_kpop)
      return {
        rank: e.rank,
        title: track?.title ?? '–',
        artist: artist?.name ?? '–',
        is_kpop: isKpop,
      }
    })
  } catch {
    return []
  }
}

async function getLatestPredictionTop10(): Promise<PredictionEntry[]> {
  try {
    const supabase = await createSupabaseServerClient()
    // Find latest prediction (most recent scraped_at)
    const { data: latest } = await supabase
      .from('hot100_predictions')
      .select('chart_date, stage')
      .order('scraped_at', { ascending: false })
      .limit(1).single()
    if (!latest) return []

    const { data: rows } = await supabase
      .from('hot100_predictions')
      .select('rank, title, artist, is_kpop, stage, chart_date')
      .eq('chart_date', latest.chart_date)
      .eq('stage', latest.stage)
      .order('rank').limit(10)
    return rows ?? []
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations('common')
  const baseUrl = 'https://kcharted.com'
  return {
    title: t('siteTitle'),
    description: t('catchphrase'),
    alternates: { canonical: `${baseUrl}/${locale}` },
    openGraph: { title: t('siteTitle'), description: t('catchphrase'), url: `${baseUrl}/${locale}` },
  }
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params

  const [kpopHot100Raw, kpopAlbumsRaw, hot100, predictions] = await Promise.all([
    sbPost('get_kpop_hot100_rankings'),
    sbPost('get_kpop_billboard200_rankings'),
    getLatestHot100Top10(),
    getLatestPredictionTop10(),
  ])

  const kpopHot100: KpopEntry[] = Array.isArray(kpopHot100Raw) ? kpopHot100Raw.slice(0, 10) : []
  const kpopAlbums: KpopEntry[] = Array.isArray(kpopAlbumsRaw) ? kpopAlbumsRaw.slice(0, 10) : []

  const ko = locale === 'ko'

  // Stage label
  const predStage = predictions[0]?.stage
  const stageLabel = predStage === 'final'
    ? (ko ? '🟢 Final' : '🟢 Final')
    : predStage === 'midweek'
    ? (ko ? '🟡 Midweek' : '🟡 Midweek')
    : predStage === 'early'
    ? (ko ? '🔴 Early' : '🔴 Early')
    : null

  const predChartDate = predictions[0]?.chart_date

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">
          {ko ? 'K-pop × 글로벌 차트' : 'K-pop × Global Charts'}
        </h1>
        <p className="text-zinc-500 text-sm">
          {ko ? 'K-pop의 빌보드 기록을 한 눈에' : "K-pop's Billboard story at a glance"}
        </p>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ① K-pop Hot 100 Rankings */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div>
              <p className="text-xs text-pink-400 font-semibold uppercase tracking-wide">🎤 Hot 100</p>
              <h2 className="text-sm font-bold text-white">
                {ko ? 'K-pop 역대 랭킹' : 'K-pop All-Time Rankings'}
              </h2>
            </div>
            <Link href="/kpop" className="text-xs text-zinc-500 hover:text-white transition-colors">
              {ko ? '전체 보기 →' : 'View all →'}
            </Link>
          </div>
          <ol className="divide-y divide-zinc-800/60">
            {kpopHot100.length === 0 ? (
              <li className="px-4 py-6 text-center text-zinc-600 text-sm">{ko ? '데이터 없음' : 'No data'}</li>
            ) : kpopHot100.map((r, i) => (
              <li key={r.artist} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`w-5 text-center font-bold text-sm shrink-0 ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
                }`}>{i + 1}</span>
                <Link
                  href={`/kpop/${encodeURIComponent(r.artist.toLowerCase().replace(/\s+/g, '-'))}` as '/kpop/[artist]'}
                  className="flex-1 text-sm text-white font-medium hover:text-pink-300 transition-colors truncate"
                >{r.artist}</Link>
                <span className="text-xs text-sky-400 font-mono font-semibold shrink-0">{r.total_score?.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ② K-pop Albums Rankings */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div>
              <p className="text-xs text-orange-400 font-semibold uppercase tracking-wide">💿 Billboard 200</p>
              <h2 className="text-sm font-bold text-white">
                {ko ? 'K-pop 역대 앨범 랭킹' : 'K-pop All-Time Album Rankings'}
              </h2>
            </div>
            <Link href="/kpop-albums" className="text-xs text-zinc-500 hover:text-white transition-colors">
              {ko ? '전체 보기 →' : 'View all →'}
            </Link>
          </div>
          <ol className="divide-y divide-zinc-800/60">
            {kpopAlbums.length === 0 ? (
              <li className="px-4 py-6 text-center text-zinc-600 text-sm">{ko ? '데이터 없음' : 'No data'}</li>
            ) : kpopAlbums.map((r, i) => (
              <li key={r.artist} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`w-5 text-center font-bold text-sm shrink-0 ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
                }`}>{i + 1}</span>
                <Link
                  href={`/kpop-albums/${encodeURIComponent(r.artist.toLowerCase().replace(/\s+/g, '-'))}` as '/kpop-albums/[artist]'}
                  className="flex-1 text-sm text-white font-medium hover:text-orange-300 transition-colors truncate"
                >{r.artist}</Link>
                <span className="text-xs text-sky-400 font-mono font-semibold shrink-0">{r.total_score?.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ③ Latest Billboard Hot 100 */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div>
              <p className="text-xs text-red-400 font-semibold uppercase tracking-wide">🔥 Billboard</p>
              <h2 className="text-sm font-bold text-white">
                {ko ? '최신 Hot 100 Top 10' : 'Latest Hot 100 Top 10'}
              </h2>
            </div>
            <Link href="/charts/billboard-hot-100" className="text-xs text-zinc-500 hover:text-white transition-colors">
              {ko ? '전체 보기 →' : 'View all →'}
            </Link>
          </div>
          <ol className="divide-y divide-zinc-800/60">
            {hot100.length === 0 ? (
              <li className="px-4 py-6 text-center text-zinc-600 text-sm">{ko ? '데이터 없음' : 'No data'}</li>
            ) : hot100.map((r) => (
              <li key={r.rank} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`w-5 text-center font-bold text-sm shrink-0 ${
                  r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-zinc-300' : r.rank === 3 ? 'text-amber-600' : 'text-zinc-600'
                }`}>{r.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {r.is_kpop && <span className="mr-1">🇰🇷</span>}{r.artist}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ④ Talk of the Charts Prediction */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div>
              <p className="text-xs text-violet-400 font-semibold uppercase tracking-wide">
                🔮 {ko ? '예측' : 'Prediction'}
                {stageLabel && <span className="ml-2 normal-case font-normal text-zinc-400">{stageLabel}</span>}
              </p>
              <h2 className="text-sm font-bold text-white">
                Talk of the Charts
                {predChartDate && (
                  <span className="text-xs text-zinc-500 font-normal ml-2">
                    {new Date(predChartDate + 'T00:00:00').toLocaleDateString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </h2>
            </div>
            <Link href="/talkofthecharts" className="text-xs text-zinc-500 hover:text-white transition-colors">
              {ko ? '자세히 →' : 'Details →'}
            </Link>
          </div>
          <ol className="divide-y divide-zinc-800/60">
            {predictions.length === 0 ? (
              <li className="px-4 py-8 text-center">
                <p className="text-zinc-600 text-sm">{ko ? '예측 데이터 없음' : 'No prediction data yet'}</p>
                <p className="text-zinc-700 text-xs mt-1">
                  {ko ? '주 3회 자동 업데이트 예정' : 'Auto-updated 3× per week'}
                </p>
              </li>
            ) : predictions.map((r) => (
              <li key={r.rank} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`w-5 text-center font-bold text-sm shrink-0 ${
                  r.rank === 1 ? 'text-yellow-400' : r.rank === 2 ? 'text-zinc-300' : r.rank === 3 ? 'text-amber-600' : 'text-zinc-600'
                }`}>{r.rank}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{r.title}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {r.is_kpop && <span className="mr-1">🇰🇷</span>}{r.artist}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

      </div>
    </div>
  )
}
