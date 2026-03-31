import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminNav from './AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // middleware가 /admin/login 제외 인증 처리하므로 여기선 nav만
  if (!user) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AdminNav userEmail={user.email ?? ''} />
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
