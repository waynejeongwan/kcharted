'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface TrackEntry {
  rank: number
  tracks: {
    title: string
    cover_url: string | null
    is_album: boolean
    artists: { name: string; is_kpop: boolean }
  } | null
}

interface Props {
  chartId: string
  defaultDate: string
}

function youtubeSearchUrl(title: string, artist: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`
}

function Skeleton() {
  return (
    <div className="divide-y divide-zinc-800/60">
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="w-7 h-4 bg-zinc-800 rounded animate-pulse shrink-0" />
          <div className="w-9 h-9 bg-zinc-800 rounded-md animate-pulse shrink-0" />
          <div className="flex-1 h-4 bg-zinc-800 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

export default function ChartList({ chartId, defaultDate }: Props) {
  const t = useTranslations('chart')
  const searchParams = useSearchParams()
  const date = searchParams.get('date') || defaultDate

  const [entries, setEntries] = useState<TrackEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(date)

  const fetchEntries = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/chart-entries?chartId=${chartId}&date=${d}`)
      const data = await res.json()
      setEntries(data)
    } finally {
      setLoading(false)
    }
  }, [chartId])

  useEffect(() => {
    if (date !== currentDate) {
      setCurrentDate(date)
    }
    fetchEntries(date)
  }, [date]) // eslint-disable-line

  if (loading) return <Skeleton />

  const kpopEntries = (entries ?? []).filter(e => e.tracks?.artists?.is_kpop)

  return (
    <>
      {kpopEntries.length > 0 && (
        <div className="mb-3 text-xs text-pink-400 font-medium">
          {t('kpopCount', { count: kpopEntries.length })}
        </div>
      )}
      <div className="divide-y divide-zinc-800/60">
        {(entries ?? []).map((entry) => {
          const track = entry.tracks
          const artist = track?.artists
          const isKpop = artist?.is_kpop
          const ytUrl = youtubeSearchUrl(track?.title ?? '', artist?.name ?? '')

          return (
            <div
              key={entry.rank}
              className={`flex items-center gap-3 py-2 ${isKpop ? 'bg-pink-950/10' : ''}`}
            >
              <span className="w-7 text-right text-zinc-600 font-mono text-sm shrink-0 tabular-nums">
                {entry.rank}
              </span>
              {track?.cover_url ? (
                <img
                  src={track.cover_url}
                  alt={track.title}
                  className="w-9 h-9 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-zinc-800 shrink-0 flex items-center justify-center text-zinc-600 text-base">
                  {track?.is_album ? '💿' : '♪'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={ytUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white hover:text-zinc-300 transition-colors leading-snug"
                >
                  {track?.title}
                </a>
                <p className="text-zinc-400 text-sm leading-snug">{artist?.name}</p>
              </div>
              {isKpop && (
                <span className="shrink-0 text-xs bg-pink-500/15 text-pink-400 px-2 py-0.5 rounded-full border border-pink-500/20 font-medium">
                  K-POP
                </span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
