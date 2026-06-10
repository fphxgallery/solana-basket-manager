// Tracks portfolio value (USD) over the last 30 days.
// SOL/USD price fetched from CoinGecko every ~3 minutes.
// History persisted to data/value-history.json so restarts don't wipe the chart.

import fs from "fs";
import path from "path";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

const DATA_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "value-history.json");

export interface ValuePoint {
  ts: number;      // unix ms
  valueUsd: number;
}

let solUsd = 0;
let lastPriceFetch = 0;

// Load persisted history on startup, pruning anything older than 30 days
export const valueHistory: ValuePoint[] = (() => {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")) as ValuePoint[];
      const cutoff = Date.now() - THIRTY_DAYS;
      return raw.filter((p) => p.ts >= cutoff);
    }
  } catch { /* start fresh on corrupt file */ }
  return [];
})();

function persist() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(valueHistory));
  } catch (e) {
    console.error("[value-history] save failed:", e);
  }
}

/** Fetch SOL/USD from CoinGecko (cached for 3 minutes). */
export async function getSolUsd(): Promise<number> {
  const now = Date.now();
  if (solUsd > 0 && now - lastPriceFetch < 3 * 60_000) return solUsd;
  try {
    const res = await fetch(COINGECKO_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return solUsd; // return stale on error
    const json = (await res.json()) as { solana?: { usd?: number } };
    const price = json.solana?.usd;
    if (price && price > 0) {
      solUsd = price;
      lastPriceFetch = now;
    }
  } catch { /* keep stale value */ }
  return solUsd;
}

/** Record a portfolio snapshot. Call this after each basket refresh. */
export async function recordSnapshot(totalValueSol: number): Promise<void> {
  if (totalValueSol <= 0) return;
  const usd = await getSolUsd();
  if (usd <= 0) return;

  const now = Date.now();
  valueHistory.push({ ts: now, valueUsd: totalValueSol * usd });

  // Prune entries older than 30 days
  const cutoff = now - THIRTY_DAYS;
  while (valueHistory.length > 0 && valueHistory[0].ts < cutoff) {
    valueHistory.shift();
  }

  persist();
}
