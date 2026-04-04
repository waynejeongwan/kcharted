import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const chartId = searchParams.get('chartId')
  const date = searchParams.get('date')

  if (!chartId || !date) return NextResponse.json([])

  const { data } = await supabase
    .from('chart_entries')
    .select(`rank, tracks ( title, cover_url, is_album, artists ( name, is_kpop ) )`)
    .eq('chart_id', chartId)
    .eq('chart_date', date)
    .order('rank', { ascending: true })

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
