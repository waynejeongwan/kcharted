'use client'

import { useLocale } from 'next-intl'
import { Link } from '@/navigation'

function artistSlug(name: string) {
  return encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))
}

export interface ArtistAlbumRanking {
  artist: string
  artist_id: number
  best_peak_rank: number
  albums_at_peak: number
  total_albums: number
  total_weeks: number
  total_score: number
}

function peakDisplay(rank: number, count: number, locale: string) {
  if (locale === 'ko') {
    return count > 1 ? `${rank}위×${count}앨범` : `${rank}위×1앨범`
  }
  return count > 1 ? `#${rank}×${count}` : `#${rank}`
}

export default function KpopAlbumsClient({ rankings }: { rankings: ArtistAlbumRanking[] }) {
  const locale = useLocale()

  if (rankings.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-4xl mb-3">💿</p>
        <p>{locale === 'ko' ? '데이터 준비 중...' : 'Loading data...'}</p>
      </div>
    )
  }

  const totalAlbums = rankings.reduce((sum, r) => sum + r.total_albums, 0)
  const totalArtists = rankings.length

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h2 className="text-lg font-semibold text-zinc-300">
          {locale === 'ko' ? 'Billboard 200 역대 K-pop 아티스트 종합 기록' : 'All-time K-pop artist records on the Billboard 200'}
        </h2>
        <div className="flex items-baseline gap-3 text-xs">
          <span>
            <span className="font-mono text-orange-400 text-sm">{totalAlbums.toLocaleString()}</span>
            <span className="text-zinc-500 ml-1">{locale === 'ko' ? '앨범' : 'albums'}</span>
          </span>
          <span className="text-zinc-700">/</span>
          <span>
            <span className="font-mono text-orange-400 text-sm">{totalArtists}</span>
            <span className="text-zinc-500 ml-1">{locale === 'ko' ? '아티스트' : 'artists'}</span>
          </span>
        </div>
        <span className="text-xs text-zinc-600 hidden sm:inline">
          {locale === 'ko'
            ? '점수순 · 아티스트 클릭 시 상세'
            : 'Sorted by score · Click artist for details'}
        </span>
      </div>

      {/* 헤더: # | Artist | Score | Peak | Albums | Weeks */}
      <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_7rem_6rem_6rem] gap-2 px-3 py-1.5 text-xs text-zinc-600 font-medium mb-1">
        <span className="text-center">#</span>
        <span>{locale === 'ko' ? '아티스트' : 'Artist'}</span>
        <span className="text-right">{locale === 'ko' ? '점수' : 'Score'}</span>
        <span className="text-right">{locale === 'ko' ? '최고 순위' : 'Peak Rank'}</span>
        <span className="text-right">{locale === 'ko' ? '앨범 수' : 'Albums'}</span>
        <span className="text-right">{locale === 'ko' ? '총 주수' : 'Weeks'}</span>
      </div>

      <div className="space-y-1">
        {rankings.map((s, i) => (
          <div
            key={s.artist_id ?? s.artist}
            className={`rounded-xl transition-colors
              ${i < 3 ? 'bg-zinc-900 border border-zinc-800 hover:border-zinc-600' : 'hover:bg-zinc-900/60'}
            `}
          >
            <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_7rem_6rem_6rem] gap-2 items-center px-3 py-3">
              <span className={`text-center font-bold text-sm ${
                i === 0 ? 'text-yellow-400' :
                i === 1 ? 'text-zinc-300' :
                i === 2 ? 'text-amber-600' : 'text-zinc-600'
              }`}>{i + 1}</span>
              <Link
                href={`/kpop-albums/${artistSlug(s.artist)}` as '/kpop-albums/[artist]'}
                className="font-semibold text-white hover:text-orange-300 transition-colors"
              >{s.artist}</Link>
              <span className="text-sky-400 font-mono text-sm font-bold text-right">{s.total_score?.toLocaleString() ?? '-'}</span>
              <span className="text-white font-mono text-sm text-right">{peakDisplay(s.best_peak_rank, s.albums_at_peak, locale)}</span>
              <span className="text-zinc-400 font-mono text-sm text-right">{s.total_albums}</span>
              <span className="text-zinc-500 font-mono text-sm text-right">{s.total_weeks}</span>
            </div>

            <div className="sm:hidden flex items-center gap-3 px-3 py-3">
              <span className={`w-6 text-center font-bold text-sm shrink-0 ${
                i === 0 ? 'text-yellow-400' :
                i === 1 ? 'text-zinc-300' :
                i === 2 ? 'text-amber-600' : 'text-zinc-600'
              }`}>{i + 1}</span>
              <Link
                href={`/kpop-albums/${artistSlug(s.artist)}` as '/kpop-albums/[artist]'}
                className="flex-1 min-w-0"
              >
                <p className="font-semibold text-white text-sm leading-snug hover:text-orange-300 transition-colors">{s.artist}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  <span className="text-sky-400 font-medium">{s.total_score?.toLocaleString() ?? '-'}{locale === 'ko' ? '점' : 'pts'}</span>
                  <span className="mx-1">·</span>
                  <span className="text-zinc-400">{peakDisplay(s.best_peak_rank, s.albums_at_peak, locale)}</span>
                  <span className="mx-1">·</span>
                  {locale === 'ko' ? `${s.total_albums}앨범` : `${s.total_albums} albums`}
                </p>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
