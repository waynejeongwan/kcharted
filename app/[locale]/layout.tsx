import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import PageTracker from '@/components/PageTracker'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import '../globals.css'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations('common')
  const baseUrl = 'https://kcharted.com'

  return {
    title: {
      default: t('siteTitle'),
      template: `%s | ${t('siteTitle')}`,
    },
    description: t('catchphrase'),
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        'en': `${baseUrl}/en`,
        'ko': `${baseUrl}/ko`,
      },
    },
    openGraph: {
      siteName: t('siteTitle'),
      locale: locale === 'ko' ? 'ko_KR' : 'en_US',
      type: 'website',
      title: t('siteTitle'),
      description: t('catchphrase'),
      url: `${baseUrl}/${locale}`,
    },
    twitter: {
      card: 'summary',
      title: t('siteTitle'),
      description: t('catchphrase'),
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any
}) {
  const { locale } = await params as { locale: string }

  if (!routing.locales.includes(locale as 'en' | 'ko')) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <html lang={locale} style={{ backgroundColor: '#09090b' }}>
      <body
        className={inter.className}
        style={{ backgroundColor: '#09090b', color: '#fafafa', minHeight: '100vh', margin: 0 }}
      >
        <NextIntlClientProvider messages={messages}>
          <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href={`/${locale}`} className="text-xl font-bold tracking-tight" style={{ color: '#fafafa' }}>
                K-charted
              </a>
              <span className="text-zinc-500 text-xs mt-0.5">K-pop × Global Charts</span>
            </div>
            <LocaleSwitcher />
          </header>
          <PageTracker />
          <main>{children}</main>
          <Analytics />
          <footer className="border-t border-zinc-800 px-6 py-6 text-center text-zinc-500 text-sm mt-16">
            © {new Date().getFullYear()} kcharted · Data from Spotify, Billboard, Melon
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
