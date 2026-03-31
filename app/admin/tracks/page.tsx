import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function AdminTracksPage({ searchParams }: PageProps) {
  const { page: pageStr, q } = await searchParams
  const page = parseInt(pageStr ?? '1')
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('tracks')
    .select('id, title, artist_id, artists(name, is_kpop)', { count: 'exact' })
    .order('title')
    .range(offset, offset + pageSize - 1)

  if (q) query = query.ilike('title', `%${q}%`)

  const { data: tracks, count } = await query

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">트랙 관리</h1>
        <span className="text-zinc-500 text-sm">{count?.toLocaleString()}곡</span>
      </div>

      <form method="get" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="트랙 제목 검색..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 text-sm"
        />
        <button
          type="submit"
          className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm transition-colors"
        >
          검색
        </button>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-5 py-3 font-medium">트랙</th>
              <th className="text-left px-5 py-3 font-medium">아티스트</th>
              <th className="text-left px-5 py-3 font-medium">K-pop</th>
            </tr>
          </thead>
          <tbody>
            {(tracks ?? []).map((track: any) => (
              <tr key={track.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-5 py-3 text-white font-medium">{track.title}</td>
                <td className="px-5 py-3 text-zinc-400">
                  <Link
                    href={`/admin/artists?q=${encodeURIComponent(track.artists?.name ?? '')}`}
                    className="hover:text-white transition-colors"
                  >
                    {track.artists?.name ?? '-'}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  {track.artists?.is_kpop === true && (
                    <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded-full text-xs">K-pop</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tracks?.length && (
          <div className="text-center py-12 text-zinc-500">검색 결과 없음</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-zinc-500">
          <span>{count?.toLocaleString()}곡 중 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count ?? 0)}곡</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/tracks?page=${page - 1}${q ? `&q=${q}` : ''}`}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">← 이전</Link>
            )}
            <span className="px-4 py-2 bg-zinc-900 rounded-xl">{page} / {totalPages}</span>
            {page < totalPages && (
              <Link href={`/admin/tracks?page=${page + 1}${q ? `&q=${q}` : ''}`}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">다음 →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
