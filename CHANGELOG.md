# Changelog

### v3.3.8
- **Price-impact gate** — skips a rebalance swap when the Jupiter quote's price impact exceeds the new `maxPriceImpactPct` setting (Basket Settings, default 2%, `0` = off). Blocks expensive fills into thin pools — the kind that cost 2.84% on a recent STIX leg — checked at quote time before the swap is sent. Gated swaps are logged to journalctl and folded into the rebalance Telegram report (`• skipped STIX → SOL (impact 2.8% > 2% cap)`), but deliberately kept out of the trade log and value chart since they're non-executions. Live-tunable, no restart. Note: a permanently thin token can stay gated and drift without rebalancing — the Telegram line surfaces it

### v3.3.7
- **Jupiter Lend read resilience.** The shared no-key lite host rate-limits (429) and times out (504); these were surfacing as failed reads that the v3.3.5 cache then had to absorb every cycle. Lend reads (`/tokens`, `/positions`, `/earnings`) now **retry with backoff** (honoring `Retry-After`) on 429/5xx, then fall back to a **4-minute per-endpoint cache with stale-on-error** — a burst of rate-limits is invisible to pricing/weights. The positions cache is invalidated after a deposit/withdraw so post-trade reads stay fresh. TTL exceeds the 3-min refresh interval, so most refreshes are served from cache, cutting call volume

### v3.3.6
- **Fix: duplicate "Lent" line in the daily Telegram report.** A leftover block printed the `🌱 Lent $X · Y% APY` line twice; the second slot was meant to be the `🌱 Earned` line (which only shows once realized lend earnings are above zero). Removed the dupe

### v3.3.5
- **Fix: Jupiter Lend read failure no longer triggers a phantom rebalance.** When the lend `/positions` call failed (e.g. a transient 504), the accounting fold treated the parked USDC as zero — the portfolio momentarily under-counted the lent sleeve, read `lendMint` as badly underweight, and liquidated the whole basket into USDC, then bought it all back the next cycle when the read recovered (a costly round-trip, plus a wasted Lend deposit/withdraw). The fold now **reuses the last successfully-read lent balance** on failure instead of zeroing it, so a transient read error is invisible to pricing/weights. On cold start with no cached balance, the bot **skips rebalancing for that cycle** rather than act on untrustworthy weights

### v3.3.4
- **Per-token price history** — logs each token's price (in SOL) and weight on every refresh to `data/token-history.json`, alongside the existing aggregate value chart. This is groundwork for offline rebalance-band backtesting, which the aggregate value history can't support since it lacks per-mint prices. Compact on disk (8 sig-fig prices to preserve tiny memecoin values, 2-decimal weights), 90-day retention, skips unpriced tokens so a bad quote can't poison the data. Forward-logging only — no backfill, so the dataset accrues from this release onward

### v3.3.3
- **Lend earnings tracking** — surfaces realized Jupiter Lend yield (distinct from the forward APY), pulled from Jupiter's `/earnings`: lifetime earned + a resettable "this period" total. Shown in Settings → Lending (with a reset link) and the daily Telegram report (`🌱 Earned $X lifetime · +$Y this period`). The period baseline seeds on first observation, so it won't retroactively count pre-existing yield

### v3.3.2
- Daily Telegram report shows the **Jupiter Lend** position (`🌱 Lent $X · Y% APY`) directly under the portfolio value line, when lending is on and funds are parked

### v3.3.1
- **Dynamic lending buffer** — the liquid buffer now sizes to rebalance demand instead of a flat percent: `max(buffer floor, drift multiple × drift threshold)` of the portfolio, so it never parks below what one rebalance can trim. New `lendBufferDriftMult` knob (default 2.5; 0 = static); `lendBufferPct` becomes the floor. Settings shows both inputs plus a live "effective buffer" readout

### v3.3.0
- **Jupiter Lend** integration — park idle USDC (the dynamic-weight/reserve sleeve) into Jupiter Lend Earn to accrue yield instead of sitting flat. Disabled by default; flip it on in Settings → Lending
- Keeps a configurable **liquid buffer** (% of total portfolio) in-wallet and deposits the rest; withdraws on demand to fund a rebalance, and **skips the swap rather than stalling** if a withdraw can't be served
- Lent balance is folded back into holdings before drift/weight math, so parking never makes the bot think USDC is underweight
- Holdings row and Settings show the live lent amount + APY; daily Telegram report adds a lending line; deposits and withdraw-failures send alerts
- New settings: `lendEnabled`, `lendMint`, `lendBufferPct`, `lendMinDepositUsd` (runtime, live-tunable)

### v3.2.0
- Rebalance log now shows a per-swap **execution cost** (Jupiter route price impact, in %) — dim normally, amber at ≥1% so expensive fills into thin pools stand out. Stored on each trade as `costBps`
- Hardened `.env` parsing: a `cleanEnv()` helper strips trailing inline `# comments` so an inline comment can no longer crash startup; `.env.example` comments moved to their own lines

### v3.1.9
- Rebalance swaps now use Jupiter **dynamic slippage** — slippage is estimated per route (tight on liquid pairs, looser on thin ones) up to a configurable cap, cutting slippage given away and reducing "slippage exceeded" fails. Tunable via `REBALANCE_DYNAMIC_SLIPPAGE` / `REBALANCE_SLIPPAGE_BPS`; the actual bps used is logged per swap

### v3.1.8
- Portfolio Value chart now marks each rebalance with a dashed cyan vertical line; confirmed swaps from one run are clustered into a single event, and markers track the active 24H/7D/30D/90D window

### v3.1.7
- Holdings table now shows each token's real logo (fetched from Jupiter by mint) with a cyan duotone overlay to match the theme; falls back to a monogram when no logo is found

### v3.1.6
- Added a **90D** window to the Portfolio Value chart; value-history retention extended from 30 to 90 days (the 90D view fills in as history accrues)

### v3.1.5
- Rebalance log rows now show the transaction signature as a clickable **Solscan** link, filling the dead space between the route and timestamp

### v3.1.0 – v3.1.4
- New **BALLAST** rebrand: animated cyan gradient title and a hull-with-waterline logo (header + favicon)
- Hero P&L bars relabeled to **ATH** plus a new **peak-decay** bar; both use spectrum gradient fills that track their value
- Holdings drift pills that round to `0.0%` now render gray; donut recolored to an 11-stop warm→cool spectrum
- **Dynamic Weight tab** redesigned — live profit-taking curve chart with editable breakpoints (replaces the full-width input stack)
- **Clear rebalance log** button (`POST /api/trades/clear`); rebalance log shows per-swap profit
- Layout cleanup: tab order, actions on the tab row, single-line holdings header, read-only target %, a11y labels, dynamic version pill

### v3.0.0
- **Dashboard redesign ("Cyber grid")** — full React client overhaul: opaque cards over an animated cyan gradient + grid, monospace data, cyan theme with semantic color overrides
- **50/50 hero card** (merged P&L + wallet tile · distribution donut) and a full-width portfolio value chart
- Holdings table with per-token allocation bars, drift pills, and `DYNAMIC` / `RESERVE` pills
- Bot control moved into the header; new consolidated **Settings** tab (wallet, basket settings, Telegram, daily report)
- Refactor: client split into `lib.tsx` + `components/`, theme tokens as CSS variables — no backend changes

### v2.3.0
- Feat: configurable dynamic weight token — any basket token can now be the profit-taking target (previously hardcoded to USDC); set via "Dynamic weight token" on the Dynamic Weight tab
- Feat: reserve floor — configure any token with a hard minimum weight % that the rebalancer will never drop below (option 2: parallel floor, does not steal from the configured target weight); set via "Reserve floor" on the Dynamic Weight tab
- Primary use case: yield-bearing stablecoins (USDY, sUSDS, etc.) as both the dynamic target and the reserve — always earning yield on the floor, profits shift more into it automatically

### v2.2.5
- Feat: daily Telegram report redesigned using Bot API 10.1 `sendRichMessage` — headings, `<p>` block layout, and a `<table bordered striped>` for holdings; falls back to standard `sendMessage` on error
- Feat: P&L line now uses ▲/▼ arrow and 📈/📉 icon; portfolio, SOL price, peak, and wallet each on their own line

### v2.2.4
- Feat: P&L card now shows HWM peak value and time-to-half-life countdown in the upper-right corner (visible when HWM is enabled)
- Feat: daily Telegram report now includes a Peak line (`🏔 Peak: $X.XX (Xd to ½)`) after P&L when HWM is active

### v2.2.3
- Fix: bad Jupiter quotes (thin-liquidity pool spikes) can no longer corrupt portfolio value, the high-water mark, or the chart — quotes where the derived price deviates >10× from the cached price are rejected and the cache is used instead
- Fix: `resetBaseline` now also resets the HWM — a poisoned HWM from a bad quote could previously persist for days even after pressing the reset button
- Fix: outlier snapshots (>10× or <0.1× the previous point) are now rejected before being written to `data/value-history.json`

### v2.2.2
- Fix daily report not sending: `>=` comparison replaces strict equality so a 60s timer drift can't cause a missed minute; use local date instead of UTC so the date doesn't flip at midnight UTC in non-UTC timezones

### v2.2.1
- Fix: min-swap fee gate no longer skips every swap when the SOL/USD price is unavailable (CoinGecko outage) — the floor only applies when a price is known
- Fix: rebalance buys are now funded by sell proceeds — sells execute first, the SOL balance is re-fetched, then buys are sized against the updated budget (previously buys were clamped to the pre-sell balance and could be dropped entirely)
- Refactor: per-swap quote/sign/send/confirm logic extracted into `performSwap()`

### v2.2.0
- Basket settings fields (drift threshold, rebalance interval, min swap) now display on a single row

### v2.1.9
- Add min-swap fee gate to `executeRebalance` — swaps worth less than the configured USD floor are skipped to prevent fee bleed on small drift corrections
- New "Min swap ($)" setting in basket settings panel (default $5, configurable at runtime)

### v2.1.8
- Rebalance log now paginates at 12 entries per page with prev/next controls

### v2.1.6
- Portfolio value chart now supports 24H / 7D / 30D windows — toggle buttons in the chart header
- Value history extended from 24h to 30 days of storage (`data/value-history.json`)
- Time axis labels adapt per window: HH:MM (24H), Weekday HH:MM (7D), Mon DD (30D)

### v2.1.5
- Fix daily report P&L sign: negative P&L now correctly shows `-$X.XX` instead of `$X.XX`
- Move SOL price onto its own line in the daily report (was appended to the Portfolio line)

### v2.1.4
- Fix TypeScript build error: `saveTelegram` and `disconnectTelegram` now include `reportEnabled`/`reportTime` in state updates to match the extended telegram state type added in v2.1.3

### v2.1.3
- Add daily Telegram report — sends portfolio value (USD + SOL), P&L, and per-token current/target weights
- New **Daily Report** card in the dashboard (below Telegram settings) with enable toggle, time picker (server local time), and Send Report Now button
- Report schedule persisted in `data/telegram.json`; time checked every minute by the bot

### v2.1.2
- Fix swap confirmation: on timeout, poll `getSignatureStatus` once (5s delay) before marking failed — prevents false-failed rebalance swaps on slow confirmation
- Fix HWM disk writes: `updateHwm` only writes on a genuinely new peak, not on every 3-min refresh at steady-state
- Fix buy swaps: reserve 0.01 SOL for gas across all buy swaps in a rebalance pass; buys skip if budget exhausted
- Persist rebalance trade log to `data/trades.json` — log survives service restarts; totals recomputed from disk on startup

### v2.1.1
- Add **Dynamic Weight** tab — dedicated UI for the profit-taking curve and high-water mark settings
- Profit-taking curve is now fully configurable: editable [PnL%, USDC%] breakpoints, cap above max, add/delete rows, reset to defaults
- High-water mark controls moved from Basket Settings into the Dynamic Weight tab

### v2.1.0
- Add high-water mark profit lock for dynamic USDC weight — USDC target weight locks in at portfolio peaks and releases gradually via configurable exponential decay (default 7-day half-life)
- Configurable from dashboard: toggle + half-life input in Basket Settings panel
- HWM state (`hwmValueUsd`, `hwmCapturedAt`) persisted in `data/basket.json`, survives restarts
- Baseline reset does not affect HWM — profit lock persists through deposits (changed in v2.2.3: reset now also clears HWM)

### v2.0.3
- Add Telegram notifications — bot start/stop and rebalance summary (per-swap confirmed/failed)
- Configurable from the dashboard UI (TELEGRAM card); token stored in `data/telegram.json`, never exposed via API

### v2.0.2
- Fix phantom `pending` entries in rebalance log — dust-skipped swaps no longer added to trade history
- Deduplicate `getBalance` RPC call — wallet balance read from SOL balance already fetched by `refreshHoldings`
- Remove unused `ws` / `@types/ws` dependencies

### v2.0.1
- Fix `parseInt` precision on large Jupiter `outAmount` values (use `Number(BigInt(...))`)
- Remove unused installer prompts and dead dependencies
- Fix stale labels; rename `package.json` name to `solana-basket-manager`
