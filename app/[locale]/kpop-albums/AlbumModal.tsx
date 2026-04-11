'use client'

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'

interface AlbumStat {
  title: string
  cover_url: string | null
  peak_rank: number
  total_weeks: number
  first_chart_date: string
  last_chart_date: string
}

interface Props {
  artistId: number
  artistName: string
  onClose: () => void
}

function rankBadge(rank: number) {
  if (rank === 1) return 'text-yellow-400 font-bold'
  if (rank <= 10) return 'text-pink-400 font-semibold'
  if (rank <= 40) return 'text-orange-400'
  return 'text-zinc-400'
}

export default function AlbumModal({ artistId, artistName, onClose }: Props) {
  const locale = useLocale()
  const [albums, setAlbums] = useState<AlbumStat[] | null>(null)

  const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US'

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  useEffect(() => {
    fetch(`/api/artist-albums?artistId=${artistId}`)
      .then((r) => r.json())
      .then(setAlbums)
  }, [artistId])

  const wksLabel = locale === 'ko' ? '주' : 'wks'
  const totalAlbumsLabel = locale === 'ko'
    ? `총 ${albums?.length ?? 0}앨범`
    : `${albums?.length ?? 0} albums`
  const totalWeeksLabel = locale === 'ko'
    ? `총 ${albums?.reduce((a, s) => a + s.total_weeks, 0) ?? 0}주`
    : `${albums?.reduce((a, s) => a + s.total_weeks, 0) ?? 0} total weeks`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-orange-400 font-medium mb-0.5">💿 K-pop on Billboard 200</p>
            <h2 className="text-lg font-bold text-white leading-tight">{artistName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
          >
            ×
          </button>
        </div>

        {albums && albums.length > 0 && (
          <div className="grid grid-cols-[2.5rem_1fr_4rem_5rem_auto] gap-2 px-5 py-2 text-xs text-zinc-600 font-medium border-b border-zinc-800/50">
            <span />
            <span>{locale === 'ko' ? '앨범' : 'Album'}</span>
            <span className="text-center">{locale === 'ko' ? '최고순위' : 'Peak'}</span>
            <span className="text-center">Total Wks</span>
            <span className="text-right">{locale === 'ko' ? '첫 진입일' : 'First Entry'}</span>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {albums === null ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : albums.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">
              {locale === 'ko' ? '데이터 없음' : 'No data'}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {albums.map((s, i) => (
                <div key={i} className="grid grid-cols-[2.5rem_1fr_4rem_5rem_auto] gap-2 items-center px-5 py-3">
                  {s.cover_url ? (
                    <img
                      src={s.cover_url}
                      alt={s.title}
                      className="w-9 h-9 rounded-md object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-zinc-800 flex items-center justify-center text-zinc-600 text-base">
                      💿
                    </div>
                  )}
                  <span className="text-sm text-white font-medium leading-snug">{s.title}</span>
                  <span className={`text-sm font-mono text-center ${rankBadge(s.peak_rank)}`}>
                    #{s.peak_rank}
                  </span>
                  <span className="text-sm font-mono text-zinc-400 text-center">{s.total_weeks}{wksLabel}</span>
                  <span className="text-xs text-zinc-500 text-right whitespace-nowrap">
                    {formatDate(s.first_chart_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {albums && albums.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800 flex gap-4 text-xs text-zinc-600">
            <span>{totalAlbumsLabel}</span>
            <span>·</span>
            <span>{totalWeeksLabel}</span>
          </div>
        )}
      </div>
    </div>
  )
}
