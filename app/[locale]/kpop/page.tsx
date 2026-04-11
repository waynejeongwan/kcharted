import { Link } from '@/navigation'
import { getTranslations } from 'next-intl/server'
import KpopRankingsClient from './KpopRankingsClient'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations()
  const baseUrl = 'https://kcharted.com'
  const title = t('kpop.title')
  const description = t('kpop.subtitle')
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/${locale}/kpop` },
    openGraph: { title, description, url: `${baseUrl}/${locale}/kpop` },
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface ArtistRanking {
  artist: string
  artist_id: number
  best_peak_rank: number
  songs_at_peak: number
  total_songs: number
  top40_songs: number
  total_weeks: number
  total_score: number
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
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export default async function KpopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const rankings = await getKpopRankings()
  const t = await getTranslations()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('kpop.title'),
    description: t('kpop.subtitle'),
    url: `https://kcharted.com/${locale}/kpop`,
    numberOfItems: rankings.length,
    itemListElement: rankings.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.artist,
      description: `Peak #${r.best_peak_rank} on Billboard Hot 100 · ${r.total_songs} songs · ${r.total_weeks} weeks`,
    })),
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        {t('common.backToCharts')}
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">🇰🇷 {t('kpop.title')}</h1>
        <p className="text-zinc-400">{t('kpop.subtitle')}</p>
      </div>

      <KpopRankingsClient rankings={rankings} />
    </div>
  )
}
