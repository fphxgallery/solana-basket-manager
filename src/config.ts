import "dotenv/config";
import fs from "fs";
import path from "path";

const apiKey = process.env.HELIUS_API_KEY;
if (!apiKey) throw new Error("HELIUS_API_KEY missing from .env");

const apiToken = process.env.API_TOKEN;
if (!apiToken || apiToken.length < 16) {
  throw new Error("API_TOKEN missing or too short (min 16 chars) — generate one with: openssl rand -hex 32");
}

const DEFAULT_TOKEN = "6gx6Ph2ek73kF6EWDrG4GQ54pcLJB6CYpATuRyxKXumo";
const WSOL  = "So11111111111111111111111111111111111111112";
const USDC  = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const ARB_CONFIG_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "arb-config.json");

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`${key} must be an integer, got: "${raw}"`);
  return n;
}

function envFloat(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseFloat(raw);
  if (isNaN(n)) throw new Error(`${key} must be a number, got: "${raw}"`);
  return n;
}

// Runtime-mutable — updated via PATCH /api/config, persisted to data/arb-config.json.
// Precedence: persisted file > env var > default.
export const runtimeConfig = {
  ARB_AMOUNT_SOL: envFloat("ARB_AMOUNT_SOL", 0.1),
  MIN_PROFIT_BPS: envInt("MIN_PROFIT_BPS", 500),
  TOKEN_MINT: process.env.TOKEN_MINT ?? DEFAULT_TOKEN,
};

try {
  if (fs.existsSync(ARB_CONFIG_PATH)) {
    const saved = JSON.parse(fs.readFileSync(ARB_CONFIG_PATH, "utf-8")) as Partial<typeof runtimeConfig>;
    if (typeof saved.ARB_AMOUNT_SOL === "number" && saved.ARB_AMOUNT_SOL > 0) runtimeConfig.ARB_AMOUNT_SOL = saved.ARB_AMOUNT_SOL;
    if (typeof saved.MIN_PROFIT_BPS === "number" && saved.MIN_PROFIT_BPS >= 0) runtimeConfig.MIN_PROFIT_BPS = saved.MIN_PROFIT_BPS;
    if (typeof saved.TOKEN_MINT === "string" && saved.TOKEN_MINT) runtimeConfig.TOKEN_MINT = saved.TOKEN_MINT;
  }
} catch { /* corrupt file — fall back to env/defaults */ }

export function saveRuntimeConfig() {
  try {
    fs.mkdirSync(path.dirname(ARB_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(ARB_CONFIG_PATH, JSON.stringify(runtimeConfig, null, 2));
  } catch (e) {
    console.error("[config] save failed:", e);
  }
}

export const CONFIG = {
  WSOL_MINT: WSOL,
  USDC_MINT: USDC,

  API_TOKEN: apiToken,

  HELIUS_API_KEY: apiKey,
  RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
  WS_URL: `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`,

  WALLET_KEYPAIR_PATH: process.env.WALLET_KEYPAIR_PATH ?? "./wallet/keypair.json",

  SLIPPAGE_BPS: 100,
  PRIORITY_FEE_LAMPORTS: envInt("PRIORITY_FEE_LAMPORTS", 100000),

  JITO_TIP_LAMPORTS: envInt("JITO_TIP_LAMPORTS", 10000),
  JITO_TIP_ACCOUNT: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  JITO_BLOCK_ENGINE_URL: "https://mainnet.block-engine.jito.wtf",

  DEX_PROGRAMS: [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM v4
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",  // Orca Whirlpool
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo", // Meteora DLMM
  ],

  JUPITER_API_KEY: process.env.JUPITER_API_KEY,
  // Arb: use paid API if key present (best routes, lowest latency)
  JUPITER_QUOTE_URL: process.env.JUPITER_API_KEY
    ? "https://api.jup.ag/swap/v1/quote"
    : "https://lite-api.jup.ag/swap/v1/quote",
  JUPITER_SWAP_URL: process.env.JUPITER_API_KEY
    ? "https://api.jup.ag/swap/v1/swap"
    : "https://lite-api.jup.ag/swap/v1/swap",
  // Basket pricing + rebalance: always use lite API (avoids burning arb quota)
  JUPITER_LITE_QUOTE_URL: "https://lite-api.jup.ag/swap/v1/quote",
  JUPITER_LITE_SWAP_URL: "https://lite-api.jup.ag/swap/v1/swap",
  // Higher slippage for rebalance swaps (not latency-sensitive, just needs to fill)
  REBALANCE_SLIPPAGE_BPS: 300,

  ARB_COOLDOWN_MS: 2000,
  MAX_PENDING: 1,
  PORT: envInt("PORT", 3420),
} as const;
