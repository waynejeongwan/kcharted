import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import DatePicker from './DatePicker'

const CHART_META: Record<string, { name: string; icon: string; desc: string; weekly: boolean }> = {
  'spotify-global-top-50': { name: 'Spotify Global Top 50', icon: '🎵', desc: '글로벌 일간 차트', weekly: false },
  'spotify-korea-top-50':  { name: 'Spotify Korea Top 50',  icon: '🎶', desc: '한국 일간 차트',   weekly: false },
  'billboard-hot-100':     { name: 'Billboard Hot 100',     icon: '🔥', desc: '미국 주간 싱글 차트', weekly: true },
  'billboard-200':         { name: 'Billboard 200',         icon: '💿', desc: '미국 주간 앨범 차트', weekly: true },
}

type ChartDateRow = { chart_date: string; kpop_count: number }
type ChartNavData = { dates: ChartDateRow[]; year_stats: Record<string, number> }

async function getAvailableDates(chartId: string): Promise<ChartNavData> {
  const { data } = await supabase.rpc('get_chart_dates', { p_chart_id: chartId })
  if (!data) return { dates: [], year_stats: {} }
  // returns json → data is array with one element
  const result = Array.isArray(data) ? data[0] : data
  return result as ChartNavData
}

async function getChartEntries(chartId: string, date: string) {
  const { data: entries } = await supabase
    .from('chart_entries')
    .select(`rank, tracks ( title, cover_url, is_album, artists ( name, is_kpop ) )`)
    .eq('chart_id', chartId)
    .eq('chart_date', date)
    .order('rank', { ascending: true })
  return entries ?? []
}

function youtubeSearchUrl(title: string, artist: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`
}

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function ChartPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { date: dateParam } = await searchParams

  const meta = CHART_META[slug]
  if (!meta) notFound()

  const { data: chart } = await supabase
    .from('charts').select('id').eq('slug', slug).single()
  if (!chart) notFound()

  const { dates: availableDates, year_stats: yearStats } = await getAvailableDates(chart.id)
  if (availableDates.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-zinc-500 text-sm hover:text-white mb-4 block">← 전체 차트</Link>
        <h1 className="text-3xl font-bold mb-4">{meta.icon} {meta.name}</h1>
        <p className="text-zinc-500">아직 데이터가 없습니다.</p>
      </div>
    )
  }

  const dateStrings = availableDates.map((r) => r.chart_date)

  const selectedDate = dateParam && dateStrings.includes(dateParam)
    ? dateParam
    : dateStrings[0]

  const entries = await getChartEntries(chart.id, selectedDate)
  const kpopCount = entries.filter((e: any) => e.tracks?.artists?.is_kpop).length

  const currentIdx = dateStrings.indexOf(selectedDate)
  const prevDate = dateStrings[currentIdx + 1] ?? null
  const nextDate = dateStrings[currentIdx - 1] ?? null

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* 헤더 */}
      <div className="mb-6">
        <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-4 block">
          ← 전체 차트
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{meta.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">{meta.name}</h1>
            <p className="text-zinc-500 text-sm">{meta.desc}</p>
          </div>
          {kpopCount > 0 && (
            <span className="ml-auto text-xs bg-pink-500/15 text-pink-400 border border-pink-500/20 rounded-full px-3 py-1 font-medium">
              K-POP {kpopCount}곡
            </span>
          )}
        </div>

        {/* 날짜 선택 */}
        <DatePicker
          slug={slug}
          selectedDate={selectedDate}
          availableDates={availableDates}
          dateStrings={dateStrings}
          yearStats={yearStats}
          prevDate={prevDate}
          nextDate={nextDate}
          weekly={meta.weekly}
        />
      </div>

      {/* 차트 리스트 */}
      <div className="divide-y divide-zinc-800/60">
        {entries.map((entry: any) => {
          const track = entry.tracks
          const artist = track?.artists
          const isKpop = artist?.is_kpop
          const ytUrl = youtubeSearchUrl(track?.title ?? '', artist?.name ?? '')

          return (
            <div
              key={entry.rank}
              className={`flex items-center gap-3 py-2 ${isKpop ? 'bg-pink-950/10' : ''}`}
            >
              {/* 순위 */}
              <span className="w-7 text-right text-zinc-600 font-mono text-sm shrink-0 tabular-nums">
                {entry.rank}
              </span>

              {/* 커버 이미지 */}
              {track?.cover_url ? (
                <img
                  src={track.cover_url}
                  alt={track.title}
                  className="w-9 h-9 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600 text-base">
                  {track?.is_album ? '💿' : '♪'}
                </div>
              )}

              {/* 제목 + 아티스트 (한 줄) */}
              <div className="min-w-0 flex-1 flex items-center gap-1.5 overflow-hidden">
                <a
                  href={ytUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white truncate shrink"
                  title={`YouTube에서 검색: ${track?.title}`}
                >
                  {track?.title}
                </a>
                <span className="text-zinc-500 shrink-0">·</span>
                <span className="text-zinc-300 text-sm truncate shrink">{artist?.name}</span>
              </div>

              {/* K-pop 배지 */}
              {isKpop && (
                <span className="shrink-0 text-xs bg-pink-500/15 text-pink-400 px-2 py-0.5 rounded-full border border-pink-500/20 font-medium">
                  K-POP
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
