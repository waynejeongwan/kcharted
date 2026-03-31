import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'kcharted',
  description: 'Global music charts in one place — Billboard, Spotify, Melon and more.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={{ backgroundColor: '#09090b' }}>
      <body
        className={inter.className}
        style={{ backgroundColor: '#09090b', color: '#fafafa', minHeight: '100vh', margin: 0 }}
      >
        <header className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
          <a href="/" className="text-xl font-bold tracking-tight" style={{ color: '#fafafa' }}>
            kcharted
          </a>
          <span className="text-zinc-500 text-xs mt-0.5">global music charts</span>
        </header>
        <main>{children}</main>
        <footer className="border-t border-zinc-800 px-6 py-6 text-center text-zinc-500 text-sm mt-16">
          © {new Date().getFullYear()} kcharted · Data from Spotify, Billboard, Melon
        </footer>
      </body>
    </html>
  )
}
