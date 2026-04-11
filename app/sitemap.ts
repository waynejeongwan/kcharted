import type { MetadataRoute } from 'next'

const BASE_URL = 'https://kcharted.com'
const LOCALES = ['en', 'ko']
const CHART_SLUGS = ['billboard-hot-100', 'billboard-200', 'spotify-global-top-50', 'spotify-korea-top-50']

// 주요 K-pop 아티스트 슬러그 (RPC 결과 기반)
const KPOP_ARTIST_SLUGS = [
  'bts', 'blackpink', 'stray-kids', 'twice', 'enhypen', 'newjeans',
  'ateez', 'aespa', 'le-sserafim', 'jimin', 'jung-kook', 'j-hope',
  'jin', 'v', 'psy', 'illit', 'nmixx', 'katseye', 'p1harmony',
  'wonder-girls', 'cl', '(g)i-dle',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  for (const locale of LOCALES) {
    // 홈
    entries.push({
      url: `${BASE_URL}/${locale}`,
      changeFrequency: 'daily',
      priority: 1.0,
    })
    // K-pop 랭킹 페이지
    entries.push({
      url: `${BASE_URL}/${locale}/kpop`,
      changeFrequency: 'weekly',
      priority: 0.9,
    })
    entries.push({
      url: `${BASE_URL}/${locale}/kpop-albums`,
      changeFrequency: 'weekly',
      priority: 0.9,
    })
    // 차트 페이지
    for (const slug of CHART_SLUGS) {
      entries.push({
        url: `${BASE_URL}/${locale}/charts/${slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }
    // 아티스트 상세 페이지
    for (const slug of KPOP_ARTIST_SLUGS) {
      entries.push({
        url: `${BASE_URL}/${locale}/kpop/${slug}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
      entries.push({
        url: `${BASE_URL}/${locale}/kpop-albums/${slug}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }
  }

  return entries
}
