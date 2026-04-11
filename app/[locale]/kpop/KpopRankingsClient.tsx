'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/navigation'
import ArtistModal from './ArtistModal'
import type { ArtistRanking } from './page'

function artistSlug(name: string) {
  return encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))
}

function peakDisplay(rank: number, count: number, locale: string) {
  if (locale === 'ko') {
    return count > 1 ? `${rank}위×${count}곡` : `${rank}위×1곡`
  }
  return count > 1 ? `#${rank}×${count}` : `#${rank}`
}

export default function KpopRankingsClient({ rankings }: { rankings: ArtistRanking[] }) {
  const t = useTranslations('kpop')
  const locale = useLocale()
  const [selected, setSelected] = useState<ArtistRanking | null>(null)

  if (rankings.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-4xl mb-3">📊</p>
        <p>{locale === 'ko' ? '데이터 준비 중...' : 'Loading data...'}</p>
      </div>
    )
  }

  const totalSongs = rankings.reduce((sum, r) => sum + r.total_songs, 0)
  const totalArtists = rankings.length

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h2 className="text-lg font-semibold text-zinc-300">
          {t('subtitle')}
        </h2>
        <div className="flex items-baseline gap-3 text-xs">
          <span>
            <span className="font-mono text-orange-400 text-sm">{totalSongs.toLocaleString()}</span>
            <span className="text-zinc-500 ml-1">{locale === 'ko' ? '곡' : 'songs'}</span>
          </span>
          <span className="text-zinc-700">/</span>
          <span>
            <span className="font-mono text-orange-400 text-sm">{totalArtists}</span>
            <span className="text-zinc-500 ml-1">{locale === 'ko' ? '아티스트' : 'artists'}</span>
          </span>
        </div>
        <span className="text-xs text-zinc-600 hidden sm:inline">
          {locale === 'ko'
            ? '최고순위 우선 · 동순위는 곡수 기준 · 아티스트 클릭 시 상세'
            : 'Sorted by peak rank · Click artist for details'}
        </span>
      </div>

      <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_5rem_5rem_6rem] gap-2 px-3 py-1.5 text-xs text-zinc-600 font-medium mb-1">
        <span>#</span>
        <span>{t('columns.artist')}</span>
        <span className="text-right">{t('columns.peakRank')}</span>
        <span className="text-right">{t('columns.songs')}</span>
        <span className="text-right">{t('columns.top40')}</span>
        <span className="text-right">{t('columns.weeks')}</span>
      </div>

      <div className="space-y-1">
        {rankings.map((s, i) => (
          <div
            key={s.artist_id ?? s.artist}
            className={`rounded-xl transition-colors
              ${i < 3 ? 'bg-zinc-900 border border-zinc-800 hover:border-zinc-600' : 'hover:bg-zinc-900/60'}
            `}
          >
            <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_5rem_5rem_6rem_2rem] gap-2 items-center px-3 py-3">
              <span className={`text-center font-bold text-sm ${
                i === 0 ? 'text-yellow-400' :
                i === 1 ? 'text-zinc-300' :
                i === 2 ? 'text-amber-600' : 'text-zinc-600'
              }`}>{i + 1}</span>
              <button onClick={() => setSelected(s)} className="font-semibold text-white text-left hover:text-pink-300 transition-colors">{s.artist}</button>
              <span className="text-pink-400 font-mono text-sm font-bold text-right">{peakDisplay(s.best_peak_rank, s.songs_at_peak, locale)}</span>
              <span className="text-zinc-300 font-mono text-sm text-right">{s.total_songs}</span>
              <span className="text-zinc-400 font-mono text-sm text-right">{s.top40_songs}</span>
              <span className="text-zinc-500 font-mono text-sm text-right">{s.total_weeks}</span>
              <Link
                href={`/kpop/${artistSlug(s.artist)}` as '/kpop/[artist]'}
                className="text-zinc-600 hover:text-white transition-colors text-sm text-right"
                title={locale === 'ko' ? '상세 페이지' : 'Detail page'}
              >↗</Link>
            </div>

            <div className="sm:hidden flex items-center gap-3 px-3 py-3">
              <span className={`w-6 text-center font-bold text-sm shrink-0 ${
                i === 0 ? 'text-yellow-400' :
                i === 1 ? 'text-zinc-300' :
                i === 2 ? 'text-amber-600' : 'text-zinc-600'
              }`}>{i + 1}</span>
              <button onClick={() => setSelected(s)} className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-white text-sm leading-snug">{s.artist}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  <span className="text-pink-400 font-medium">{peakDisplay(s.best_peak_rank, s.songs_at_peak, locale)}</span>
                  <span className="mx-1">·</span>
                  {locale === 'ko' ? `${s.total_songs}곡` : `${s.total_songs} songs`}
                  <span className="mx-1">·</span>
                  {locale === 'ko' ? `${s.total_weeks}주` : `${s.total_weeks} wks`}
                </p>
              </button>
              <Link
                href={`/kpop/${artistSlug(s.artist)}` as '/kpop/[artist]'}
                className="text-zinc-600 hover:text-white transition-colors shrink-0"
              >↗</Link>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <ArtistModal
          artistId={selected.artist_id}
          artistName={selected.artist}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
