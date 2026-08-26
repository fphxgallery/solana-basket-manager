# Changelog

### v3.8.2
- **Fix: transient downward spikes in the value chart.** After the v3.8.1 unfreeze, isolated single-cycle dips (e.g. ~$6400 → ~$5900 and back) slipped under the 10× guard, got recorded, and stuck. Two changes: (1) `bot.ts` now skips the snapshot entirely when the book is under-priced — any holding priced 0, or `isLendFoldUntrusted()` — since those undervalue the total and are the usual dip cause; (2) `value-history.ts` replaced the 10× outlier gate with a **4%-move hold-and-confirm**: any >4% single-cycle move is held until a second consistent reading confirms it (real deposits/withdrawals and genuine swings still land, one cycle later; transient bad reads that revert are dropped). Sub-4% moves write through immediately, so normal chart motion isn't delayed. Existing bad points need a one-time cleanup (stop service, despike `data/value-history.json`, start)

### v3.8.1
- **Fix: chart frozen after a large deposit/withdrawal.** `recordSnapshot()` rejects any value >10× (or <1/10×) the last point as a bad CoinGecko quote. A big real top-up (~$450 → $6257, ~14×) tripped this on every cycle, so the value chart stuck at the pre-top-up level while the hero showed the new balance. The guard now holds an out-of-band reading and accepts it once 3 consistent readings (within 15% of each other) confirm a sustained level change — real deposits/withdrawals go through after ~3 cycles, transient bad quotes (which revert immediately) are still dropped

### v3.8.0
- **Portfolio hero — list layout** — reworked the hero away from the boxed stat tiles (which left the card feeling empty/blocky) into a two-column layout: a large 40px total value with USD P&L ($ over %) on the left, and a right-aligned stat list — wallet balance, value in SOL, SOL-denominated P&L, lent · APY, and SOL price — with the truncated wallet address + copy under a hairline. The ATH / peak-decay meters stay pinned to the bottom. Token count was dropped in favor of SOL price (which explains the USD-vs-SOL P&L divergence)

### v3.7.3
- **Hero stat tiles** — bottom-aligned the tile values (each tile is now a flex column with the value pushed to the bottom, so all four line up) and dropped their size 19 → 16px with `whitespace-nowrap`, fixing the LENT · APY tile wrapping onto two lines

### v3.7.2
- **Portfolio hero polish** — moved the four stat tiles down to sit just above the ATH / peak-decay meters (the empty gap now rises to the top of the card, under the value row), and bumped type up a step across the card: tile values 14 → 19px, total 30 → 32px, wallet balance 18 → 20px, P&L line and meter labels larger too

### v3.7.1
- **Portfolio hero stat strip** — the v3.7.0 hero redesign left a large empty band in the middle; filled it with a four-tile stat strip surfacing metrics not shown elsewhere on the main view: value in SOL, SOL-denominated P&L (green/red), the Jupiter Lend position (lent $ · APY, or "—" when lending is off/empty), and token count

### v3.7.0
- **Portfolio hero redesign** — reworked the left hero card. The wallet balance moved up beside the total value (label + SOL + truncated address + copy, right-aligned) instead of a pinned bottom tile, and the two HWM meters (ATH ratio, peak decay) now sit as two half-width bars in one row rather than stacked full-width. Same data, tighter and more balanced against the distribution donut

### v3.6.3
- **Settings layout** — moved the Lending (Jupiter Lend) card out of the left column and into the right column, stacked beneath Telegram / Daily Report. The left column previously carried three cards (Wallet, Basket settings, Lending) while the right had one tall card with empty space below; now both columns are roughly even height. No functional change

### v3.6.2
- **Compact Logs rows** — collapsed each rebalance/lending entry from two lines to a single line: status badge, route (or lend action), tx link, SOL value swapped, cost % / APY, and time all inline. Cut row height ~50%. Page size raised 12 → 15 rows. The long value/cost labels were trimmed ("0.0554 SOL" rather than "0.0554 SOL value swapped") to fit one line; lend note truncates if long

### v3.6.1
- **Distribution legend** — raised the token legend so its first row is level with the DISTRIBUTION heading, instead of being vertically centered against the donut (which left it hanging low). The heading stays in place; it's now absolutely positioned so the legend can top-align while the donut remains vertically centered between them

### v3.6.0
- **Denser holdings table** — cut row height ~40%. The per-token allocation mini-bar moved up inline with the symbol (and widened 96px → 130px, so small ~4–5% positions and their target tick are legible), the mint address dropped to a quieter second line, and the Jupiter Lend detail (`$X lent · Y% APY`) folded into that mint line instead of occupying its own third row. All cell padding tightened `py-2` → `py-1.5`. Same information, more rows on screen

### v3.5.2
- **Distribution donut** — added a 12th palette color (`#d4506a`, rose) to `CHART_COLORS`, so a 12-token basket no longer wraps around and reuses the first slice's red. Slots between the existing magenta and red on the color wheel

### v3.5.1
- **Metrics tab** — removed the explanatory footer caveat ("Grades the path taken…") for a cleaner one-screen layout. Cosmetic only

### v3.5.0
- **Metrics tab** — new **METRICS** tab sitting between Logs and Settings: a behavioral rebalance-quality report that grades the rebalancing actually executed, not a counterfactual band sweep. Leads with cost (the fresh `costBps` data): top tiles for **avg cost** (mean price impact %, amber ≥1%), **fill rate** (confirmed vs failed, amber <90% — fails burn priority fees), **rebalances** (event count + per week), and **turnover** (Σ SOL swapped). A *Cost drag* section totals SOL lost to price impact and lists the 3 most expensive fills (which thin-pool tokens bleed); a *Behavior* section shows cadence (mean/median/longest gap, span), token **churn** (SOL round-tripped — sold then re-bought), and top routes by volume. Entirely client-side over the existing in-memory trade log — no new endpoint, no stored data. The `rebalanceEvents` clustering helper was lifted out of `PortfolioChartCard` into `lib.tsx` and is now shared with the new pure `analyzeTrades()`. Metrics cover priced swaps only (pre-v3.2.0 fills lack impact data) over the recent trade window (last 100)

### v3.4.1
- **Logs tab polish** — the **All / Rebalances / Lending** filters moved out of their own in-panel row and up into the LOGS tab header, sitting left of the Clear logs button. Matches how BASKET keeps its actions (Rebalance / Edit basket) in the header, and reclaims a row of vertical space above the feed. Pills now match the header button sizing; behavior unchanged (filter still drives both the feed and which log Clear targets)

### v3.4.0
- **Logs tab (was Rebalance Log)** — renamed and unified into a single feed covering rebalance swaps *and* Jupiter Lend activity, with **All / Rebalances / Lending** filter pills and a new icon. Lend deposits and withdrawals (incl. failures, and the withdraw-to-fund-a-sell context) now show as their own rows with a Solscan link and APY, instead of being console-only. Lending events are stored separately in `data/lending-log.json` and deliberately kept out of `trades.json` — so they never pollute rebalance cost/profit metrics or draw false markers on the value chart. The Clear button honors the active filter (clears rebalances, lending, or both). Backend: new `LendingEvent` store + `/api/lending/clear`, broadcast over SSE like trades

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
