import { notFound } from 'next/navigation'
import { Link } from '@/navigation'
import { getTranslations } from 'next-intl/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import type { Metadata } from 'next'

const BASE_URL = 'https://kcharted.com'

interface AlbumStat {
  title: string
  cover_url: string | null
  peak_rank: number
  total_weeks: number
  first_chart_date: string
  last_chart_date: string
}

interface ArtistData {
  id: number
  name: string
  albums: AlbumStat[]
}

function slugToName(slug: string) {
  return decodeURIComponent(slug).replace(/-/g, ' ')
}

async function getArtistData(slug: string): Promise<ArtistData | null> {
  const supabase = await createSupabaseServerClient()

  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, is_kpop, canonical_artist_id')
    .ilike('name', slugToName(slug))
    .is('canonical_artist_id', null)
    .eq('is_kpop', true)
    .limit(1)

  if (!artists || artists.length === 0) return null
  const artist = artists[0]

  const { data: chart } = await supabase
    .from('charts').select('id').eq('slug', 'billboard-200').single()
  if (!chart) return null

  const { data: allArtists } = await supabase
    .from('artists').select('id')
    .or(`id.eq.${artist.id},canonical_artist_id.eq.${artist.id}`)
  if (!allArtists) return null

  const artistIds = allArtists.map((a) => a.id)

  const { data: tracks } = await supabase
    .from('tracks').select('id, title, cover_url')
    .in('artist_id', artistIds).eq('is_album', true)
  if (!tracks || tracks.length === 0) return { ...artist, albums: [] }

  const trackIds = tracks.map((t) => t.id)
  const trackMap = new Map(tracks.map((t) => [t.id, { title: t.title, cover_url: t.cover_url }]))

  const PAGE = 1000
  const allEntries: { track_id: number; rank: number; chart_date: string }[] = []
  let from = 0
  while (true) {
    const { data: page } = await supabase
      .from('chart_entries')
      .select('track_id, rank, chart_date')
      .eq('chart_id', chart.id)
      .in('track_id', trackIds)
      .order('chart_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!page || page.length === 0) break
    allEntries.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }

  const stats: Record<number, AlbumStat> = {}
  for (const e of allEntries) {
    const tid = e.track_id
    if (!stats[tid]) {
      stats[tid] = {
        title: trackMap.get(tid)?.title ?? '',
        cover_url: trackMap.get(tid)?.cover_url ?? null,
        peak_rank: e.rank,
        total_weeks: 1,
        first_chart_date: e.chart_date,
        last_chart_date: e.chart_date,
      }
    } else {
      if (e.rank < stats[tid].peak_rank) stats[tid].peak_rank = e.rank
      stats[tid].total_weeks += 1
      if (e.chart_date > stats[tid].last_chart_date) stats[tid].last_chart_date = e.chart_date
    }
  }

  const albums = Object.values(stats).sort((a, b) => a.peak_rank - b.peak_rank || b.total_weeks - a.total_weeks)
  return { ...artist, albums }
}

function rankBadge(rank: number) {
  if (rank === 1) return 'text-yellow-400 font-bold'
  if (rank <= 10) return 'text-orange-400 font-semibold'
  if (rank <= 40) return 'text-amber-400'
  return 'text-zinc-400'
}

type Props = { params: Promise<{ artist: string; locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artist: slug, locale } = await params
  const data = await getArtistData(slug)
  if (!data) return {}

  const bestPeak = data.albums.length > 0 ? data.albums[0].peak_rank : null
  const title = `${data.name} — K-pop on Billboard 200`
  const description = bestPeak
    ? `${data.name}'s Billboard 200 album chart history. Peak #${bestPeak} · ${data.albums.length} albums charted · ${data.albums.reduce((a, s) => a + s.total_weeks, 0)} total weeks.`
    : `${data.name}'s Billboard 200 album chart history.`

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/${locale}/kpop-albums/${slug}` },
    openGraph: { title, description, url: `${BASE_URL}/${locale}/kpop-albums/${slug}` },
  }
}

export default async function ArtistAlbumsPage({ params }: Props) {
  const { artist: slug, locale } = await params
  const data = await getArtistData(slug)
  if (!data) notFound()

  const t = await getTranslations()
  const totalWeeks = data.albums.reduce((a, s) => a + s.total_weeks, 0)
  const bestPeak = data.albums.length > 0 ? data.albums[0].peak_rank : null
  const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US'

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString(dateLocale, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${data.name} — Billboard 200`,
    description: `${data.name}'s complete Billboard 200 album chart history`,
    url: `${BASE_URL}/${locale}/kpop-albums/${slug}`,
    numberOfItems: data.albums.length,
    itemListElement: data.albums.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.title,
      description: `Peak #${s.peak_rank} · ${s.total_weeks} weeks · First charted ${s.first_chart_date}`,
    })),
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/kpop-albums" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← {t('kpopAlbums.title')}
      </Link>

      <div className="mb-8">
        <p className="text-xs text-orange-400 font-medium mb-1">💿 K-pop on Billboard 200</p>
        <h1 className="text-4xl font-bold text-white mb-3">{data.name}</h1>
        {bestPeak && (
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-zinc-400">
              {locale === 'ko' ? '최고 순위' : 'Peak rank'}{' '}
              <span className="text-orange-400 font-bold">#{bestPeak}</span>
            </span>
            <span className="text-zinc-400">
              {locale === 'ko' ? `${data.albums.length}앨범` : `${data.albums.length} albums`}
            </span>
            <span className="text-zinc-400">
              {locale === 'ko' ? `총 ${totalWeeks}주` : `${totalWeeks} total weeks`}
            </span>
          </div>
        )}
      </div>

      {data.albums.length === 0 ? (
        <p className="text-zinc-600">{t('chart.noData')}</p>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_4rem_5rem_auto] gap-2 px-5 py-3 text-xs text-zinc-600 font-medium border-b border-zinc-800">
            <span />
            <span>{locale === 'ko' ? '앨범' : 'Album'}</span>
            <span className="text-center">{locale === 'ko' ? '최고순위' : 'Peak'}</span>
            <span className="text-center">Total Wks</span>
            <span className="text-right">{locale === 'ko' ? '첫 진입일' : 'First Entry'}</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {data.albums.map((s, i) => (
              <div key={i} className="grid grid-cols-[2.5rem_1fr_4rem_5rem_auto] gap-2 items-center px-5 py-3">
                {s.cover_url ? (
                  <img src={s.cover_url} alt={s.title} className="w-9 h-9 rounded-md object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-600">💿</div>
                )}
                <span className="text-sm text-white font-medium leading-snug">{s.title}</span>
                <span className={`text-sm font-mono text-center ${rankBadge(s.peak_rank)}`}>#{s.peak_rank}</span>
                <span className="text-sm font-mono text-zinc-400 text-center">{s.total_weeks}{locale === 'ko' ? '주' : 'wks'}</span>
                <span className="text-xs text-zinc-500 text-right whitespace-nowrap">{formatDate(s.first_chart_date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
