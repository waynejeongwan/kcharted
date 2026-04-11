import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data: chart } = await supabase
    .from('charts').select('id').eq('slug', 'billboard-200').single()
  if (!chart) return NextResponse.json([])

  // K-pop 아티스트 전체
  const { data: kpopArtists } = await supabase
    .from('artists')
    .select('id, name')
    .eq('is_kpop', true)
  if (!kpopArtists || kpopArtists.length === 0) return NextResponse.json([])

  const artistIds = kpopArtists.map((a) => a.id)

  // K-pop 아티스트들의 앨범 트랙
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, artist_id')
    .in('artist_id', artistIds)
    .eq('is_album', true)
  if (!tracks || tracks.length === 0) return NextResponse.json([])

  const trackIds = tracks.map((t) => t.id)
  const trackToArtist = new Map(tracks.map((t) => [t.id, t.artist_id]))

  // Billboard 200 차트 항목
  const { data: entries } = await supabase
    .from('chart_entries')
    .select('track_id, rank')
    .eq('chart_id', chart.id)
    .in('track_id', trackIds)
  if (!entries) return NextResponse.json([])

  // 아티스트별 집계
  const artistMap = new Map(kpopArtists.map((a) => [a.id, a.name]))
  const stats: Record<number, {
    artist: string
    artist_id: number
    best_peak_rank: number
    albums_at_peak: number
    total_albums: number
    total_weeks: number
    album_peaks: Map<number, number> // track_id → best rank
  }> = {}

  for (const e of entries) {
    const artistId = trackToArtist.get(e.track_id)
    if (!artistId) continue

    if (!stats[artistId]) {
      stats[artistId] = {
        artist: artistMap.get(artistId) ?? '',
        artist_id: artistId,
        best_peak_rank: e.rank,
        albums_at_peak: 0,
        total_albums: 0,
        total_weeks: 0,
        album_peaks: new Map(),
      }
    }

    const s = stats[artistId]
    s.total_weeks += 1

    const prevPeak = s.album_peaks.get(e.track_id)
    if (prevPeak === undefined || e.rank < prevPeak) {
      s.album_peaks.set(e.track_id, e.rank)
    }
    if (e.rank < s.best_peak_rank) s.best_peak_rank = e.rank
  }

  // albums_at_peak, total_albums 계산
  const result = Object.values(stats).map((s) => {
    const albumRanks = Array.from(s.album_peaks.values())
    return {
      artist: s.artist,
      artist_id: s.artist_id,
      best_peak_rank: s.best_peak_rank,
      albums_at_peak: albumRanks.filter((r) => r === s.best_peak_rank).length,
      total_albums: albumRanks.length,
      total_weeks: s.total_weeks,
    }
  })

  result.sort((a, b) =>
    a.best_peak_rank - b.best_peak_rank ||
    b.albums_at_peak - a.albums_at_peak ||
    b.total_albums - a.total_albums
  )

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
