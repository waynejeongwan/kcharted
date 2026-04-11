export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6">
        <div className="h-4 w-20 bg-zinc-800 rounded mb-4 animate-pulse" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-zinc-800 rounded-full animate-pulse" />
          <div>
            <div className="h-6 w-40 bg-zinc-800 rounded animate-pulse mb-1" />
            <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
          </div>
        </div>
        <div className="h-10 bg-zinc-800 rounded-xl animate-pulse" />
      </div>
      <div className="divide-y divide-zinc-800/60">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="w-7 h-4 bg-zinc-800 rounded animate-pulse" />
            <div className="w-9 h-9 bg-zinc-800 rounded-md animate-pulse" />
            <div className="flex-1 h-4 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
