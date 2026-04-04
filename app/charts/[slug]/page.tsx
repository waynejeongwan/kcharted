import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import DatePicker from './DatePicker'
import ChartList from './ChartList'

const CHART_META: Record<string, { name: string; icon: string; desc: string; weekly: boolean }> = {
  'spotify-global-top-50': { name: 'Spotify Global Top 50', icon: '🎵', desc: '글로벌 일간 차트', weekly: false },
  'spotify-korea-top-50':  { name: 'Spotify Korea Top 50',  icon: '🎶', desc: '한국 일간 차트',   weekly: false },
  'billboard-hot-100':     { name: 'Billboard Hot 100',     icon: '🔥', desc: '미국 주간 싱글 차트', weekly: true },
  'billboard-200':         { name: 'Billboard 200',         icon: '💿', desc: '미국 주간 앨범 차트', weekly: true },
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type ChartDateRow = { chart_date: string; kpop_count: number }
type ChartNavData = { dates: ChartDateRow[]; year_stats: Record<string, number> }

async function getChartId(slug: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/charts?slug=eq.${slug}&select=id&limit=1`,
    {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      next: { revalidate: 86400 },
    }
  )
  const data = await res.json()
  return data?.[0]?.id?.toString() ?? null
}

async function getAvailableDates(chartId: string, slug: string): Promise<ChartNavData> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_chart_dates`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ p_chart_id: parseInt(chartId) }),
      next: { revalidate: 3600, tags: [`chart-dates-${slug}`] },
    }
  )
  const data = await res.json()
  if (!data) return { dates: [], year_stats: {} }
  return data as ChartNavData
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

  const chartId = await getChartId(slug)
  if (!chartId) notFound()

  const { dates: availableDates, year_stats: yearStats } = await getAvailableDates(chartId, slug)
  if (availableDates.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-12">
        <Link href="/" className="text-zinc-500 text-sm hover:text-white mb-4 block">← 전체 차트</Link>
        <h1 className="text-3xl font-bold mb-4">{meta.icon} {meta.name}</h1>
        <p className="text-zinc-500">아직 데이터가 없습니다.</p>
      </div>
    )
  }

  const dateStrings = availableDates.map((r) => r.chart_date)
  const selectedDate = dateParam && dateStrings.includes(dateParam) ? dateParam : dateStrings[0]

  const currentIdx = dateStrings.indexOf(selectedDate)
  const prevDate = dateStrings[currentIdx + 1] ?? null
  const nextDate = dateStrings[currentIdx - 1] ?? null

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-10">
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

      {/* 차트 리스트 - 클라이언트 컴포넌트로 독립 로딩 */}
      <Suspense fallback={
        <div className="divide-y divide-zinc-800/60">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="w-7 h-4 bg-zinc-800 rounded animate-pulse shrink-0" />
              <div className="w-9 h-9 bg-zinc-800 rounded-md animate-pulse shrink-0" />
              <div className="flex-1 h-4 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      }>
        <ChartList chartId={chartId} defaultDate={selectedDate} />
      </Suspense>
    </div>
  )
}
