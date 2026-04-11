'use client'

import { useRouter } from '@/navigation'
import { useState, useMemo } from 'react'
import { useLocale } from 'next-intl'

type ChartDateRow = { chart_date: string; kpop_count: number }

interface Props {
  slug: string
  selectedDate: string
  availableDates: ChartDateRow[]
  dateStrings: string[]
  yearStats: Record<string, number>
  prevDate: string | null
  nextDate: string | null
  weekly: boolean
}

export default function DatePicker({ slug, selectedDate, availableDates, dateStrings, yearStats, prevDate, nextDate, weekly }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)

  const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US'

  function formatDateLabel(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    if (weekly) {
      return locale === 'ko'
        ? d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' 주'
        : 'Week of ' + d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    }
    return d.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const byYear = useMemo(() => {
    const map: Record<number, ChartDateRow[]> = {}
    for (const row of availableDates) {
      const year = parseInt(row.chart_date.slice(0, 4))
      if (!map[year]) map[year] = []
      map[year].push(row)
    }
    return map
  }, [availableDates])

  const years = useMemo(() =>
    Object.keys(byYear).map(Number).sort((a, b) => b - a),
    [byYear]
  )

  function goToDate(date: string) {
    router.push(`/charts/${slug}?date=${date}`)
    setOpen(false)
    setSelectedYear(null)
  }

  function openPicker() {
    setSelectedYear(parseInt(selectedDate.slice(0, 4)))
    setOpen(true)
  }

  function formatWeekLabel(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => prevDate && goToDate(prevDate)}
        disabled={!prevDate}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold transition-colors disabled:opacity-25 disabled:cursor-not-allowed text-lg"
      >
        ‹
      </button>

      <div className="relative flex-1">
        <button
          onClick={openPicker}
          className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-2 transition-colors"
        >
          <span className="text-zinc-400 text-sm">📅</span>
          <span className="text-zinc-100 font-semibold text-sm">{formatDateLabel(selectedDate)}</span>
          <span className="text-zinc-500 text-xs">▾</span>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSelectedYear(null) }} />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-20 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden"
              style={{ width: '340px' }}>

              {selectedYear === null ? (
                <div className="p-3">
                  <p className="text-zinc-500 text-xs mb-2 px-1">
                    {locale === 'ko' ? '연도 선택' : 'Select Year'}
                  </p>
                  <div className="grid grid-cols-4 gap-1">
                    {years.map(year => {
                      const kpopTotal = yearStats[String(year)] ?? 0
                      const isCurrentYear = parseInt(selectedDate.slice(0, 4)) === year
                      return (
                        <button
                          key={year}
                          onClick={() => setSelectedYear(year)}
                          className={`py-2 px-1 rounded-lg transition-colors leading-none ${
                            isCurrentYear ? 'bg-zinc-500 text-white' : 'text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          <span className="text-sm font-medium">{year}</span>
                          {kpopTotal > 0 && (
                            <sup className="text-[11px] text-pink-400 font-bold ml-0.5">{kpopTotal}</sup>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setSelectedYear(null)}
                      className="text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                      {locale === 'ko' ? '← 연도' : '← Year'}
                    </button>
                    <span className="text-white font-bold">
                      {locale === 'ko' ? `${selectedYear}년` : selectedYear}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">
                    {byYear[selectedYear]?.slice().reverse().map(row => {
                      const isSelected = row.chart_date === selectedDate
                      return (
                        <button
                          key={row.chart_date}
                          onClick={() => goToDate(row.chart_date)}
                          className={`py-2 px-1 rounded-lg transition-colors leading-none ${
                            isSelected ? 'bg-zinc-500 text-white font-bold' : 'text-zinc-300 hover:bg-zinc-700'
                          }`}
                          title={row.chart_date}
                        >
                          <span className="text-xs font-mono">{formatWeekLabel(row.chart_date)}</span>
                          {row.kpop_count > 0 && (
                            <sup className="text-[11px] text-pink-400 font-bold ml-0.5">{row.kpop_count}</sup>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => nextDate && goToDate(nextDate)}
        disabled={!nextDate}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold transition-colors disabled:opacity-25 disabled:cursor-not-allowed text-lg"
      >
        ›
      </button>

      {nextDate && (
        <button
          onClick={() => goToDate(dateStrings[0])}
          className="text-xs px-3 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors whitespace-nowrap"
        >
          {locale === 'ko' ? '최신 ↑' : 'Latest ↑'}
        </button>
      )}
    </div>
  )
}
