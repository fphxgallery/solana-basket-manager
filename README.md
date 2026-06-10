# solana-basket-arbitrage

Self-hosted Solana arbitrage bot with a token basket manager. Runs Jupiter arb circuits (2-leg and 3-leg), submits via Jito bundles, and automatically rebalances a configurable token portfolio. Includes a React dashboard for monitoring and control.

![Node.js](https://img.shields.io/badge/Node.js-22-green) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Solana](https://img.shields.io/badge/Solana-mainnet-purple)

## Features

- **Arb bot** — Jupiter quote circuits (SOL → TOKEN → SOL, SOL → TOKEN → X → SOL), submitted atomically via Jito bundles
- **Token basket** — hold any SPL/Token-2022 tokens at target weights; auto-rebalances on drift or schedule
- **Dynamic USDC profit-taking** — USDC target weight shifts automatically based on basket PnL%
- **PnL tracking** — SOL and USD baseline, 24h portfolio chart
- **Live dashboard** — React + Tailwind UI with SSE updates, trade log, spread monitor, wallet management
- **Token-protected API** — all endpoints require an auth token (cookie or bearer); dashboard has a sign-in screen
- **Configurable at runtime** — arb token mint, sizing, profit threshold, basket weights — no restart needed

## Requirements

- Linux server (systemd) or Docker
- Node.js 22+ (installer handles this via nvm)
- [Helius](https://helius.dev) API key (RPC + WebSocket)
- [Jupiter](https://jup.ag) API key (optional — paid tier for lower latency arb)

## Quick Start (systemd)

```bash
git clone https://github.com/fphxgallery/solana-basket-arbitrage
cd solana-basket-arbitrage
bash install.sh
```

The installer will:
1. Install Node.js 22 via nvm if not present
2. Prompt for API keys, generate a dashboard auth token, and create `.env`
3. Install dependencies and build server + client
4. Register and start `arb-agent.service` via systemd

Open the dashboard at `http://<server-ip>:3420` and sign in with the token the installer printed (the `API_TOKEN` value in `.env`).

## Quick Start (Docker)

```bash
cp .env.example .env   # fill in API keys + generate API_TOKEN
docker compose up -d
```

By default Docker binds to `127.0.0.1` only. Set `BIND_ADDR=0.0.0.0` in `.env` for LAN access.

## Configuration

### `.env`

```env
HELIUS_API_KEY=your_helius_key
JUPITER_API_KEY=your_jupiter_key   # optional
API_TOKEN=...                      # required — openssl rand -hex 32
PORT=3420
#BIND_ADDR=0.0.0.0                 # Docker only — default 127.0.0.1
```

### Dashboard — Config panel

All settings are live (no restart):

| Setting | Description |
|---|---|
| Arb token mint | SPL token used as the arb circuit intermediate |
| Arb amount (SOL) | SOL per arb leg when no basket is configured |
| Min profit (bps) | Minimum profit to execute (e.g. 500 = 5%) |

### Basket

Add tokens in the Basket tab. Each token needs:
- **Mint address** — any SPL or Token-2022 token
- **Target weight %** — must sum to 100 across all tokens

Rebalance settings (also in dashboard):
- **Drift threshold %** — trigger rebalance when any token drifts this far from target
- **Rebalance interval (hours)** — force rebalance even without drift
- **Arb sizing %** — arb size as % of total basket value

## Architecture

```
src/
  index.ts        — Express server entry
  auth.ts         — API token auth (cookie / bearer)
  bot.ts          — main loop, timers, arb + rebalance orchestration
  jupiter.ts      — quote circuits, spread cache, arb opportunity detection
  executor.ts     — Jito bundle assembly and submission
  basket.ts       — holdings refresh, rebalance execution, dynamic USDC weight
  basket-store.ts — basket config + state persistence (data/basket.json)
  watcher.ts      — Helius WebSocket — triggers arb on token activity
  value-history.ts — 24h portfolio value snapshots (data/value-history.json)
  api.ts          — REST + SSE endpoints
  config.ts       — env config + runtime-mutable settings (data/arb-config.json)
  wallet.ts       — keypair create/import (wallet/keypair.json)
client/src/
  App.tsx         — single-file React dashboard
```

**Arb flow:** WebSocket trigger or 20s poll → Jupiter quote circuit → profit check → Jito bundle (tip tx + swap txs) → poll bundle status

**Basket flow:** 3-min timer → fetch balances + Jupiter prices → compute drift → if threshold breached or interval elapsed → sell overweight → buy underweight

## Data Files

All runtime data lives in `data/` (excluded from git):

| File | Contents |
|---|---|
| `data/basket.json` | token list, weights, settings, price cache, PnL baseline |
| `data/arb-config.json` | arb token mint, sizing, profit threshold |
| `data/value-history.json` | 24h portfolio value snapshots |
| `wallet/keypair.json` | hot wallet keypair — **back this up** |

## Useful Commands

```bash
# Logs
journalctl -u arb-agent -f

# Restart
sudo systemctl restart arb-agent

# Status
sudo systemctl status arb-agent
```

## Security Notes

- Wallet keypair is a **hot wallet** — only fund it with what you're willing to arb with
- All API routes require `API_TOKEN` (HttpOnly cookie via dashboard sign-in, or `Authorization: Bearer` header)
- Docker binds `127.0.0.1` by default; prefer an SSH tunnel over `BIND_ADDR=0.0.0.0` when possible
- Traffic is plain HTTP — put a reverse proxy with TLS in front if exposing beyond localhost/LAN
- `.env` and `wallet/` are gitignored and never committed

## License

MIT
