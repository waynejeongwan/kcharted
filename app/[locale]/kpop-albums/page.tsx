import { Link } from '@/navigation'
import { getTranslations } from 'next-intl/server'
import KpopAlbumsClient from './KpopAlbumsClient'
import type { ArtistAlbumRanking } from './KpopAlbumsClient'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations()
  const baseUrl = 'https://kcharted.com'
  const title = t('kpopAlbums.title')
  const description = t('kpopAlbums.subtitle')
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/${locale}/kpop-albums` },
    openGraph: { title, description, url: `${baseUrl}/${locale}/kpop-albums` },
  }
}

export const revalidate = 3600

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function getKpopAlbumRankings(): Promise<ArtistAlbumRanking[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_kpop_billboard200_rankings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({}),
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      console.error('get_kpop_billboard200_rankings error:', await res.text())
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.error('get_kpop_billboard200_rankings exception:', e)
    return []
  }
}

export default async function KpopAlbumsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const rankings = await getKpopAlbumRankings()
  const t = await getTranslations()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t('kpopAlbums.title'),
    description: t('kpopAlbums.subtitle'),
    url: `https://kcharted.com/${locale}/kpop-albums`,
    numberOfItems: rankings.length,
    itemListElement: rankings.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.artist,
      description: `Peak #${r.best_peak_rank} on Billboard 200 · ${r.total_albums} albums · ${r.total_weeks} weeks`,
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
        <h1 className="text-3xl font-bold mb-2">💿 {t('kpopAlbums.title')}</h1>
        <p className="text-zinc-400">{t('kpopAlbums.subtitle')}</p>
      </div>

      <KpopAlbumsClient rankings={rankings} />
    </div>
  )
}
