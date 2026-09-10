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

Made by Regis.
