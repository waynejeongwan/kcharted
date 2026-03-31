'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  slug: string
  selectedDate: string
  availableDates: string[]
  prevDate: string | null
  nextDate: string | null
  weekly: boolean
}

function formatDate(dateStr: string, weekly: boolean) {
  const d = new Date(dateStr + 'T00:00:00')
  if (weekly) {
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) + ' 주'
  }
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function DatePicker({ slug, selectedDate, availableDates, prevDate, nextDate, weekly }: Props) {
  const router = useRouter()
  const [showDropdown, setShowDropdown] = useState(false)

  function goToDate(date: string) {
    router.push(`/charts/${slug}?date=${date}`)
    setShowDropdown(false)
  }

  const recentDates = availableDates.slice(0, 80)

  return (
    <div className="flex items-center gap-2">
      {/* 이전 */}
      <button
        onClick={() => prevDate && goToDate(prevDate)}
        disabled={!prevDate}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold transition-colors disabled:opacity-25 disabled:cursor-not-allowed text-lg"
      >
        ‹
      </button>

      {/* 날짜 드롭다운 */}
      <div className="relative flex-1">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-xl px-4 py-2 transition-colors"
        >
          <span className="text-zinc-400 text-sm">📅</span>
          <span className="text-zinc-100 font-semibold text-sm">{formatDate(selectedDate, weekly)}</span>
          <span className="text-zinc-500 text-xs">▾</span>
        </button>

        {showDropdown && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 z-20 bg-zinc-800 border border-zinc-600 rounded-xl overflow-hidden shadow-2xl w-60 max-h-72 overflow-y-auto">
              {recentDates.map((date) => (
                <button
                  key={date}
                  onClick={() => goToDate(date)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    date === selectedDate
                      ? 'bg-zinc-600 text-white font-semibold'
                      : 'text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {formatDate(date, weekly)}
                </button>
              ))}
              {availableDates.length > 80 && (
                <div className="px-4 py-2 text-zinc-500 text-xs border-t border-zinc-700">
                  총 {availableDates.length}개 · URL에 ?date=YYYY-MM-DD 직접 입력 가능
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 다음 */}
      <button
        onClick={() => nextDate && goToDate(nextDate)}
        disabled={!nextDate}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-bold transition-colors disabled:opacity-25 disabled:cursor-not-allowed text-lg"
      >
        ›
      </button>

      {/* 최신으로 */}
      {nextDate && (
        <button
          onClick={() => goToDate(availableDates[0])}
          className="text-xs px-3 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors whitespace-nowrap"
        >
          최신 ↑
        </button>
      )}
    </div>
  )
}
