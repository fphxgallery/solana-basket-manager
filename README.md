# solana-basket-manager

Self-hosted Solana token basket manager. Holds any SPL/Token-2022 tokens at target weights and automatically rebalances the portfolio on drift or schedule via Jupiter swaps. Includes a React dashboard for monitoring and control.

![Version](https://img.shields.io/badge/version-3.3.2-22d3ee) ![Node.js](https://img.shields.io/badge/Node.js-22-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Solana](https://img.shields.io/badge/Solana-mainnet-purple)

![Dashboard screenshot](docs/screenshot-v3.1.4.png)

## Features

- **Token basket** — hold any SPL/Token-2022 tokens at target weights; auto-rebalances on drift or schedule via Jupiter swaps
- **Dynamic USDC profit-taking** — USDC target weight shifts automatically based on basket PnL%
- **PnL tracking** — SOL and USD baseline, 24h portfolio chart
- **Live dashboard** — React + Tailwind "Cyber grid" UI with SSE updates: 50/50 hero (merged P&L + HWM bar + wallet tile ‖ distribution donut + legend), full-width portfolio chart, holdings table with per-token allocation bars and `DYNAMIC`/`RESERVE` pills, rebalance log, and a consolidated Settings tab (wallet, basket settings, Telegram, daily report)
- **Token-protected API** — all endpoints require an auth token (cookie or bearer); dashboard has a sign-in screen
- **Configurable at runtime** — basket weights, drift threshold, rebalance interval — no restart needed

## Requirements

- Linux server (systemd) or Docker
- Node.js 22+ (installer handles this via nvm)
- [Helius](https://helius.dev) API key (RPC)

## Quick Start (systemd)

```bash
git clone https://github.com/fphxgallery/solana-basket-manager
cd solana-basket-manager
bash install.sh
```

The installer will:
1. Install Node.js 22 via nvm if not present
2. Prompt for API keys, generate a dashboard auth token, and create `.env`
3. Install dependencies and build server + client
4. Register and start `basket-manager.service` via systemd

Open the dashboard at `http://<server-ip>:3420` and sign in with the token the installer printed (the `API_TOKEN` value in `.env`).

## Quick Start (Docker)

```bash
cp .env.example .env   # fill in HELIUS_API_KEY + generate API_TOKEN
docker compose up -d
```

By default Docker binds to `127.0.0.1` only. Set `BIND_ADDR=0.0.0.0` in `.env` for LAN access.

## Configuration

### `.env`

```env
HELIUS_API_KEY=your_helius_key
API_TOKEN=...                      # required — openssl rand -hex 32
PORT=3420
#BIND_ADDR=0.0.0.0                 # Docker only — default 127.0.0.1
```

### Basket

Add tokens in the Basket tab. Each token needs:
- **Mint address** — any SPL or Token-2022 token
- **Target weight %** — must sum to 100 across all tokens

Rebalance settings (live, no restart):
- **Drift threshold %** — trigger rebalance when any token drifts this far from target
- **Rebalance interval (hours)** — force rebalance even without drift

## Architecture

```
src/
  index.ts        — Express server entry
  auth.ts         — API token auth (cookie / bearer)
  bot.ts          — timers, balance + basket refresh, rebalance orchestration
  basket.ts       — holdings refresh, pricing, rebalance execution, dynamic USDC weight
  basket-store.ts — basket config + state persistence (data/basket.json)
  value-history.ts — 24h portfolio value snapshots (data/value-history.json)
  api.ts          — REST + SSE endpoints
  config.ts       — env + app config
  wallet.ts       — keypair create/import/load (wallet/keypair.json)
client/src/
  App.tsx         — dashboard shell: state, SSE, data fetching, handlers, tab routing, modals
  lib.tsx         — shared helpers + primitives (Card, Modal, CopyButton, palette, formatters)
  types.ts        — shared API/state types
  index.css       — Cyber-grid theme tokens (CSS vars) + animated background
  components/      — CyberBackground, AppHeader, HeroCard, PortfolioChartCard,
                    Tabs, HoldingsTable, SettingsTab
```

**Rebalance flow:** 3-min timer prices holdings via Jupiter → every 5 min, if any token's drift exceeds the threshold (or the interval has elapsed) → sell overweight tokens, then buy underweight with the proceeds (Jupiter lite swaps, sent direct).

## Data Files

All runtime data lives in `data/` (excluded from git):

| File | Contents |
|---|---|
| `data/basket.json` | token list, weights, settings, price cache, PnL baseline |
| `data/value-history.json` | 24h portfolio value snapshots |
| `data/trades.json` | rebalance trade log (persists across restarts) |
| `wallet/keypair.json` | hot wallet keypair — **back this up** |

## Useful Commands

```bash
# Logs
journalctl -u basket-manager -f

# Restart
sudo systemctl restart basket-manager

# Status
sudo systemctl status basket-manager
```

## Security Notes

- Wallet keypair is a **hot wallet** — only fund it with what you're willing to put in the basket
- All API routes require `API_TOKEN` (HttpOnly cookie via dashboard sign-in, or `Authorization: Bearer` header)
- Docker binds `127.0.0.1` by default; prefer an SSH tunnel over `BIND_ADDR=0.0.0.0` when possible
- Traffic is plain HTTP — put a reverse proxy with TLS in front if exposing beyond localhost/LAN
- `.env` and `wallet/` are gitignored and never committed

## Changelog

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

## License

MIT
