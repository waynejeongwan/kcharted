import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Link } from '@/navigation'
import KpopMilestonesClient from './KpopMilestonesClient'
import type { Metadata } from 'next'

export interface MilestoneStat {
  id: number
  track_title: string
  artist_name: string
  spotify_track_id: string | null
  release_date: string | null
  total_streams: number
  days_to_100m: number | null
  days_to_500m: number | null
  days_to_1b: number | null
  reached_100m_at: string | null
  reached_500m_at: string | null
  reached_1b_at: string | null
}

async function getData(): Promise<MilestoneStat[]> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('kpop_spotify_stats')
      .select(`
        id, track_title, artist_name, spotify_track_id, release_date, total_streams,
        days_to_100m, days_to_500m, days_to_1b,
        reached_100m_at, reached_500m_at, reached_1b_at
      `)
      // 마일스톤 중 하나라도 있는 것만
      .not('days_to_100m', 'is', null)
      .order('days_to_100m', { ascending: true })
      .limit(500)
    return data ?? []
  } catch {
    return []
  }
}

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const ko = locale === 'ko'
  const title = ko ? '최단 스트리밍 달성 순위 (100M / 500M / 1B)' : 'Fastest Streaming Milestones (100M / 500M / 1B)'
  const description = ko
    ? 'K-pop 곡이 1억, 5억, 10억 스트리밍에 얼마나 빨리 도달했는지 비교합니다.'
    : 'How fast K-pop songs reached 100M, 500M, and 1B streams on Spotify.'
  return { title, description }
}

export default async function KpopMilestonesPage({ params }: Props) {
  const { locale } = await params
  const ko = locale === 'ko'
  const stats = await getData()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← {ko ? '홈' : 'Home'}
      </Link>
      <div className="mb-8">
        <p className="text-xs text-violet-400 font-semibold uppercase tracking-wide mb-1">
          ⚡ Spotify K-pop
        </p>
        <h1 className="text-3xl font-bold text-white mb-2">
          {ko ? '최단 스트리밍 달성 순위' : 'Fastest Streaming Milestones'}
        </h1>
        <p className="text-zinc-400 text-sm">
          {ko
            ? 'K-pop 곡이 100M · 500M · 1B 스트리밍에 도달하기까지 걸린 일수 비교'
            : 'Days taken for K-pop songs to reach 100M · 500M · 1B streams on Spotify'}
        </p>
      </div>
      <KpopMilestonesClient stats={stats} locale={locale} />
    </div>
  )
}
