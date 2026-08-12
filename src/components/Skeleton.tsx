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

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="ml-auto h-6 w-24" />
                <Skeleton className="ml-auto h-3 w-16" />
              </div>
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
