// Per-token price + weight history, logged once per basket refresh.
// Unlocks offline band backtesting (threshold × interval sweep), which the
// aggregate value-history.json can't support — that only has total USD value,
// not the per-mint prices a rebalance simulation needs.
//
// Persisted to data/token-history.json (separate file so the value chart format
// stays untouched). Compact on disk: keys `p` (priceSol) and `w` (weight %).

import fs from "fs";
import path from "path";
import type { TokenHolding } from "./basket-store.js";

// Match value-history's 90-day window so the two datasets line up on the timeline.
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const DATA_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "token-history.json");

export interface TokenSnapshot {
  ts: number;                                       // unix ms
  perToken: Record<string, { p: number; w: number }>; // mint → { priceSol, weightPct }
}

// Load persisted history on startup, pruning anything older than the retention window
export const tokenHistory: TokenSnapshot[] = (() => {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")) as TokenSnapshot[];
      const cutoff = Date.now() - RETENTION_MS;
      return raw.filter((s) => s.ts >= cutoff);
    }
  } catch { /* start fresh on corrupt file */ }
  return [];
})();

function persist() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(tokenHistory));
  } catch (e) {
    console.error("[token-history] save failed:", e);
  }
}

/**
 * Record a per-token snapshot. Call after each basket refresh, alongside
 * recordSnapshot(). No-op when holdings are empty or unpriced.
 */
export function recordTokenSnapshot(holdings: TokenHolding[]): void {
  if (!holdings.length) return;

  const perToken: TokenSnapshot["perToken"] = {};
  for (const h of holdings) {
    if (h.priceSol <= 0) continue; // skip unpriced — a bad quote would poison the backtest
    // toPrecision(8) keeps tiny memecoin prices accurate while bounding file size.
    perToken[h.mint] = {
      p: Number(h.priceSol.toPrecision(8)),
      w: Number(h.currentWeight.toFixed(2)),
    };
  }
  if (Object.keys(perToken).length === 0) return;

  const now = Date.now();
  tokenHistory.push({ ts: now, perToken });

  // Prune entries older than the retention window
  const cutoff = now - RETENTION_MS;
  while (tokenHistory.length > 0 && tokenHistory[0].ts < cutoff) {
    tokenHistory.shift();
  }

  persist();
}
