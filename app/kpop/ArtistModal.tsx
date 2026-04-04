'use client'

import { useState, useEffect } from 'react'

interface SongStat {
  title: string
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function rankBadge(rank: number) {
  if (rank === 1) return 'text-yellow-400 font-bold'
  if (rank <= 10) return 'text-pink-400 font-semibold'
  if (rank <= 40) return 'text-orange-400'
  return 'text-zinc-400'
}

export default function ArtistModal({ artistId, artistName, onClose }: Props) {
  const [songs, setSongs] = useState<SongStat[] | null>(null)

  useEffect(() => {
    fetch(`/api/artist-songs?artistId=${artistId}`)
      .then((r) => r.json())
      .then(setSongs)
  }, [artistId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-pink-400 font-medium mb-0.5">🇰🇷 K-pop on Billboard Hot 100</p>
            <h2 className="text-lg font-bold text-white leading-tight">{artistName}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 transition-colors"
          >
            ×
          </button>
        </div>

        {/* 컬럼 헤더 */}
        {songs && songs.length > 0 && (
          <div className="grid grid-cols-[1fr_4rem_5rem_auto] gap-2 px-5 py-2 text-xs text-zinc-600 font-medium border-b border-zinc-800/50">
            <span>곡명</span>
            <span className="text-center">최고순위</span>
            <span className="text-center">Total Wks</span>
            <span className="text-right">첫 진입일</span>
          </div>
        )}

        {/* 곡 목록 */}
        <div className="overflow-y-auto flex-1">
          {songs === null ? (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 bg-zinc-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : songs.length === 0 ? (
            <div className="text-center py-10 text-zinc-600">데이터 없음</div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {songs.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_4rem_5rem_auto] gap-2 items-start px-5 py-3">
                  <span className="text-sm text-white font-medium leading-snug">{s.title}</span>
                  <span className={`text-sm font-mono text-center ${rankBadge(s.peak_rank)}`}>
                    #{s.peak_rank}
                  </span>
                  <span className="text-sm font-mono text-zinc-400 text-center">{s.total_weeks}주</span>
                  <span className="text-xs text-zinc-500 text-right whitespace-nowrap">
                    {formatDate(s.first_chart_date)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {songs && songs.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800 flex gap-4 text-xs text-zinc-600">
            <span>총 {songs.length}곡</span>
            <span>·</span>
            <span>총 {songs.reduce((a, s) => a + s.total_weeks, 0)}주</span>
          </div>
        )}
      </div>
    </div>
  )
}
