# Portfolio Risk Analyzer

Analyze stock portfolio risk using live Yahoo Finance data. Combines
portfolio-level risk metrics, technical analysis, stop-loss recommendations,
and news into a single dashboard.

> **Disclaimer:** This tool is for informational purposes only. It is not
> financial advice.

## Features

The dashboard is organized into seven tabs.

**Portfolio Analysis** — Enter tickers, share counts, and optionally your
average cost. Returns a weighted risk score built from volatility, beta,
drawdown, diversification, and concentration, plus unrealized P&L when cost
basis is provided. Includes an allocation breakdown and a correlation heatmap
showing how much your holdings actually move together. Beta is shown with R²
versus SPY and a 95% interval so a slope that does not actually describe the
stock is visible as a low R², not a fake-precise 1.30. Positions can be typed
in or pasted in bulk — see [Importing holdings](#importing-holdings).

Average cost is the price paid per share. It is optional: leave it blank and
the risk metrics still work, but you lose unrealized P&L, the break-even line
on charts, and the Safety Stops tab's read on whether a stop locks in a gain.

Each holding can also carry a sell reminder: a take-profit price, a sell-by
date, or both. After Analyze, every name gets a suggested weekly plan — for
example “Sell by this Friday · target $317” — from nearby resistance or about
3% above the live price. Use that plan or type your own. Those live on each
holding under Portfolio Analysis, compared against the live price, and persist
with the portfolio. A price hit or a due date surfaces at the top of that
section so you do not have to open every row. This is not a stop-loss — stops
still live on the Safety Stops tab.

**Investment Thesis** — Search a ticker and get a structured write-up: whether
to kick the name out, how the business creates / captures / protects value, a
plain-vanilla thesis, the main ways it can be wrong, and a reverse DCF that
solves for the return already priced in. Buy and sell prices are the levels
where that implied return clears a Treasury-plus-8% hurdle or sags to
Treasury-plus-4%. Loss-making or highly leveraged names are labeled Pass
instead of inventing a buy price. Same-industry names from the scan universe
are listed as comparisons, not alerts.

**Breakout Scanner** — Ranks stocks by breakout likelihood using proximity to
resistance and how past breakouts resolved, then lifts durable businesses
(profitable, real margins) above similar chart setups that look speculative.
Search accepts either a ticker or a company name. **Open thesis** jumps to the
Investment Thesis tab for that name.

**Dips & Shorts** — Finds oversold candidates and pairs each one with an entry
case, expected timing, and a stop level. Sweeps a universe of roughly 85 liquid
large caps plus the day's trending symbols. A strict/balanced/broad control sets
how weak a setup may be and still show up, since on a calm day very little
clears the default screen. After the technical screen, a business-quality grade
from filings (profit, cash flow, leverage) re-ranks the list so a dip in a
durable earner beats a similar dip in a speculative name. The top 12 picks
refresh every second; the rest hold their scan-time values so the poll payload
stays bounded.

**Safety Stops** — Recommends a stop-loss price for every holding at once, with
the reasoning behind each. Several candidates are evaluated — support
invalidation, 1.5× and 2.0× ATR(14), and a volatility-based loss cap, plus a
widened stop when the symbol has past dips that failed to recover — and the
result shows the formula and rationale for the one selected rather than just
printing a number.

**Copy Trading** — Latest SEC Form 13F holdings for large managers (Berkshire,
Pershing Square, Scion, Citadel, and others), plus a search box for a person,
fund, or CIK. Quarter-over-quarter share changes are shown as opened / added /
cut / exited. Huge books show the top 50 positions (and the largest share
changes) so a Citadel filing does not dump thousands of rows. This is the
official delayed long book, not live copy-trading and not a stock screener.

**News & Events** — High-impact headlines, upcoming earnings dates, and news
filtered to the symbols you actually hold.

Across all tabs: portfolios are saved in the browser and restored on return,
charts plot your cost basis, and the header shows live market status alongside a
countdown to the next open or close.

### Chart Ranges

Every price chart offers 1D, 7D, 1M, 3M, 1Y, and 5Y. Bar size scales with the
span — one-minute bars for a single day, fifteen-minute for a week, daily for
the middle spans, weekly for five years — so no chart carries more than a few
hundred points.

The 1M, 3M, and 1Y spans are cut from the two years of daily bars the page
already holds, so switching between them costs no requests and keeps the moving
averages continuous. Only 1D, 7D, and 5Y call `/api/chart`, and each response is
cached server-side. Moving averages are hidden outside the daily spans, since a
"20-period" line means something different on weekly or one-minute bars.

### Profiles

People sharing a computer each get their own profile, selected from the header
menu. Switching swaps the entire set of saved and in-progress portfolios, and
logging out returns to a picker so the next person's data is not sitting on
screen. The menu also shows how long the current profile has been signed in.

This is data separation, not authentication. Profiles have no passwords and
anyone at the keyboard can select any of them — the shared site password is
what controls access, and profiles only decide whose holdings are displayed.

### Importing holdings

**Paste holdings** takes a table copied off a brokerage page, CSV or TSV from a
spreadsheet, loose lines like `AAPL 12 178.40`, or JSON. Column order is
ticker, shares, average cost, and the cost is optional. It runs entirely in the
browser, so it needs no API key and costs nothing.

Screenshots are handled without an OCR service: the dialog offers a copyable
prompt to send to ChatGPT or Claude along with the image, and their reply
pastes straight in. An existing chat subscription covers that, and parsing real
text is more reliable than reading pixels.

Everything lands in an editable review table first, and nothing reaches the
portfolio without passing through it. A misread share count or cost basis would
silently distort every risk and P&L figure downstream, so implausible values are
flagged, duplicate tickers are merged with a share-weighted average cost, and
unreadable rows are reported rather than guessed at.

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

The scanner, batch, and 13F endpoints fan out or parse large filings, so they
set `maxDuration = 60` to clear Vercel's default 10-second function timeout.
Copy Trading reads SEC EDGAR; if those requests return 403, set `SEC_USER_AGENT`
to your app name and a contact email.

## How Risk Is Calculated

| Metric | Description |
|--------|-------------|
| **Volatility** | Standard deviation of daily log returns, annualized (× √252) |
| **Beta** | Sensitivity to SPY on date-aligned returns, with R² and a 95% interval |
| **Sharpe Ratio** | Excess return over volatility, using a live Treasury risk-free rate |
| **Max Drawdown** | Largest peak-to-trough decline in the last year |
| **Risk Score** | Composite 0–100 score from volatility, beta, and drawdown |
| **R² vs SPY** | Share of daily moves that line up with the market; r² from the same fit as beta |
| **Business quality** | Durable / Fair / Speculative / Pass from profit, FCF, margins, and leverage — used to re-rank scanner hits |
| **Implied return** | Reverse DCF: fade conservative growth to 2.5% over 8 years and solve for the discount rate that matches today's EV or market cap |
| **RSI** | Wilder's smoothing; returns neutral 50 on a flat series |
| **Resistance** | Clustered local price highs from recent history |
| **Breakout** | Price crossing resistance/support with volume confirmation |

Returns are logarithmic, beta is computed only over dates present in both the
stock and benchmark series, and annualization uses 252 trading days. R² is the
square of the Pearson correlation with SPY from that same regression — the
share of daily moves the market actually explains. A high R² means beta is a
useful description; a low R² means the name does not track the market. The
thesis tab's implied return is a reverse DCF: conservative growth faded to
2.5%, solved for the discount rate that matches today's enterprise value (or
market cap if earnings are used instead of free cash flow).

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
avoids hydration mismatches between server and client render. Storage keys are
namespaced per profile; switching profiles reloads every scoped store rather
than leaving a cached snapshot of the previous person's data on screen.
Pre-profile data is migrated into a first profile on upgrade so nothing is lost.

**Market clock.** The countdown is computed from the Eastern-time wall clock
(`src/lib/market-hours.ts`) rather than polled, so it ticks every second with
no network cost. It knows regular hours and weekends but not holidays, so it
is reconciled against the live market state from the quote feed — when the two
disagree the feed wins and the countdown is hidden rather than shown wrong.

## Testing

```bash
npm test
```

258 tests covering the financial math (volatility, beta, Sharpe, drawdown,
correlation, R² and reliability of the SPY regression), technical indicators (RSI, ATR, moving averages, support and
resistance), sell-reminder urgency (price hit, due date, approaching), 13F
parse, quarter-over-quarter trades, and the top-50 display cap, reverse DCF
and business-quality grades used by the thesis tab, cache
behavior including coalescing and stale-on-error, rate limit enforcement, the
password gate, profile isolation and migration, market hours across weekends
and both daylight and standard time, and both import parsers including the
comma-versus-digit-grouping ambiguity in pasted tables.

## Theming

The palette follows Robinhood: true black chrome, green for gains and primary
actions, an orange-red for losses.

It is implemented by redefining Tailwind's color scales in `src/app/globals.css`
rather than renaming classes throughout the app, so a single file drives the
whole theme. The catch is that the family names no longer describe the hue —
`blue` is the green primary, `violet` is the lime highlight. The block at the
top of that file maps each family to its role. Change a value there and it
propagates everywhere; adding a new component means picking the family by role,
not by color name.

Solid fills carry black text rather than white. Robinhood's own buttons read
that way, and white on a bright green sits around 3:1 contrast, which is below
the readable threshold for body-sized text.

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS v4
- [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) for market data
- Recharts for visualization
- Vitest for tests

## Credits

Made by Regis.
