'use client'

import { useState, useMemo } from 'react'
import type { StreamingStat, Snapshot } from './page'

// ── 유틸 ─────────────────────────────────────────────────
function fmtStreams(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  return n.toLocaleString()
}

function fmtDate(s: string | null, locale: string): string {
  if (!s) return '–'
  return new Date(s + 'T00:00:00').toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function releaseYear(s: string | null): number | null {
  if (!s) return null
  return new Date(s + 'T00:00:00').getFullYear()
}

// ── 색상 ─────────────────────────────────────────────────
const CHART_COLORS = ['#22d3ee', '#f472b6', '#a78bfa', '#34d399', '#fb923c']

// ── Mini bar chart (성장 곡선 대체 — Recharts 없이 SVG로) ─
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 120, H = 32
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} className="opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ── 바 차트 (상위 5개 성장 비교) ──────────────────────────
function Top5BarChart({
  stats,
  snapshots,
  locale,
}: {
  stats: StreamingStat[]
  snapshots: Snapshot[]
  locale: string
}) {
  const top5 = stats.slice(0, 5)
  const maxStreams = top5[0]?.total_streams ?? 1

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
      <h3 className="text-sm font-semibold text-white mb-4">
        {locale === 'ko' ? '🏆 Top 5 누적 스트리밍' : '🏆 Top 5 Cumulative Streams'}
      </h3>
      <div className="space-y-3">
        {top5.map((s, i) => {
          const pct = (s.total_streams / maxStreams) * 100
          const snapHistory = snapshots
            .filter((sn) => sn.stat_id === s.id)
            .map((sn) => sn.total_streams)
          return (
            <div key={s.id} className="flex items-center gap-3">
              <span className={`w-5 text-center text-xs font-bold shrink-0 ${
                i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-500'
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-white font-medium truncate pr-2">{s.track_title}</span>
                  <span className="text-xs font-mono shrink-0" style={{ color: CHART_COLORS[i] }}>
                    {fmtStreams(s.total_streams)}
                  </span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i] }}
                  />
                </div>
              </div>
              {snapHistory.length > 1 && (
                <div className="shrink-0 hidden sm:block">
                  <MiniSparkline data={snapHistory} color={CHART_COLORS[i]} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 인사이트 카드 ─────────────────────────────────────────
function InsightCards({ stats, locale }: { stats: StreamingStat[]; locale: string }) {
  const ko = locale === 'ko'

  // 가장 많은 곡을 올린 아티스트
  const artistCount: Record<string, number> = {}
  for (const s of stats) {
    artistCount[s.artist_name] = (artistCount[s.artist_name] ?? 0) + 1
  }
  const topArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0]

  // Top 10 중 가장 오래된 곡
  const top10 = stats.slice(0, 10)
  const oldest = top10.reduce<StreamingStat | null>((acc, s) => {
    if (!s.release_date) return acc
    if (!acc || s.release_date < (acc.release_date ?? '')) return s
    return acc
  }, null)

  // 10억 클럽
  const billionClub = stats.filter((s) => s.total_streams >= 1_000_000_000).length

  const cards = [
    {
      icon: '🥇',
      label: ko ? '최다 스트리밍 곡' : 'Most Streamed',
      value: stats[0]?.track_title ?? '–',
      sub: stats[0] ? fmtStreams(stats[0].total_streams) : '',
    },
    {
      icon: '🎤',
      label: ko ? '가장 많은 곡 보유 아티스트' : 'Most Songs in Rankings',
      value: topArtist?.[0] ?? '–',
      sub: topArtist ? (ko ? `${topArtist[1]}곡` : `${topArtist[1]} songs`) : '',
    },
    {
      icon: '📅',
      label: ko ? 'Top 10 중 가장 오래된 곡' : 'Oldest in Top 10',
      value: oldest?.track_title ?? '–',
      sub: oldest?.release_date ? fmtDate(oldest.release_date, locale) : '',
    },
    {
      icon: '💎',
      label: ko ? '10억 스트리밍 클럽' : '1 Billion Club',
      value: ko ? `${billionClub}곡` : `${billionClub} songs`,
      sub: ko ? '누적 10억+ 달성' : 'Over 1B streams',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-lg mb-1">{c.icon}</p>
          <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
          <p className="text-sm text-white font-semibold leading-snug truncate">{c.value}</p>
          {c.sub && <p className="text-xs text-green-400 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── 메인 클라이언트 컴포넌트 ──────────────────────────────
export default function KpopStreamingClient({
  stats,
  snapshots,
  locale,
}: {
  stats: StreamingStat[]
  snapshots: Snapshot[]
  locale: string
}) {
  const ko = locale === 'ko'

  const [search, setSearch] = useState('')
  const [artistFilter, setArtistFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')

  // 아티스트 목록 (필터용)
  const artists = useMemo(() => {
    const set = new Set(stats.map((s) => s.artist_name))
    return [...set].sort()
  }, [stats])

  // 연도 목록
  const years = useMemo(() => {
    const set = new Set(stats.map((s) => releaseYear(s.release_date)).filter(Boolean) as number[])
    return [...set].sort((a, b) => b - a)
  }, [stats])

  // 필터 적용
  const filtered = useMemo(() => {
    let list = stats
    if (search)       list = list.filter((s) => s.track_title.toLowerCase().includes(search.toLowerCase()) || s.artist_name.toLowerCase().includes(search.toLowerCase()))
    if (artistFilter) list = list.filter((s) => s.artist_name === artistFilter)
    if (yearFilter)   list = list.filter((s) => releaseYear(s.release_date) === parseInt(yearFilter))
    return list
  }, [stats, search, artistFilter, yearFilter])

  if (stats.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
        <p className="text-zinc-500 text-lg mb-2">📭</p>
        <p className="text-zinc-400">{ko ? '데이터 수집 중입니다.' : 'Data is being collected.'}</p>
        <p className="text-zinc-600 text-sm mt-1">{ko ? '매일 자동 업데이트' : 'Updated daily via kworb.net'}</p>
      </div>
    )
  }

  return (
    <>
      {/* 인사이트 */}
      <InsightCards stats={stats} locale={locale} />

      {/* Top 5 바 차트 */}
      <Top5BarChart stats={stats} snapshots={snapshots} locale={locale} />

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={ko ? '곡명 / 아티스트 검색…' : 'Search title / artist…'}
          className="flex-1 min-w-40 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
        />
        <select
          value={artistFilter}
          onChange={(e) => setArtistFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
        >
          <option value="">{ko ? '전체 아티스트' : 'All artists'}</option>
          {artists.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
        >
          <option value="">{ko ? '전체 연도' : 'All years'}</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {(search || artistFilter || yearFilter) && (
          <button
            onClick={() => { setSearch(''); setArtistFilter(''); setYearFilter('') }}
            className="px-3 py-2 text-xs text-zinc-500 hover:text-white border border-zinc-800 rounded-xl transition-colors"
          >
            {ko ? '초기화' : 'Reset'}
          </button>
        )}
      </div>

      {/* 결과 수 */}
      <p className="text-xs text-zinc-600 mb-2">
        {ko ? `${filtered.length.toLocaleString()}곡` : `${filtered.length.toLocaleString()} songs`}
        {(search || artistFilter || yearFilter) && ko ? ' (필터 적용)' : (search || artistFilter || yearFilter) ? ' (filtered)' : ''}
      </p>

      {/* 테이블 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="hidden sm:grid grid-cols-[3rem_1fr_1fr_9rem_7rem_6rem] gap-2 px-5 py-2.5 text-xs text-zinc-600 font-medium border-b border-zinc-800">
          <span className="text-center">#</span>
          <span>{ko ? '곡명' : 'Title'}</span>
          <span>{ko ? '아티스트' : 'Artist'}</span>
          <span className="text-right">{ko ? '누적 스트리밍' : 'Total Streams'}</span>
          <span className="text-right">{ko ? '일간' : 'Daily'}</span>
          <span className="text-right">{ko ? '발매일' : 'Released'}</span>
        </div>

        <div className="divide-y divide-zinc-800/50">
          {filtered.map((s, i) => {
            const is1b = s.total_streams >= 1_000_000_000
            const is500m = !is1b && s.total_streams >= 500_000_000
            return (
              <div key={s.id} className={`flex sm:grid sm:grid-cols-[3rem_1fr_1fr_9rem_7rem_6rem] gap-2 items-center px-5 py-2.5 hover:bg-zinc-800/40 transition-colors ${i < 3 && !search && !artistFilter && !yearFilter ? 'bg-zinc-800/20' : ''}`}>
                {/* Desktop */}
                <span className={`hidden sm:block text-center font-bold text-sm ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
                }`}>{i + 1}</span>
                <div className="hidden sm:flex items-center gap-2 min-w-0">
                  <span className="text-sm text-white font-medium truncate">{s.track_title}</span>
                  {is1b && <span className="shrink-0 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 rounded px-1.5 py-0.5">1B 💎</span>}
                  {is500m && <span className="shrink-0 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded px-1.5 py-0.5">500M</span>}
                </div>
                <span className="hidden sm:block text-sm text-zinc-400 truncate">{s.artist_name}</span>
                <span className="hidden sm:block text-sm font-mono text-green-400 font-semibold text-right">{fmtStreams(s.total_streams)}</span>
                <span className="hidden sm:block text-xs font-mono text-zinc-500 text-right">
                  {s.daily_streams ? fmtStreams(s.daily_streams) : '–'}
                </span>
                <span className="hidden sm:block text-xs text-zinc-600 text-right whitespace-nowrap">
                  {releaseYear(s.release_date) ?? '–'}
                </span>

                {/* Mobile */}
                <span className={`sm:hidden w-6 text-center font-bold text-xs shrink-0 ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
                }`}>{i + 1}</span>
                <div className="sm:hidden flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate flex items-center gap-1.5">
                    {s.track_title}
                    {is1b && <span className="text-xs text-yellow-300">💎</span>}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{s.artist_name}</p>
                </div>
                <span className="sm:hidden text-sm font-mono text-green-400 font-semibold shrink-0">
                  {fmtStreams(s.total_streams)}
                </span>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-center py-12 text-zinc-600 text-sm">
            {ko ? '검색 결과 없음' : 'No results found'}
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-700 text-center">
        {ko ? `마지막 업데이트: ${stats[0]?.updated_at ?? '–'} · 출처: kworb.net` : `Last updated: ${stats[0]?.updated_at ?? '–'} · Source: kworb.net`}
      </p>
    </>
  )
}
