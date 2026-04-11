import { createSupabaseServerClient } from '@/lib/supabase-server'
import AdminNav from './AdminNav'
import '../globals.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <html lang="ko" style={{ backgroundColor: '#09090b' }}>
        <body style={{ backgroundColor: '#09090b', color: '#fafafa', margin: 0 }}>
          {children}
        </body>
      </html>
    )
  }

  return (
    <html lang="ko" style={{ backgroundColor: '#09090b' }}>
      <body style={{ backgroundColor: '#09090b', color: '#fafafa', margin: 0 }}>
        <div className="min-h-screen bg-zinc-950 text-white">
          <AdminNav userEmail={user.email ?? ''} />
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  )
}
