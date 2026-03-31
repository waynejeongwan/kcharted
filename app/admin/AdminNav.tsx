'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

const NAV_ITEMS = [
  { href: '/admin', label: '대시보드', icon: '📊' },
  { href: '/admin/artists', label: '아티스트', icon: '🎤' },
  { href: '/admin/tracks', label: '트랙', icon: '🎵' },
  { href: '/admin/charts', label: '차트', icon: '📈' },
  { href: '/admin/chart-entries', label: '차트 항목', icon: '🗂️' },
]

export default function AdminNav({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <nav className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
        <Link href="/admin" className="font-bold text-lg text-white mr-2">
          🎵 kcharted <span className="text-zinc-500 text-sm font-normal">admin</span>
        </Link>

        <div className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${
                pathname === item.href
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{userEmail}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>
    </nav>
  )
}
