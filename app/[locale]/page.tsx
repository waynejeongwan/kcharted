import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/navigation'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations('common')
  const baseUrl = 'https://kcharted.com'
  const title = t('siteTitle')
  const description = t('catchphrase')
  return {
    title,
    description,
    alternates: { canonical: `${baseUrl}/${locale}` },
    openGraph: { title, description, url: `${baseUrl}/${locale}` },
  }
}

export default function Home() {
  const t = useTranslations()

  const CHARTS = [
    {
      slug: 'billboard-hot-100',
      name: t('home.charts.hot100Name'),
      desc: t('home.charts.hot100Desc'),
      color: 'from-red-500 to-rose-700',
      icon: '🔥',
      href: '/charts/billboard-hot-100' as const,
    },
    {
      slug: 'kpop',
      name: t('home.charts.kpopRankingsName'),
      desc: t('home.charts.kpopRankingsDesc'),
      color: 'from-pink-500 to-rose-700',
      icon: '🇰🇷',
      href: '/kpop' as const,
    },
    {
      slug: 'billboard-200',
      name: t('home.charts.billboard200Name'),
      desc: t('home.charts.billboard200Desc'),
      color: 'from-orange-500 to-amber-700',
      icon: '💿',
      href: '/charts/billboard-200' as const,
    },
    {
      slug: 'kpop-albums',
      name: t('home.charts.kpopAlbumsName'),
      desc: t('home.charts.kpopAlbumsDesc'),
      color: 'from-orange-400 to-pink-600',
      icon: '🇰🇷',
      href: '/kpop-albums' as const,
    },
    {
      slug: 'spotify-global-top-50',
      name: t('home.charts.spotifyGlobalName'),
      desc: t('home.charts.spotifyGlobalDesc'),
      color: 'from-green-500 to-emerald-700',
      icon: '🎵',
      href: '/charts/spotify-global-top-50' as const,
    },
    {
      slug: 'spotify-korea-top-50',
      name: t('home.charts.spotifyKoreaName'),
      desc: t('home.charts.spotifyKoreaDesc'),
      color: 'from-blue-500 to-indigo-700',
      icon: '🎶',
      href: '/charts/spotify-korea-top-50' as const,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-bold mb-4 tracking-tight">🎵 K-charted</h1>
        <p className="text-zinc-400 text-sm font-semibold tracking-widest uppercase mb-1">{t('common.tagline')}</p>
        <p className="text-zinc-500 text-base">{t('common.catchphrase')}</p>
      </div>

      <div className="grid gap-4 mb-8">
        {CHARTS.map((chart) => (
          <Link
            key={chart.slug}
            href={chart.href}
            className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-600 transition-all hover:-translate-y-0.5"
          >
            <div className={`absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity bg-gradient-to-br ${chart.color}`} />
            <div className="relative flex items-center gap-4">
              <span className="text-4xl">{chart.icon}</span>
              <div>
                <h2 className="font-bold text-lg text-white">{chart.name}</h2>
                <p className="text-zinc-400 text-sm mt-0.5">{chart.desc}</p>
              </div>
              <span className="ml-auto text-zinc-600 group-hover:text-white transition-colors text-xl">→</span>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-center text-zinc-600 text-sm mt-10">{t('common.updatedDaily')}</p>
    </div>
  )
}
