export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-800/80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function PortfolioSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading portfolio analysis">
      <section className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900/80 to-blue-950/40 p-5">
        <div className="mb-5 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-3"
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-5 w-16" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <section
            key={index}
            className="surface-2 rounded-2xl p-5"
          >
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-4 h-52 w-full" />
          </section>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-700/60">
        <div className="grid grid-cols-6 gap-2 border-b border-slate-800 px-4 py-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-12" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 last:border-0"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex gap-8">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="hidden h-4 w-14 sm:block" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-slate-500">
        Fetching market data from Yahoo Finance and computing risk metrics…
      </p>
    </div>
  );
}
