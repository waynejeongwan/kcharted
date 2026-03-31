// 로그인 페이지는 admin layout의 인증 체크 없이 렌더
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
