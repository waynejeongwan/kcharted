import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ page?: string; chart?: string; date?: string }>
}

export default async function AdminChartEntriesPage({ searchParams }: PageProps) {
  const { page: pageStr, chart: chartSlug, date } = await searchParams
  const page = parseInt(pageStr ?? '1')
  const pageSize = 100
  const offset = (page - 1) * pageSize

  const supabase = await createSupabaseServerClient()

  // 차트 목록 (필터용)
  const { data: charts } = await supabase.from('charts').select('id, name, slug').order('name')

  let query = supabase
    .from('chart_entries')
    .select(`
      id, rank, chart_date,
      tracks(title, artists(name, is_kpop)),
      charts(name, slug)
    `, { count: 'exact' })
    .order('chart_date', { ascending: false })
    .order('rank')
    .range(offset, offset + pageSize - 1)

  if (chartSlug) {
    const chart = charts?.find((c) => c.slug === chartSlug)
    if (chart) query = query.eq('chart_id', chart.id)
  }
  if (date) query = query.eq('chart_date', date)

  const { data: entries, count } = await query

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">차트 항목</h1>
        <span className="text-zinc-500 text-sm">{count?.toLocaleString()}개</span>
      </div>

      {/* 필터 */}
      <form method="get" className="mb-4 flex gap-2 flex-wrap">
        <select name="chart" defaultValue={chartSlug ?? ''}
          className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-zinc-500">
          <option value="">전체 차트</option>
          {(charts ?? []).map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <input type="date" name="date" defaultValue={date ?? ''}
          className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-zinc-500"
        />
        <button type="submit"
          className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-sm transition-colors">
          필터 적용
        </button>
        <Link href="/admin/chart-entries"
          className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm transition-colors">
          초기화
        </Link>
      </form>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-5 py-3 font-medium w-16">순위</th>
              <th className="text-left px-5 py-3 font-medium">트랙</th>
              <th className="text-left px-5 py-3 font-medium">아티스트</th>
              <th className="text-left px-5 py-3 font-medium">차트</th>
              <th className="text-left px-5 py-3 font-medium">날짜</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((entry: any) => (
              <tr key={entry.id} className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${entry.tracks?.artists?.is_kpop ? 'bg-pink-950/10' : ''}`}>
                <td className="px-5 py-2.5 text-zinc-400 font-mono">#{entry.rank}</td>
                <td className="px-5 py-2.5 text-white">{entry.tracks?.title ?? '-'}</td>
                <td className="px-5 py-2.5 text-zinc-400 flex items-center gap-1.5">
                  {entry.tracks?.artists?.is_kpop && <span className="text-xs">🇰🇷</span>}
                  {entry.tracks?.artists?.name ?? '-'}
                </td>
                <td className="px-5 py-2.5 text-zinc-500 text-xs">{entry.charts?.name ?? '-'}</td>
                <td className="px-5 py-2.5 text-zinc-500 text-xs">{entry.chart_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries?.length && (
          <div className="text-center py-12 text-zinc-500">데이터 없음</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-zinc-500">
          <span>{count?.toLocaleString()}개 중 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count ?? 0)}개</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`/admin/chart-entries?page=${page - 1}${chartSlug ? `&chart=${chartSlug}` : ''}${date ? `&date=${date}` : ''}`}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">← 이전</Link>
            )}
            <span className="px-4 py-2 bg-zinc-900 rounded-xl">{page} / {totalPages}</span>
            {page < totalPages && (
              <Link href={`/admin/chart-entries?page=${page + 1}${chartSlug ? `&chart=${chartSlug}` : ''}${date ? `&date=${date}` : ''}`}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">다음 →</Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
