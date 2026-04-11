'use client'

import { useState, useMemo } from 'react'
import type { MilestoneStat } from './page'

// ── 유틸 ─────────────────────────────────────────────────
function fmtDate(s: string | null, locale: string): string {
  if (!s) return '–'
  return new Date(s + 'T00:00:00').toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function fmtDays(d: number | null, ko: boolean): string {
  if (d === null) return '–'
  if (ko) return `${d.toLocaleString()}일`
  return d === 1 ? '1 day' : `${d.toLocaleString()} days`
}

type Tab = '100m' | '500m' | '1b'

interface TabConfig {
  key: Tab
  label: string
  threshold: string
  daysKey: keyof MilestoneStat
  dateKey: keyof MilestoneStat
  color: string
  bgColor: string
}

const TABS: TabConfig[] = [
  { key: '100m', label: '100M', threshold: '100,000,000', daysKey: 'days_to_100m', dateKey: 'reached_100m_at', color: 'text-green-400',  bgColor: 'bg-green-400' },
  { key: '500m', label: '500M', threshold: '500,000,000', daysKey: 'days_to_500m', dateKey: 'reached_500m_at', color: 'text-violet-400', bgColor: 'bg-violet-400' },
  { key: '1b',   label: '1B',   threshold: '1,000,000,000', daysKey: 'days_to_1b',   dateKey: 'reached_1b_at',  color: 'text-yellow-400', bgColor: 'bg-yellow-400' },
]

// ── 인사이트 카드 ─────────────────────────────────────────
function InsightCards({
  stats,
  tab,
  locale,
}: {
  stats: MilestoneStat[]
  tab: TabConfig
  locale: string
}) {
  const ko = locale === 'ko'
  const filtered = stats.filter((s) => s[tab.daysKey] !== null)
  if (filtered.length === 0) return null

  const fastest = filtered[0]
  const fastestDays = fastest[tab.daysKey] as number

  // 아티스트별 기록 보유 수
  const artistCount: Record<string, number> = {}
  for (const s of filtered) artistCount[s.artist_name] = (artistCount[s.artist_name] ?? 0) + 1
  const topArtist = Object.entries(artistCount).sort((a, b) => b[1] - a[1])[0]

  // 최근 5년 내 달성 (속도 트렌드)
  const recentYear = new Date().getFullYear() - 2
  const recentFast = filtered.filter((s) => {
    const yr = s.release_date ? new Date(s.release_date + 'T00:00:00').getFullYear() : 0
    return yr >= recentYear
  })
  const avgRecent = recentFast.length
    ? Math.round(recentFast.reduce((a, s) => a + (s[tab.daysKey] as number), 0) / recentFast.length)
    : null

  const cards = [
    {
      icon: '⚡',
      label: ko ? `최단 ${tab.label} 달성` : `Fastest to ${tab.label}`,
      value: fastest.track_title,
      sub: fmtDays(fastestDays, ko),
      subColor: tab.color,
    },
    {
      icon: '🎤',
      label: ko ? '기록 보유 아티스트' : 'Most Record Holder',
      value: topArtist?.[0] ?? '–',
      sub: topArtist ? (ko ? `${topArtist[1]}곡` : `${topArtist[1]} songs`) : '',
      subColor: 'text-zinc-400',
    },
    {
      icon: '📊',
      label: ko ? `${tab.label} 달성 곡 수` : `Songs reaching ${tab.label}`,
      value: ko ? `${filtered.length}곡` : `${filtered.length} songs`,
      sub: '',
      subColor: '',
    },
    {
      icon: '📈',
      label: ko ? `최근 2년 평균 달성 일수` : 'Avg days (last 2 yrs)',
      value: avgRecent !== null ? fmtDays(avgRecent, ko) : '–',
      sub: recentFast.length > 0 ? (ko ? `${recentFast.length}곡 기준` : `${recentFast.length} songs`) : '',
      subColor: 'text-zinc-500',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
          <p className="text-lg mb-1">{c.icon}</p>
          <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
          <p className="text-sm text-white font-semibold leading-snug truncate">{c.value}</p>
          {c.sub && <p className={`text-xs mt-0.5 ${c.subColor}`}>{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}

// ── 바 차트 (상위 10개 달성 일수 비교) ────────────────────
function MilestoneBarChart({
  stats,
  tab,
  locale,
}: {
  stats: MilestoneStat[]
  tab: TabConfig
  locale: string
}) {
  const ko = locale === 'ko'
  const top10 = stats.filter((s) => s[tab.daysKey] !== null).slice(0, 10)
  if (top10.length === 0) return null

  const maxDays = Math.max(...top10.map((s) => s[tab.daysKey] as number))

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6">
      <h3 className="text-sm font-semibold text-white mb-4">
        {ko ? `⚡ 최단 ${tab.label} 달성 Top 10 비교` : `⚡ Fastest to ${tab.label} — Top 10`}
      </h3>
      <div className="space-y-2.5">
        {top10.map((s, i) => {
          const days = s[tab.daysKey] as number
          const pct = (days / maxDays) * 100
          return (
            <div key={s.id} className="flex items-center gap-3">
              <span className={`w-5 text-center text-xs font-bold shrink-0 ${
                i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-500'
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-xs text-white truncate pr-2">{s.track_title}</span>
                  <span className={`text-xs font-mono font-semibold shrink-0 ${tab.color}`}>
                    {fmtDays(days, ko)}
                  </span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  {/* 바가 짧을수록 빠름 — 시각적으로 역방향 */}
                  <div
                    className={`h-full rounded-full ${tab.bgColor} opacity-70`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-zinc-600 mt-3">
        {ko ? '* 바가 짧을수록 더 빠르게 달성' : '* Shorter bar = faster achievement'}
      </p>
    </div>
  )
}

// ── 타임라인 표시 (발매 → 달성) ───────────────────────────
function Timeline({ stat, tabs, locale }: { stat: MilestoneStat; tabs: TabConfig[]; locale: string }) {
  const ko = locale === 'ko'
  const milestones = tabs
    .filter((t) => stat[t.daysKey] !== null)
    .map((t) => ({
      label: t.label,
      days: stat[t.daysKey] as number,
      date: stat[t.dateKey] as string | null,
      color: t.color,
    }))

  if (milestones.length === 0) return null
  const maxDays = milestones[milestones.length - 1].days

  return (
    <div className="mt-2 flex items-center gap-1 text-xs">
      <span className="text-zinc-600 shrink-0">{ko ? '발매' : 'Release'}</span>
      <div className="flex-1 relative h-1 bg-zinc-800 rounded mx-1">
        {milestones.map((m) => (
          <div
            key={m.label}
            className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${m.color.replace('text-', 'bg-')} border border-zinc-900`}
            style={{ left: `${(m.days / maxDays) * 100}%` }}
            title={`${m.label}: ${fmtDays(m.days, ko)}`}
          />
        ))}
      </div>
      <span className={`shrink-0 ${milestones[milestones.length - 1].color}`}>
        {milestones[milestones.length - 1].label}
      </span>
    </div>
  )
}

// ── 메인 클라이언트 컴포넌트 ──────────────────────────────
export default function KpopMilestonesClient({
  stats,
  locale,
}: {
  stats: MilestoneStat[]
  locale: string
}) {
  const ko = locale === 'ko'
  const [activeTab, setActiveTab] = useState<Tab>('100m')
  const [artistFilter, setArtistFilter] = useState('')

  const tab = TABS.find((t) => t.key === activeTab)!

  const artists = useMemo(() => {
    const set = new Set(stats.filter((s) => s[tab.daysKey] !== null).map((s) => s.artist_name))
    return [...set].sort()
  }, [stats, tab])

  const filtered = useMemo(() => {
    let list = stats.filter((s) => s[tab.daysKey] !== null)
    if (artistFilter) list = list.filter((s) => s.artist_name === artistFilter)
    return list.sort((a, b) => (a[tab.daysKey] as number) - (b[tab.daysKey] as number))
  }, [stats, tab, artistFilter])

  if (stats.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
        <p className="text-zinc-500 text-lg mb-2">📭</p>
        <p className="text-zinc-400">{ko ? '마일스톤 데이터 수집 중입니다.' : 'Milestone data is being collected.'}</p>
        <p className="text-zinc-600 text-sm mt-1">
          {ko
            ? 'GitHub Actions에서 --milestones 옵션으로 수동 실행해주세요.'
            : 'Run manually with --milestones in GitHub Actions.'}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* 탭 */}
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => {
          const count = stats.filter((s) => s[t.daysKey] !== null).length
          return (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setArtistFilter('') }}
              className={[
                'px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                activeTab === t.key
                  ? `bg-zinc-800 border border-zinc-600 ${t.color}`
                  : 'text-zinc-500 hover:text-white border border-transparent',
              ].join(' ')}
            >
              {t.label}
              <span className="ml-1.5 text-xs font-normal text-zinc-600">({count})</span>
            </button>
          )
        })}
      </div>

      {/* 인사이트 */}
      <InsightCards stats={stats} tab={tab} locale={locale} />

      {/* 바 차트 */}
      <MilestoneBarChart stats={stats} tab={tab} locale={locale} />

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={artistFilter}
          onChange={(e) => setArtistFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600"
        >
          <option value="">{ko ? '전체 아티스트' : 'All artists'}</option>
          {artists.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        {artistFilter && (
          <button
            onClick={() => setArtistFilter('')}
            className="px-3 py-2 text-xs text-zinc-500 hover:text-white border border-zinc-800 rounded-xl transition-colors"
          >
            {ko ? '초기화' : 'Reset'}
          </button>
        )}
        <p className="text-xs text-zinc-600 self-center ml-1">
          {ko ? `${filtered.length}곡` : `${filtered.length} songs`}
        </p>
      </div>

      {/* 테이블 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="hidden sm:grid grid-cols-[3rem_1fr_1fr_8rem_9rem_7rem] gap-2 px-5 py-2.5 text-xs text-zinc-600 font-medium border-b border-zinc-800">
          <span className="text-center">#</span>
          <span>{ko ? '곡명' : 'Title'}</span>
          <span>{ko ? '아티스트' : 'Artist'}</span>
          <span className={`text-right ${tab.color}`}>{tab.label} {ko ? '달성' : ''}</span>
          <span className="text-right">{ko ? '달성일' : 'Reached on'}</span>
          <span className="text-right">{ko ? '발매일' : 'Released'}</span>
        </div>

        <div className="divide-y divide-zinc-800/50">
          {filtered.map((s, i) => {
            const days = s[tab.daysKey] as number
            const reachedAt = s[tab.dateKey] as string | null
            return (
              <div key={s.id} className={`px-5 py-3 hover:bg-zinc-800/40 transition-colors ${i < 3 && !artistFilter ? 'bg-zinc-800/20' : ''}`}>
                {/* Desktop */}
                <div className="hidden sm:grid grid-cols-[3rem_1fr_1fr_8rem_9rem_7rem] gap-2 items-center">
                  <span className={`text-center font-bold text-sm ${
                    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
                  }`}>{i + 1}</span>
                  <div>
                    <span className="text-sm text-white font-medium">{s.track_title}</span>
                    <Timeline stat={s} tabs={TABS} locale={locale} />
                  </div>
                  <span className="text-sm text-zinc-400 truncate">{s.artist_name}</span>
                  <span className={`text-sm font-mono font-bold text-right ${tab.color}`}>
                    {fmtDays(days, ko)}
                  </span>
                  <span className="text-xs text-zinc-500 text-right whitespace-nowrap">
                    {fmtDate(reachedAt, locale)}
                  </span>
                  <span className="text-xs text-zinc-600 text-right">
                    {s.release_date ? new Date(s.release_date + 'T00:00:00').getFullYear() : '–'}
                  </span>
                </div>

                {/* Mobile */}
                <div className="sm:hidden flex items-center gap-3">
                  <span className={`w-6 text-center font-bold text-xs shrink-0 ${
                    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-zinc-300' : i === 2 ? 'text-amber-600' : 'text-zinc-600'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{s.track_title}</p>
                    <p className="text-xs text-zinc-500 truncate">{s.artist_name}</p>
                    <Timeline stat={s} tabs={TABS} locale={locale} />
                  </div>
                  <span className={`text-sm font-mono font-bold shrink-0 ${tab.color}`}>
                    {fmtDays(days, ko)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-center py-12 text-zinc-600 text-sm">
            {ko ? '데이터 없음' : 'No data'}
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-700 text-center">
        {ko ? '출처: kworb.net · 마일스톤 데이터는 수동 수집 (월 1회 권장)' : 'Source: kworb.net · Milestone data collected manually (recommended monthly)'}
      </p>
    </>
  )
}
