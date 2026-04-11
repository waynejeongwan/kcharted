import { notFound } from 'next/navigation'
import { Link } from '@/navigation'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import DatePicker from './DatePicker'
import ChartList from './ChartList'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }): Promise<Metadata> {
  const { slug, locale } = await params
  const t = await getTranslations()
  const baseUrl = 'https://kcharted.com'
  const meta = CHART_META[slug]
  if (!meta) return {}
  const title = t(meta.nameKey as Parameters<typeof t>[0])
  const description = t(meta.descKey as Parameters<typeof t>[0])
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/${locale}/charts/${slug}` },
    openGraph: { title, description, url: `${baseUrl}/${locale}/charts/${slug}` },
  }
}

const CHART_META: Record<string, { nameKey: string; icon: string; descKey: string; weekly: boolean }> = {
  'spotify-global-top-50': { nameKey: 'home.charts.spotifyGlobalName', icon: '🎵', descKey: 'chart.spotifyGlobalDesc', weekly: false },
  'spotify-korea-top-50':  { nameKey: 'home.charts.spotifyKoreaName',  icon: '🎶', descKey: 'chart.spotifyKoreaDesc',   weekly: false },
  'billboard-hot-100':     { nameKey: 'home.charts.hot100Name',         icon: '🔥', descKey: 'chart.hot100Desc',          weekly: true },
  'billboard-200':         { nameKey: 'home.charts.billboard200Name',   icon: '💿', descKey: 'chart.billboard200Desc',    weekly: true },
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
  params: Promise<{ slug: string; locale: string }>
  searchParams: Promise<{ date?: string }>
}

export default async function ChartPage({ params, searchParams }: Props) {
  const { slug, locale } = await params
  const { date: dateParam } = await searchParams
  const t = await getTranslations()

  const meta = CHART_META[slug]
  if (!meta) notFound()

  const chartId = await getChartId(slug)
  if (!chartId) notFound()

  const { dates: availableDates, year_stats: yearStats } = await getAvailableDates(chartId, slug)
  if (availableDates.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-12">
        <Link href="/" className="text-zinc-500 text-sm hover:text-white mb-4 block">
          {t('common.backToCharts')}
        </Link>
        <h1 className="text-3xl font-bold mb-4">{meta.icon} {t(meta.nameKey as Parameters<typeof t>[0])}</h1>
        <p className="text-zinc-500">{t('chart.noData')}</p>
      </div>
    )
  }

  const dateStrings = availableDates.map((r) => r.chart_date)
  const selectedDate = dateParam && dateStrings.includes(dateParam) ? dateParam : dateStrings[0]

  const currentIdx = dateStrings.indexOf(selectedDate)
  const prevDate = dateStrings[currentIdx + 1] ?? null
  const nextDate = dateStrings[currentIdx - 1] ?? null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t(meta.nameKey as Parameters<typeof t>[0]),
    description: t(meta.descKey as Parameters<typeof t>[0]),
    url: `https://kcharted.com/${locale}/charts/${slug}`,
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-6">
        <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-4 block">
          {t('common.backToCharts')}
        </Link>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{meta.icon}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">{t(meta.nameKey as Parameters<typeof t>[0])}</h1>
            <p className="text-zinc-500 text-sm">{t(meta.descKey as Parameters<typeof t>[0])}</p>
          </div>
        </div>

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
