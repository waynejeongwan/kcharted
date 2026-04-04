import Link from 'next/link'

const CHARTS = [
  {
    slug: 'billboard-hot-100',
    name: 'Billboard Hot 100',
    desc: '미국 최고 권위의 싱글 차트',
    color: 'from-red-500 to-rose-700',
    icon: '🔥',
    href: '/charts/billboard-hot-100',
  },
  {
    slug: 'kpop',
    name: 'K-pop on Billboard Hot 100',
    desc: '역대 Hot 100 K-pop 아티스트 순위 & 기록',
    color: 'from-pink-500 to-rose-700',
    icon: '🇰🇷',
    href: '/kpop',
  },
  {
    slug: 'billboard-200',
    name: 'Billboard 200',
    desc: '미국 앨범 차트 Top 200',
    color: 'from-orange-500 to-amber-700',
    icon: '💿',
    href: '/charts/billboard-200',
  },
  {
    slug: 'spotify-global-top-50',
    name: 'Spotify Global Top 50',
    desc: '전 세계에서 가장 많이 재생된 곡',
    color: 'from-green-500 to-emerald-700',
    icon: '🎵',
    href: '/charts/spotify-global-top-50',
  },
  {
    slug: 'spotify-korea-top-50',
    name: 'Spotify Korea Top 50',
    desc: '한국에서 가장 많이 재생된 곡',
    color: 'from-blue-500 to-indigo-700',
    icon: '🎶',
    href: '/charts/spotify-korea-top-50',
  },
]

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-bold mb-4 tracking-tight">🎵 kcharted</h1>
        <p className="text-zinc-400 text-lg">
          Billboard, Spotify, Melon — 글로벌 음원 차트를 한 곳에서
        </p>
      </div>

      <div className="grid gap-4 mb-8">
        {CHARTS.map((chart) => (
          <Link
            key={chart.slug}
            href={chart.href}
            className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-600 transition-all hover:-translate-y-0.5"
          >
            <div className={`absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity bg-gradient-to-br ${chart.color}`} />
            <div className="relative flex items-center gap-4">
              <span className="text-4xl">{chart.icon}</span>
              <div>
                <h2 className="font-bold text-lg text-white">{chart.name}</h2>
                <p className="text-zinc-400 text-sm mt-0.5">{chart.desc}</p>
              </div>
              <span className="ml-auto text-zinc-600 group-hover:text-white transition-colors text-xl">→</span>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-center text-zinc-600 text-sm mt-10">매일 오전 6시 업데이트</p>
    </div>
  )
}
