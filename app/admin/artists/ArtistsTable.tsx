'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

interface Artist {
  id: string
  name: string
  is_kpop: boolean | null
  genres: string[] | null
  spotify_id: string | null
}

interface Props {
  artists: Artist[]
  total: number
  page: number
  pageSize: number
  filter?: string
  q?: string
}

const FILTER_TABS = [
  { value: undefined, label: '전체' },
  { value: 'kpop', label: '🇰🇷 K-pop' },
  { value: 'non-kpop', label: '비 K-pop' },
  { value: 'unknown', label: '⚠️ 미분류' },
]

export default function ArtistsTable({ artists, total, page, pageSize, filter, q }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(q ?? '')
  const [saving, setSaving] = useState<string | null>(null)
  const [localData, setLocalData] = useState<Artist[]>(artists)

  // 필터/검색 변경 시 새 데이터로 동기화
  useEffect(() => {
    setLocalData(artists)
  }, [artists])

  const totalPages = Math.ceil(total / pageSize)

  function navigate(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams()
    if (params.filter) sp.set('filter', params.filter)
    if (params.q) sp.set('q', params.q)
    if (params.page && params.page !== '1') sp.set('page', params.page)
    startTransition(() => router.push(`/admin/artists?${sp.toString()}`))
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    navigate({ filter, q: search })
  }

  async function toggleKpop(artist: Artist, value: boolean | null) {
    setSaving(artist.id)
    const supabase = getSupabaseBrowserClient()
    await supabase.from('artists').update({ is_kpop: value }).eq('id', artist.id)
    setLocalData((prev) =>
      prev.map((a) => (a.id === artist.id ? { ...a, is_kpop: value } : a))
    )
    setSaving(null)
  }

  function kpopBadge(val: boolean | null) {
    if (val === true) return <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded-full text-xs font-medium">K-pop</span>
    if (val === false) return <span className="px-2 py-0.5 bg-zinc-700 text-zinc-400 rounded-full text-xs">비 K-pop</span>
    return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">미분류</span>
  }

  return (
    <div>
      {/* 필터 탭 */}
      <div className="flex gap-2 mb-4">
        {FILTER_TABS.map((tab) => (
          <button
            key={String(tab.value)}
            onClick={() => navigate({ filter: tab.value })}
            className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
              filter === tab.value
                ? 'bg-white text-black font-medium'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="아티스트 이름 검색..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 text-sm"
        />
        <button
          type="submit"
          className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm transition-colors"
        >
          검색
        </button>
      </form>

      {/* 테이블 */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-5 py-3 font-medium">아티스트</th>
              <th className="text-left px-5 py-3 font-medium">장르</th>
              <th className="text-left px-5 py-3 font-medium">K-pop 여부</th>
              <th className="text-left px-5 py-3 font-medium">변경</th>
            </tr>
          </thead>
          <tbody>
            {localData.map((artist) => (
              <tr key={artist.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-5 py-3 font-medium text-white">{artist.name}</td>
                <td className="px-5 py-3 text-zinc-500 text-xs max-w-xs truncate">
                  {artist.genres?.join(', ') || '-'}
                </td>
                <td className="px-5 py-3">{kpopBadge(artist.is_kpop)}</td>
                <td className="px-5 py-3">
                  {saving === artist.id ? (
                    <span className="text-zinc-500 text-xs">저장 중...</span>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => toggleKpop(artist, true)}
                        disabled={artist.is_kpop === true}
                        className="px-2.5 py-1 rounded-lg bg-pink-500/20 hover:bg-pink-500/40 text-pink-300 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        K-pop ✓
                      </button>
                      <button
                        onClick={() => toggleKpop(artist, false)}
                        disabled={artist.is_kpop === false}
                        className="px-2.5 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        비 K-pop
                      </button>
                      <button
                        onClick={() => toggleKpop(artist, null)}
                        disabled={artist.is_kpop === null}
                        className="px-2.5 py-1 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        초기화
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {localData.length === 0 && (
          <div className="text-center py-12 text-zinc-500">검색 결과 없음</div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-zinc-500">
          <span>{total.toLocaleString()}명 중 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}명</span>
          <div className="flex gap-2">
            {page > 1 && (
              <button
                onClick={() => navigate({ filter, q, page: String(page - 1) })}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
              >
                ← 이전
              </button>
            )}
            <span className="px-4 py-2 bg-zinc-900 rounded-xl">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <button
                onClick={() => navigate({ filter, q, page: String(page + 1) })}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
              >
                다음 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
