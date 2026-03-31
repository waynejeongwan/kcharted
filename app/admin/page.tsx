import { createSupabaseServerClient } from '@/lib/supabase-server'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createSupabaseServerClient()

  const [
    { count: artistCount },
    { count: trackCount },
    { count: chartCount },
    { count: entryCount },
    { count: kpopCount },
  ] = await Promise.all([
    supabase.from('artists').select('*', { count: 'exact', head: true }),
    supabase.from('tracks').select('*', { count: 'exact', head: true }),
    supabase.from('charts').select('*', { count: 'exact', head: true }),
    supabase.from('chart_entries').select('*', { count: 'exact', head: true }),
    supabase.from('artists').select('*', { count: 'exact', head: true }).eq('is_kpop', true),
  ])

  const stats = [
    { label: '아티스트', value: artistCount?.toLocaleString() ?? '-', icon: '🎤', href: '/admin/artists' },
    { label: 'K-pop 아티스트', value: kpopCount?.toLocaleString() ?? '-', icon: '🇰🇷', href: '/admin/artists?filter=kpop' },
    { label: '트랙', value: trackCount?.toLocaleString() ?? '-', icon: '🎵', href: '/admin/tracks' },
    { label: '차트', value: chartCount?.toLocaleString() ?? '-', icon: '📈', href: '/admin/charts' },
    { label: '차트 항목', value: entryCount?.toLocaleString() ?? '-', icon: '🗂️', href: '/admin/chart-entries' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-600 transition-colors"
          >
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-zinc-500 text-sm mt-0.5">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h2 className="font-semibold mb-4 text-zinc-300">빠른 링크</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/admin/artists?filter=kpop" className="text-sm px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-center transition-colors">
            K-pop 아티스트 관리
          </Link>
          <Link href="/admin/artists?filter=unknown" className="text-sm px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-center transition-colors">
            미분류 아티스트
          </Link>
          <Link href="/admin/tracks" className="text-sm px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-center transition-colors">
            트랙 관리
          </Link>
          <Link href="/" target="_blank" className="text-sm px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-center transition-colors">
            사이트 보기 ↗
          </Link>
        </div>
      </div>
    </div>
  )
}
