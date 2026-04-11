'use client'

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/navigation'

interface NavItem {
  labelEn: string
  labelKo: string
  icon: string
  href: string
}

interface NavSection {
  id: string
  labelEn: string
  labelKo: string
  icon: string
  items: NavItem[]
}

const NAV: NavSection[] = [
  {
    id: 'charts',
    labelEn: 'Charts', labelKo: '차트',
    icon: '📊',
    items: [
      { labelEn: 'Billboard Hot 100', labelKo: 'Billboard Hot 100', icon: '🔥', href: '/charts/billboard-hot-100' },
      { labelEn: 'Billboard 200', labelKo: 'Billboard 200', icon: '💿', href: '/charts/billboard-200' },
      { labelEn: 'Spotify Global Top 50', labelKo: 'Spotify 글로벌', icon: '🎵', href: '/charts/spotify-global-top-50' },
      { labelEn: 'Spotify Korea Top 50', labelKo: 'Spotify 코리아', icon: '🎶', href: '/charts/spotify-korea-top-50' },
    ],
  },
  {
    id: 'kpop',
    labelEn: 'K-pop Rankings', labelKo: 'K-pop 랭킹',
    icon: '🇰🇷',
    items: [
      { labelEn: 'Hot 100 K-pop', labelKo: 'Hot 100 K-pop', icon: '🎤', href: '/kpop' },
      { labelEn: 'Billboard 200 K-pop', labelKo: 'Billboard 200 K-pop', icon: '💿', href: '/kpop-albums' },
      { labelEn: 'Streaming Rankings', labelKo: '누적 스트리밍 순위', icon: '🎵', href: '/kpop-streaming' },
      { labelEn: 'Fastest Milestones', labelKo: '최단 달성 순위', icon: '⚡', href: '/kpop-milestones' },
    ],
  },
  {
    id: 'predictions',
    labelEn: 'Predictions', labelKo: '예측',
    icon: '🔮',
    items: [
      { labelEn: 'Talk of the Charts', labelKo: 'Talk of the Charts', icon: '📈', href: '/talkofthecharts' },
    ],
  },
]

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const locale = useLocale()
  const pathname = usePathname()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    charts: true,
    kpop: true,
    predictions: true,
  })

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    onClose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function isActive(href: string) {
    return pathname === href
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed top-0 left-0 h-screen w-60 bg-zinc-950 border-r border-zinc-800',
          'z-50 flex flex-col transition-transform duration-200 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0">
          <Link
            href="/"
            className="text-base font-bold text-white hover:text-zinc-300 transition-colors tracking-tight"
          >
            🎵 K-charted
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden text-zinc-500 hover:text-white text-lg leading-none p-1"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="h-px bg-zinc-800 mx-3 shrink-0" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map((section) => (
            <div key={section.id}>
              {/* Section header */}
              <button
                onClick={() => toggle(section.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider rounded"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm">{section.icon}</span>
                  {locale === 'ko' ? section.labelKo : section.labelEn}
                </span>
                <span className={`transition-transform duration-150 text-zinc-600 ${expanded[section.id] ? 'rotate-90' : ''}`}>
                  ›
                </span>
              </button>

              {/* Section items */}
              {expanded[section.id] && (
                <div className="mt-0.5 space-y-0.5 pl-2">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href as never}
                      className={[
                        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive(item.href)
                          ? 'bg-zinc-800 text-white font-medium'
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-900',
                      ].join(' ')}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="truncate">{locale === 'ko' ? item.labelKo : item.labelEn}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Bottom: locale hint */}
        <div className="shrink-0 px-4 py-3 border-t border-zinc-800">
          <p className="text-xs text-zinc-700 text-center">kcharted.com</p>
        </div>
      </aside>
    </>
  )
}
