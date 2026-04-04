'use client'

import { useState } from 'react'
import ArtistModal from './ArtistModal'
import type { ArtistRanking } from './page'

function peakDisplay(rank: number, count: number) {
  return count > 1 ? `${rank}위×${count}곡` : `${rank}위×1곡`
}

export default function KpopRankingsClient({ rankings }: { rankings: ArtistRanking[] }) {
  const [selected, setSelected] = useState<ArtistRanking | null>(null)

  if (rankings.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-600">
        <p className="text-4xl mb-3">📊</p>
        <p>데이터 준비 중...</p>
        <p className="text-xs mt-2 text-zinc-700">Supabase SQL Editor에서 get_kpop_hot100_rankings 함수를 실행해주세요</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-lg font-semibold text-zinc-300">
          Billboard Hot 100 K-pop 역대 아티스트 순위
        </h2>
        <span className="text-xs text-zinc-500">최고순위 우선 · 동순위는 곡수 기준 · 아티스트 클릭 시 상세</span>
      </div>

      {/* 헤더 */}
      <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_5rem_5rem_6rem] gap-2 px-3 py-1.5 text-xs text-zinc-600 font-medium mb-1">
        <span>#</span>
        <span>아티스트</span>
        <span className="text-right">최고순위</span>
        <span className="text-right">총곡수</span>
        <span className="text-right">Top40</span>
        <span className="text-right">Total Weeks</span>
      </div>

      <div className="space-y-1">
        {rankings.map((s, i) => (
          <button
            key={s.artist_id ?? s.artist}
            onClick={() => setSelected(s)}
            className={`w-full text-left rounded-xl transition-colors
              ${i < 3 ? 'bg-zinc-900 border border-zinc-800 hover:border-zinc-600' : 'hover:bg-zinc-900/60'}
            `}
          >
            {/* PC 레이아웃 */}
            <div className="hidden sm:grid grid-cols-[2.5rem_1fr_7rem_5rem_5rem_6rem] gap-2 items-center px-3 py-3">
              <span className={`text-center font-bold text-sm ${
                i === 0 ? 'text-yellow-400' :
                i === 1 ? 'text-zinc-300' :
                i === 2 ? 'text-amber-600' : 'text-zinc-600'
              }`}>{i + 1}</span>
              <span className="font-semibold text-white">{s.artist}</span>
              <span className="text-pink-400 font-mono text-sm font-bold text-right">{peakDisplay(s.best_peak_rank, s.songs_at_peak)}</span>
              <span className="text-zinc-300 font-mono text-sm text-right">{s.total_songs}</span>
              <span className="text-zinc-400 font-mono text-sm text-right">{s.top40_songs}</span>
              <span className="text-zinc-500 font-mono text-sm text-right">{s.total_weeks}</span>
            </div>

            {/* 모바일 레이아웃 */}
            <div className="sm:hidden flex items-center gap-3 px-3 py-3">
              <span className={`w-6 text-center font-bold text-sm shrink-0 ${
                i === 0 ? 'text-yellow-400' :
                i === 1 ? 'text-zinc-300' :
                i === 2 ? 'text-amber-600' : 'text-zinc-600'
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm leading-snug">{s.artist}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  <span className="text-pink-400 font-medium">{peakDisplay(s.best_peak_rank, s.songs_at_peak)}</span>
                  <span className="mx-1">·</span>{s.total_songs}곡
                  <span className="mx-1">·</span>{s.total_weeks}주
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 hidden sm:flex gap-4 text-xs text-zinc-600 px-3">
        <span>최고순위: 기록한 최고 위치 × 달성 곡수</span>
        <span>·</span>
        <span>총곡수: Hot 100 진입 곡수 합계</span>
        <span>·</span>
        <span>Total Weeks: 모든 곡의 차트 체류 주수 합계</span>
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
