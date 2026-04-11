import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const artistId = searchParams.get('artistId')

  if (!artistId || artistId === 'undefined') return NextResponse.json([])

  const { data: chart } = await supabase
    .from('charts').select('id').eq('slug', 'billboard-200').single()
  if (!chart) return NextResponse.json([])

  // canonical 포함 - 본인 + 파생 아티스트 모두
  const { data: allArtists } = await supabase
    .from('artists')
    .select('id')
    .or(`id.eq.${artistId},canonical_artist_id.eq.${artistId}`)
  if (!allArtists || allArtists.length === 0) return NextResponse.json([])

  const artistIds = allArtists.map((a) => a.id)

  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, title, cover_url')
    .in('artist_id', artistIds)
    .eq('is_album', true)
  if (!tracks || tracks.length === 0) return NextResponse.json([])

  const trackIds = tracks.map((t) => t.id)

  const PAGE = 1000
  const allEntries: { track_id: number; rank: number; chart_date: string }[] = []
  let from = 0
  while (true) {
    const { data: page } = await supabase
      .from('chart_entries')
      .select('track_id, rank, chart_date')
      .eq('chart_id', chart.id)
      .in('track_id', trackIds)
      .order('chart_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (!page || page.length === 0) break
    allEntries.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  const entries = allEntries
  if (entries.length === 0) return NextResponse.json([])

  const trackMap = new Map(tracks.map((t) => [t.id, { title: t.title, cover_url: t.cover_url }]))
  const stats: Record<number, {
    title: string
    cover_url: string | null
    peak_rank: number
    total_weeks: number
    first_chart_date: string
    last_chart_date: string
  }> = {}

  for (const e of entries) {
    const tid = e.track_id
    if (!stats[tid]) {
      stats[tid] = {
        title: trackMap.get(tid)?.title ?? '',
        cover_url: trackMap.get(tid)?.cover_url ?? null,
        peak_rank: e.rank,
        total_weeks: 1,
        first_chart_date: e.chart_date,
        last_chart_date: e.chart_date,
      }
    } else {
      if (e.rank < stats[tid].peak_rank) stats[tid].peak_rank = e.rank
      stats[tid].total_weeks += 1
      if (e.chart_date > stats[tid].last_chart_date) stats[tid].last_chart_date = e.chart_date
    }
  }

  const result = Object.values(stats)
    .sort((a, b) => a.peak_rank - b.peak_rank || b.total_weeks - a.total_weeks)

  return NextResponse.json(result)
}
