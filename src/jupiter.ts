import { CONFIG, runtimeConfig } from "./config.js";
import { basketStore } from "./basket-store.js";
import { store } from "./store.js";
import type { ArbOpportunity, JupiterQuote, SwapResponse } from "./types.js";

const MAX_PRICE_IMPACT_PCT = 3;
const MAX_BELIEVABLE_PROFIT_BPS = 2000; // 20%

/**
 * Arb amount: % of total portfolio value.
 * If SOL (WSOL) is already in the basket tokens, totalValueSol already includes it.
 * Otherwise, add walletBalanceSol so native SOL is counted.
 * Falls back to static ARB_AMOUNT_SOL if no basket configured.
 */
export function arbAmountLamports(): bigint {
  const { totalValueSol, config } = basketStore;
  if (config.tokens.length > 0) {
    const wsolInBasket = config.tokens.some((t) => t.mint === CONFIG.WSOL_MINT);
    const extraSol = wsolInBasket ? 0 : (store.walletBalanceSol ?? 0);
    const portfolioSol = totalValueSol + extraSol;
    if (portfolioSol > 0) {
      return BigInt(Math.floor(portfolioSol * (config.arbSizingPct / 100) * 1e9));
    }
  }
  return BigInt(Math.floor(runtimeConfig.ARB_AMOUNT_SOL * 1e9));
}

/**
 * Dynamic circuits: always include the 2-leg baseline plus one 3-leg circuit
 * per basket intermediate token (anything that isn't SOL or TOKEN).
 */
export function getCircuits(): string[][] {
  const token = runtimeConfig.TOKEN_MINT;
  const base: string[][] = [
    [CONFIG.WSOL_MINT, token, CONFIG.WSOL_MINT],
  ];

  const intermediates = basketStore.config.tokens
    .map((t) => t.mint)
    .filter((m) => m !== CONFIG.WSOL_MINT && m !== token);

  for (const mint of intermediates) {
    base.push([CONFIG.WSOL_MINT, token, mint, CONFIG.WSOL_MINT]);
  }

  return base;
}

// Resolved per call — TOKEN_MINT is runtime-configurable
function mintLabel(m: string): string {
  if (m === CONFIG.WSOL_MINT) return "SOL";
  if (m === CONFIG.USDC_MINT) return "USDC";
  if (m === runtimeConfig.TOKEN_MINT) return "TOKEN";
  return m.slice(0, 4);
}

const jupiterHeaders = (): HeadersInit =>
  CONFIG.JUPITER_API_KEY ? { "x-api-key": CONFIG.JUPITER_API_KEY } : {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: bigint,
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amountLamports.toString(),
    slippageBps: CONFIG.SLIPPAGE_BPS.toString(),
    onlyDirectRoutes: "false",
    asLegacyTransaction: "false",
  });

  // Retry up to 3× on 429 with backoff (1s, 2s, 4s)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${CONFIG.JUPITER_QUOTE_URL}?${params}`, { headers: jupiterHeaders() });
    if (res.status === 429) {
      if (attempt < 2) { await sleep(1000 * Math.pow(2, attempt)); continue; }
    }
    if (!res.ok) throw new Error(`Jupiter quote ${res.status}: ${await res.text()}`);
    return res.json() as Promise<JupiterQuote>;
  }
  throw new Error("Jupiter quote 429: rate limited after retries");
}

// ── Spread cache ──────────────────────────────────────────────────────────────

export interface SpreadResult {
  profitBps: number;
  routeLabels: string[];
  dexLabels: string[];
  inputSol: number;
  outputSol: number;
  updatedAt: number;
}

let cachedSpread: SpreadResult | null = null;
export function getCachedSpread(): SpreadResult | null { return cachedSpread; }
/** Drop cached spread — call when TOKEN_MINT changes so stale routes aren't shown. */
export function clearSpreadCache(): void { cachedSpread = null; }

// ── Core circuit runner ───────────────────────────────────────────────────────

interface CircuitResult {
  quotes: JupiterQuote[];
  route: string[];
  routeLabels: string[];
  dexLabels: string[];
  inputLamports: bigint;
  outputLamports: bigint;
  profitBps: number;
}

/**
 * Run a single circuit and return raw result (no profit threshold applied).
 * Returns null on error, untradable token, or price impact rejection.
 */
async function runCircuit(mints: string[]): Promise<CircuitResult | null> {
  const inputLamports = arbAmountLamports();
  const quotes: JupiterQuote[] = [];
  let amount = inputLamports;

  for (let i = 0; i < mints.length - 1; i++) {
    try {
      const q = await fetchQuote(mints[i], mints[i + 1], amount);
      const parsed = Math.abs(parseFloat(q.priceImpactPct ?? "0"));
      // NaN must reject, not silently pass the threshold comparison
      const impact = isNaN(parsed) ? Infinity : parsed;
      if (impact > MAX_PRICE_IMPACT_PCT) {
        console.warn(`[jupiter] rejected leg ${i}: price impact ${impact.toFixed(2)}%`);
        return null;
      }
      quotes.push(q);
      amount = BigInt(q.outAmount);
    } catch {
      return null;
    }
  }

  const outputLamports = amount;
  const profitBps = Number(((outputLamports - inputLamports) * 10000n) / inputLamports);

  // Sanity cap — anything above this is almost certainly a bad quote
  if (profitBps > MAX_BELIEVABLE_PROFIT_BPS) {
    console.warn(`[jupiter] rejected circuit: profit ${(profitBps / 100).toFixed(2)}% exceeds sanity cap`);
    return null;
  }

  return {
    quotes,
    route: mints,
    routeLabels: mints.map(mintLabel),
    dexLabels: quotes.map((q) => q.routePlan[0]?.swapInfo.label ?? "?"),
    inputLamports,
    outputLamports,
    profitBps,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check all circuits sequentially, return the most profitable above threshold.
 * Side-effect: updates cached spread so UI doesn't need redundant API calls.
 */
export async function checkArbOpportunity(): Promise<ArbOpportunity | null> {
  let bestArb: ArbOpportunity | null = null;
  let bestSpread: SpreadResult | null = null;

  for (const circuit of getCircuits()) {
    const r = await runCircuit(circuit);
    if (!r) continue;

    // Update spread cache with every successful circuit run
    const spread: SpreadResult = {
      profitBps: r.profitBps,
      routeLabels: r.routeLabels,
      dexLabels: r.dexLabels,
      inputSol: Number(r.inputLamports) / 1e9,
      outputSol: Number(r.outputLamports) / 1e9,
      updatedAt: Date.now(),
    };
    if (!bestSpread || r.profitBps > bestSpread.profitBps) bestSpread = spread;

    // Arb: must be profitable and above threshold
    const profitLamports = r.outputLamports - r.inputLamports;
    if (profitLamports > 0n && r.profitBps >= runtimeConfig.MIN_PROFIT_BPS) {
      const arb: ArbOpportunity = {
        quotes: r.quotes,
        route: r.route,
        routeLabels: r.routeLabels,
        dexLabels: r.dexLabels,
        inputLamports: r.inputLamports,
        outputLamports: r.outputLamports,
        profitLamports,
        profitBps: r.profitBps,
      };
      if (!bestArb || arb.profitBps > bestArb.profitBps) bestArb = arb;
    }
  }

  if (bestSpread) cachedSpread = bestSpread;
  return bestArb;
}

/**
 * Returns best spread. Returns cached value if fresh (< 15s),
 * otherwise runs circuits to refresh. Falls back to stale cache on failure.
 */
export async function getSpread(): Promise<SpreadResult | null> {
  const CACHE_TTL_MS = 15_000;
  if (cachedSpread && Date.now() - cachedSpread.updatedAt < CACHE_TTL_MS) {
    return cachedSpread;
  }

  let best: SpreadResult | null = null;
  for (const circuit of getCircuits()) {
    const r = await runCircuit(circuit);
    if (!r) continue;
    const s: SpreadResult = {
      profitBps: r.profitBps,
      routeLabels: r.routeLabels,
      dexLabels: r.dexLabels,
      inputSol: Number(r.inputLamports) / 1e9,
      outputSol: Number(r.outputLamports) / 1e9,
      updatedAt: Date.now(),
    };
    if (!best || s.profitBps > best.profitBps) best = s;
  }

  if (best) cachedSpread = best;
  return cachedSpread; // return stale cache rather than null if fetch fails
}

export async function getSwapTransaction(
  quote: JupiterQuote,
  walletPublicKey: string,
): Promise<SwapResponse> {
  const res = await fetch(CONFIG.JUPITER_SWAP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...jupiterHeaders() },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: walletPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: CONFIG.PRIORITY_FEE_LAMPORTS,
          priorityLevel: "veryHigh",
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Jupiter swap tx ${res.status}: ${await res.text()}`);
  return res.json() as Promise<SwapResponse>;
}
