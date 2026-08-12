# Portfolio Risk Analyzer

Analyze stock portfolio risk using live Yahoo Finance data. Combines
portfolio-level risk metrics, technical analysis, stop-loss recommendations,
and news into a single dashboard.

> **Disclaimer:** This tool is for informational purposes only. It is not
> financial advice.

## Features

The dashboard is organized into five tabs.

**Portfolio Analysis** — Enter tickers, share counts, and optionally your
average cost. Returns a weighted risk score built from volatility, beta,
drawdown, diversification, and concentration, plus unrealized P&L when cost
basis is provided. Includes an allocation breakdown and a correlation heatmap
showing how much your holdings actually move together.

**Breakout Scanner** — Ranks stocks by breakout likelihood using proximity to
resistance and how past breakouts resolved. Search accepts either a ticker or a
company name.

**Dips & Shorts** — Finds oversold candidates and pairs each one with an entry
case, expected timing, and a stop level.

**Safety Stops** — Recommends a stop-loss price for every holding at once, with
the reasoning behind each. Several candidates are evaluated — support
invalidation, 1.5× and 2.0× ATR(14), and a volatility-based loss cap, plus a
widened stop when the symbol has past dips that failed to recover — and the
result shows the formula and rationale for the one selected rather than just
printing a number.

**News & Events** — High-impact headlines, upcoming earnings dates, and news
filtered to the symbols you actually hold.

Across all tabs: portfolios are saved in the browser and restored on return,
charts support range selection and plot your cost basis, and a live market
status indicator shows whether the session is open.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A sample portfolio loads
and analyzes itself on first visit, so the dashboard is populated before you
enter anything. Sample data is labeled with a badge; replace the holdings with
your own and click **Analyze Portfolio**.

Other scripts:

```bash
npm test         # run the test suite once
npm run test:watch
npm run lint
npm run build
```

## Password Protection

The whole site sits behind a single password, so a deployed link can be shared
with a few people without being public.

Set `SITE_PASSWORD` in your hosting provider's environment variables (see
`.env.example`). Visitors get a browser login prompt; the username is ignored
unless you also set `SITE_USERNAME`.

Two behaviors worth knowing:

- **Locally**, leaving `SITE_PASSWORD` unset disables the gate entirely, so
  `npm run dev` works without any setup.
- **In production**, leaving it unset returns a 503 instead of serving the app.
  A forgotten environment variable should not silently publish the site.

API routes are behind the gate too, so nobody can skip the prompt by calling an
endpoint directly. Authentication is HTTP Basic, which means credentials are
only safe over HTTPS — deploy behind TLS, never plain HTTP.

## Deploying

Push the repository to GitHub, import it at
[vercel.com/new](https://vercel.com/new), and add `SITE_PASSWORD` under
**Settings → Environment Variables** before the first deploy.

The scanner and batch endpoints fan out to many symbols, so they set
`maxDuration = 60` to clear Vercel's default 10-second function timeout.

## How Risk Is Calculated

| Metric | Description |
|--------|-------------|
| **Volatility** | Standard deviation of daily log returns, annualized (× √252) |
| **Beta** | Sensitivity to SPY, computed on date-aligned returns |
| **Sharpe Ratio** | Excess return over volatility, using a live Treasury risk-free rate |
| **Max Drawdown** | Largest peak-to-trough decline in the last year |
| **Risk Score** | Composite 0–100 score from volatility, beta, and drawdown |
| **RSI** | Wilder's smoothing; returns neutral 50 on a flat series |
| **Resistance** | Clustered local price highs from recent history |
| **Breakout** | Price crossing resistance/support with volume confirmation |

Returns are logarithmic, beta is computed only over dates present in both the
stock and benchmark series, and annualization uses 252 trading days.

## Architecture Notes

**Caching.** Every upstream call goes through a TTL cache with request
coalescing (`src/lib/cache.ts`). Coalescing is the important half: without it,
N clients polling on the same interval produce N upstream calls even when the
first is still in flight. TTLs are tuned per data type — 5 seconds for quotes,
15 minutes for daily history. The cache serves stale data if a refresh fails,
and evicts least-recently-used entries past a cap. It lives in module scope, so
a multi-instance deployment would want a shared store like Redis.

**Rate limiting.** A token-bucket limiter keyed by client IP
(`src/lib/rate-limit.ts`) protects every route, with budgets by cost class:
expensive scans get 10/min, live polling gets 120/min.

**Demo mode.** Scanner results for first-time visitors are precomputed and
cached for 10 minutes, so the expensive fan-out runs a handful of times an hour
regardless of traffic.

**Persistence.** Saved portfolios use `useSyncExternalStore` over
`localStorage` (`src/lib/persistent-store.ts`) rather than an effect, which
avoids hydration mismatches between server and client render.

## Testing

```bash
npm test
```

103 tests covering the financial math (volatility, beta, Sharpe, drawdown,
correlation), technical indicators (RSI, ATR, moving averages, support and
resistance), cache behavior including coalescing and stale-on-error, rate limit
enforcement, and the password gate.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4
- [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) for market data
- Recharts for visualization
- Vitest for tests
