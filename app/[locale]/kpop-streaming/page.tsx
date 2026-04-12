import { createSupabaseServerClient } from '@/lib/supabase-server'
import { Link } from '@/navigation'
import KpopStreamingClient from './KpopStreamingClient'
import type { Metadata } from 'next'

export interface StreamingStat {
  id: number
  track_title: string
  artist_name: string
  main_artist: string | null
  spotify_track_id: string | null
  release_date: string | null
  total_streams: number
  daily_streams: number | null
  updated_at: string
}

export interface Snapshot {
  stat_id: number
  snapshot_date: string
  total_streams: number
}

async function getData(): Promise<{
  stats: StreamingStat[]
  snapshots: Snapshot[]
}> {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: stats } = await supabase
      .from('kpop_spotify_stats')
      .select('id, track_title, artist_name, main_artist, spotify_track_id, release_date, total_streams, daily_streams, updated_at')
      .order('total_streams', { ascending: false })
      .limit(500)

    if (!stats || stats.length === 0) return { stats: [], snapshots: [] }

    // 상위 5개 트랙의 스냅샷 데이터 (성장 곡선용)
    const top5ids = stats.slice(0, 5).map((s) => s.id)
    const { data: snapshots } = await supabase
      .from('kpop_stream_snapshots')
      .select('stat_id, snapshot_date, total_streams')
      .in('stat_id', top5ids)
      .order('snapshot_date', { ascending: true })

    return { stats: stats ?? [], snapshots: snapshots ?? [] }
  } catch {
    return { stats: [], snapshots: [] }
  }
}

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const ko = locale === 'ko'
  const title = ko ? 'K-pop 누적 스트리밍 순위 (Spotify)' : 'K-pop All-Time Streaming Rankings (Spotify)'
  const description = ko
    ? '역대 가장 많이 스트리밍된 K-pop 곡 순위. Spotify 기준 누적 스트리밍 수.'
    : 'The most-streamed K-pop songs of all time on Spotify.'
  return { title, description }
}

export default async function KpopStreamingPage({ params }: Props) {
  const { locale } = await params
  const ko = locale === 'ko'
  const { stats, snapshots } = await getData()

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/" className="text-zinc-500 text-sm hover:text-white transition-colors mb-6 block">
        ← {ko ? '홈' : 'Home'}
      </Link>
      <div className="mb-8">
        <p className="text-xs text-green-400 font-semibold uppercase tracking-wide mb-1">
          🎵 Spotify K-pop
        </p>
        <h1 className="text-3xl font-bold text-white mb-2">
          {ko ? 'K-pop 누적 스트리밍 순위' : 'K-pop All-Time Streaming Rankings'}
        </h1>
        <p className="text-zinc-400 text-sm">
          {ko
            ? 'Spotify 기준 역대 가장 많이 스트리밍된 K-pop 곡 · kworb.net 데이터'
            : 'Most-streamed K-pop songs of all time on Spotify · Data: kworb.net'}
        </p>
      </div>
      <KpopStreamingClient stats={stats} snapshots={snapshots} locale={locale} />
    </div>
  )
}
