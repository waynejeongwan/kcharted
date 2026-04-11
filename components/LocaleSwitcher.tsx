'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/navigation'

export default function LocaleSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()

  function switchLocale(next: 'en' | 'ko') {
    router.replace(pathname, { locale: next })
  }

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <button
        onClick={() => switchLocale('en')}
        className={`hover:text-white transition-colors ${locale === 'en' ? 'text-white font-semibold' : ''}`}
      >
        EN
      </button>
      <span>·</span>
      <button
        onClick={() => switchLocale('ko')}
        className={`hover:text-white transition-colors ${locale === 'ko' ? 'text-white font-semibold' : ''}`}
      >
        KO
      </button>
    </div>
  )
}
