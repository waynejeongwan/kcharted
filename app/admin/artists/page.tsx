import { createSupabaseServerClient } from '@/lib/supabase-server'
import ArtistsTable from './ArtistsTable'

interface PageProps {
  searchParams: Promise<{ filter?: string; page?: string; q?: string }>
}

export default async function AdminArtistsPage({ searchParams }: PageProps) {
  const { filter, page: pageStr, q } = await searchParams
  const page = parseInt(pageStr ?? '1')
  const pageSize = 50
  const offset = (page - 1) * pageSize

  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('artists')
    .select('id, name, is_kpop, genres, spotify_id', { count: 'exact' })
    .order('name')
    .range(offset, offset + pageSize - 1)

  if (filter === 'kpop') query = query.eq('is_kpop', true)
  else if (filter === 'unknown') query = query.is('is_kpop', null)
  else if (filter === 'non-kpop') query = query.eq('is_kpop', false)

  if (q) query = query.ilike('name', `%${q}%`)

  const { data: artists, count } = await query

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">아티스트 관리</h1>
        <span className="text-zinc-500 text-sm">{count?.toLocaleString()}명</span>
      </div>

      <ArtistsTable
        artists={artists ?? []}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        filter={filter}
        q={q}
      />
    </div>
  )
}
