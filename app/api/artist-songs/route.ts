import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const artistId = searchParams.get('artistId')

  if (!artistId || artistId === 'undefined') return NextResponse.json([])

  // Hot 100 chart id
  const { data: chart } = await supabase
    .from('charts').select('id').eq('slug', 'billboard-hot-100').single()
  if (!chart) return NextResponse.json([])

  // 해당 아티스트의 모든 트랙 + 차트 통계
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, title')
    .eq('artist_id', artistId)

  if (!tracks || tracks.length === 0) return NextResponse.json([])

  const trackIds = tracks.map((t) => t.id)

  const { data: entries } = await supabase
    .from('chart_entries')
    .select('track_id, rank, chart_date')
    .eq('chart_id', chart.id)
    .in('track_id', trackIds)
    .order('chart_date', { ascending: true })

  if (!entries) return NextResponse.json([])

  // track별 집계
  const trackMap = new Map(tracks.map((t) => [t.id, t.title]))
  const stats: Record<number, { title: string; peak_rank: number; total_weeks: number; first_chart_date: string; last_chart_date: string }> = {}

  for (const e of entries) {
    const tid = e.track_id
    if (!stats[tid]) {
      stats[tid] = {
        title: trackMap.get(tid) ?? '',
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
