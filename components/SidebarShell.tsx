'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import LocaleSwitcher from './LocaleSwitcher'

export default function SidebarShell({
  children,
  locale,
}: {
  children: React.ReactNode
  locale: string
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content — pushed right on desktop */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-zinc-400 hover:text-white p-1 rounded"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <rect y="3" width="20" height="2" rx="1" />
              <rect y="9" width="20" height="2" rx="1" />
              <rect y="15" width="20" height="2" rx="1" />
            </svg>
          </button>

          {/* Logo (mobile only — desktop shows in sidebar) */}
          <a
            href={`/${locale}`}
            className="lg:hidden text-base font-bold text-white tracking-tight"
          >
            🎵 K-charted
          </a>

          <div className="flex-1" />
          <LocaleSwitcher />
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="border-t border-zinc-800 px-6 py-6 text-center text-zinc-500 text-sm">
          © {new Date().getFullYear()} kcharted · Data from Spotify, Billboard
        </footer>
      </div>
    </div>
  )
}
