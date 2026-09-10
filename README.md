# Portfolio Risk Analyzer

A dashboard for portfolio risk, investment theses, options, and name-finding — live Yahoo Finance data, not a broker.

Live site: https://stock-analyzer-lake-nu.vercel.app/

> Informational only. Not financial advice.

## Research

**Portfolio** — Enter tickers, shares, and optional average cost (type them or paste a table). You get a weighted risk score from volatility, beta, drawdown, diversification, and concentration, plus P&L when cost is set, an allocation breakdown, and a correlation heatmap. Beta includes R² vs SPY so a slope that does not describe the name is visible. Each holding can carry a sell-by date and target price; a suggested weekly plan is offered after you analyze. Portfolios stay in this browser.

**Thesis** — Search a name for a write-up: whether to pass, how the business makes money, a plain thesis, how it can be wrong, and a reverse DCF for the return already priced in. Buy/sell boxes are nearby chart levels. Loss-making or highly leveraged names are labeled Pass. Related peers and 13F holders show when available, with links to the 10-K, IR, and earnings.

**Options** — Read a listed chain as volatility, not a directional bet. ATM IV vs 30-day realized vol sets the stance. A print inside the expiry is treated as event vol, not a VRP sale. Structures match Robinhood Trade → Trade options → Strategy builder (Level 2 or Level 3). Naked shorts are never recommended. A recommendation is one ticket — or sit out — by expected expiration P&L. Compare best match, highest chance, and highest expected return. Click the chain to build a custom structure (ask to buy, bid to sell).

**News** — Headlines and upcoming earnings/dividends on your holdings and large caps. Prints show a projected EPS and a beat chance; dividends show coverage. Options on an earnings card opens the expiry that still contains the print.

## Find names

**Breakouts** — Ranks names by proximity to resistance and how past breakouts resolved, then lifts durable businesses above similar speculative setups.

**Dips & Shorts** — Oversold names with an entry case, timing, and a stop, re-ranked by business quality from filings.

**Stops** — A stop-loss price for every holding, with the formula and rationale (support, ATR, volatility cap).

**Copy Trading** — Look up a 13F manager. Quarter-over-quarter changes and new buys sit above the book. Open a thesis or see overlap with your portfolio.

**Vol screen** — Liquid optionable names ranked by fill quality, then IV vs 30-day RV. Click a row to open the Options desk.

The header shows live market status and a countdown to the next open or close. Charts cover 1D through 5Y. People sharing a computer can use separate profiles so holdings do not mix.

## How things are calculated

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
| **Event hit chance** | Student-t predictive from this name's EPS surprises (shrunk toward a 67% market prior), or dividend coverage from payout / FCF |
| **Implied volatility** | Invert the listed mid/ask with Black–Scholes–Merton; Yahoo's chain IV is used when present. European formula on American equity options |
| **Realized volatility** | Yang–Zhang (overnight + range) when identified, else Garman–Klass or close-to-close log-return σ × √252 |
| **IV / RV** | ATM IV divided by 30-day RV. Above ~1.15 is rich (short-vol candidate); below ~0.85 is cheap. Theta is not treated as edge |
| **Options picks** | Recommendation is one Robinhood Strategy builder ticket at the selected approval level, ranked by expected P&L (win × chance + miss × chance), or sit out. Chance of profit is P(expiration P&L > 0) under ATM IV. Expected return uses 30-day RV. Uncovered shorts are never a ticket |
| **Options liquidity** | Tight = ATM spread ≤ 5% of mid and OI ≥ 1,000. Thin = OI < 200. Wide = spread > 12%. Vol screen ranks fill quality before IV/RV |
| **RSI** | Wilder's smoothing; returns neutral 50 on a flat series |
| **Resistance** | Clustered local price highs from recent history |
| **Breakout** | Price crossing resistance/support with volume confirmation |

Returns are logarithmic, beta is computed only over dates present in both the stock and benchmark series, and annualization uses 252 trading days. R² is the square of the Pearson correlation with SPY from that same regression — the share of daily moves the market actually explains. A high R² means beta is a useful description; a low R² means the name does not track the market. Implied return is a reverse DCF: conservative growth faded to 2.5%, solved for the discount rate that matches today's enterprise value (or market cap if earnings are used instead of free cash flow).

Made by Regis.
