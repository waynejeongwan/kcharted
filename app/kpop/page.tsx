import Link from 'next/link'
import KpopRankingsClient from './KpopRankingsClient'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export interface ArtistRanking {
  artist: string
  artist_id: number
  best_peak_rank: number
  songs_at_peak: number
  total_songs: number
  top40_songs: number
  total_weeks: number
}

async function getKpopRankings(): Promise<ArtistRanking[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_kpop_hot100_rankings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export default async function KpopPage() {
  const rankings = await getKpopRankings()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← 전체 차트
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">🇰🇷 K-pop on Billboard Hot 100</h1>
        <p className="text-zinc-400">Billboard Hot 100 역대 K-pop 아티스트 종합 기록</p>
      </div>

      <KpopRankingsClient rankings={rankings} />
    </div>
  )
}
