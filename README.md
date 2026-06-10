# solana-basket-manager

Self-hosted Solana token basket manager. Holds any SPL/Token-2022 tokens at target weights and automatically rebalances the portfolio on drift or schedule via Jupiter swaps. Includes a React dashboard for monitoring and control.

![Node.js](https://img.shields.io/badge/Node.js-22-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Solana](https://img.shields.io/badge/Solana-mainnet-purple)

![Dashboard screenshot](docs/screenshot.png)

## Features

- **Token basket** — hold any SPL/Token-2022 tokens at target weights; auto-rebalances on drift or schedule via Jupiter swaps
- **Dynamic USDC profit-taking** — USDC target weight shifts automatically based on basket PnL%
- **PnL tracking** — SOL and USD baseline, 24h portfolio chart
- **Live dashboard** — React + Tailwind UI with SSE updates, rebalance log, wallet management
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
  App.tsx         — single-file React dashboard
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
- Baseline reset does not affect HWM — profit lock persists through deposits

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
