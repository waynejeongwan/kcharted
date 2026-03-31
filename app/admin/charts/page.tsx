import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function AdminChartsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: charts } = await supabase
    .from('charts')
    .select('id, name, slug, source')
    .order('name')

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">차트 관리</h1>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="text-left px-5 py-3 font-medium">차트명</th>
              <th className="text-left px-5 py-3 font-medium">슬러그</th>
              <th className="text-left px-5 py-3 font-medium">소스</th>
            </tr>
          </thead>
          <tbody>
            {(charts ?? []).map((chart) => (
              <tr key={chart.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="px-5 py-3 text-white font-medium">{chart.name}</td>
                <td className="px-5 py-3 text-zinc-500 font-mono text-xs">{chart.slug}</td>
                <td className="px-5 py-3">
                  <span className="px-2 py-0.5 bg-zinc-700 rounded-full text-zinc-400 text-xs">{chart.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
