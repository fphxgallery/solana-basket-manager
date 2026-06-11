import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { randomUUID } from "crypto";
import { CONFIG } from "./config.js";
import { basketStore, type TokenHolding } from "./basket-store.js";
import { store } from "./store.js";
import { getSolUsd } from "./value-history.js";
import { notify } from "./telegram.js";
import type { JupiterQuote } from "./types.js";

const WSOL = CONFIG.WSOL_MINT;

// ── Dynamic USDC weight ───────────────────────────────────────────────────────

function dynamicUsdcWeight(pnlPct: number): number {
  const { curvePoints, curveCap } = basketStore.config;
  if (!curvePoints.length) return 0;
  if (pnlPct > curvePoints[curvePoints.length - 1][0]) return curveCap;
  if (pnlPct <= curvePoints[0][0]) return curvePoints[0][1];
  for (let i = 0; i < curvePoints.length - 1; i++) {
    const [x0, y0] = curvePoints[i];
    const [x1, y1] = curvePoints[i + 1];
    if (pnlPct <= x1) {
      const t = (pnlPct - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return curvePoints[curvePoints.length - 1][1];
}

/**
 * Returns effective target weights per mint.
 * If USDC is in the basket and pnlPct is known, USDC weight is adjusted
 * dynamically and all other tokens are rescaled proportionally to sum to 100%.
 * Falls back to static configured weights otherwise.
 */
function computeEffectiveWeights(
  tokens: Array<{ mint: string; targetWeight: number }>,
  pnlPct: number | null,
): Record<string, number> {
  const usdcToken = tokens.find((t) => t.mint === CONFIG.USDC_MINT);
  if (pnlPct == null || !usdcToken) {
    return Object.fromEntries(tokens.map((t) => [t.mint, t.targetWeight]));
  }

  const targetUsdcWeight = dynamicUsdcWeight(pnlPct);
  const delta = targetUsdcWeight - usdcToken.targetWeight;
  if (Math.abs(delta) < 0.01) {
    return Object.fromEntries(tokens.map((t) => [t.mint, t.targetWeight]));
  }

  // Rescale non-USDC tokens proportionally so all weights sum to 100%
  const nonUsdc = tokens.filter((t) => t.mint !== CONFIG.USDC_MINT);
  const nonUsdcConfigTotal = nonUsdc.reduce((s, t) => s + t.targetWeight, 0);
  const newNonUsdcTotal = 100 - targetUsdcWeight;

  const weights: Record<string, number> = {};
  weights[CONFIG.USDC_MINT] = targetUsdcWeight;
  for (const t of nonUsdc) {
    weights[t.mint] = nonUsdcConfigTotal > 0
      ? (t.targetWeight / nonUsdcConfigTotal) * newNonUsdcTotal
      : newNonUsdcTotal / nonUsdc.length;
  }
  return weights;
}

// ── Prices (quote-derived) ────────────────────────────────────────────────────
// Jupiter price API is no longer available on the free tier.
// Instead, quote rawTokenAmount TOKEN → WSOL to get actual SOL value.

async function fetchValueSol(mint: string, rawAmount: string): Promise<number> {
  // Always use the Jupiter lite API for pricing
  const params = new URLSearchParams({
    inputMint: mint,
    outputMint: WSOL,
    amount: rawAmount,
    slippageBps: CONFIG.SLIPPAGE_BPS.toString(),
    onlyDirectRoutes: "false",
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${CONFIG.JUPITER_LITE_QUOTE_URL}?${params}`);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return 0;
      const q = (await res.json()) as { outAmount?: string };
      return q.outAmount ? Number(BigInt(q.outAmount)) / 1e9 : 0;
    } catch {
      // Transient network error — retry like a 429 instead of giving up
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return 0;
}

// ── Balances ──────────────────────────────────────────────────────────────────

interface TokenBalance {
  uiAmount: number;   // human-readable (e.g. 1.5 USDC)
  rawAmount: string;  // on-chain atom string (e.g. "1500000" for USDC)
}

async function fetchBalances(
  connection: Connection,
  walletPk: PublicKey,
  mints: string[],
): Promise<Record<string, TokenBalance>> {
  const balances: Record<string, TokenBalance> = {};

  // Native SOL — rawAmount in lamports as string
  if (mints.includes(WSOL)) {
    const lamports = await connection.getBalance(walletPk);
    balances[WSOL] = { uiAmount: lamports / 1e9, rawAmount: lamports.toString() };
  }

  // SPL tokens — query both Token and Token-2022 programs
  const splMints = mints.filter((m) => m !== WSOL);
  if (splMints.length) {
    const TOKEN_PROGRAM    = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const TOKEN_2022_PROGRAM = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

    const [accounts, accounts2022] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(walletPk, { programId: TOKEN_PROGRAM }),
      connection.getParsedTokenAccountsByOwner(walletPk, { programId: TOKEN_2022_PROGRAM }),
    ]);

    for (const { account } of [...accounts.value, ...accounts2022.value]) {
      const info = account.data.parsed?.info as {
        mint: string;
        tokenAmount: { uiAmount: number; amount: string };
      };
      if (splMints.includes(info.mint)) {
        balances[info.mint] = {
          uiAmount: info.tokenAmount.uiAmount ?? 0,
          rawAmount: info.tokenAmount.amount ?? "0",
        };
      }
    }

    // Tokens with no account → 0
    for (const m of splMints) {
      if (!(m in balances)) balances[m] = { uiAmount: 0, rawAmount: "0" };
    }
  }

  return balances;
}

// ── Holdings calculation ──────────────────────────────────────────────────────

export async function refreshHoldings(
  connection: Connection,
  walletPk: PublicKey,
): Promise<void> {
  const { tokens } = basketStore.config;
  if (!tokens.length) return;

  // Always include WSOL so we get native SOL balance for the wallet display
  const mints = [...new Set([...tokens.map((t) => t.mint), WSOL])];
  const balances = await fetchBalances(connection, walletPk, mints);

  // Update wallet balance from the SOL balance already fetched — avoids a redundant getBalance call
  if (balances[WSOL]) store.setWalletBalance(balances[WSOL].uiAmount);

  // Derive SOL value sequentially (not parallel) to avoid 429 rate limits.
  // Falls back to cached price if the quote fails.
  const holdingsRaw: Array<typeof tokens[0] & { balance: number; rawAmount: string; priceSol: number; valueSol: number }> = [];

  for (const t of tokens) {
    const bal = balances[t.mint] ?? { uiAmount: 0, rawAmount: "0" };
    let valueSol = 0;
    let priceSol = 0;

    if (t.mint === WSOL) {
      valueSol = bal.uiAmount;
      priceSol = 1;
    } else if (bal.uiAmount > 0 && bal.rawAmount !== "0") {
      // Small delay between pricing calls to stay within rate limits
      if (holdingsRaw.length > 0) await new Promise((r) => setTimeout(r, 300));

      const fetched = await fetchValueSol(t.mint, bal.rawAmount);
      if (fetched > 0) {
        valueSol = fetched;
        priceSol = fetched / bal.uiAmount;
        basketStore.priceCache[t.mint] = priceSol; // update cache on success
      } else {
        // Fall back to cached price rather than showing 0
        const cached = basketStore.priceCache[t.mint];
        if (cached) {
          priceSol = cached;
          valueSol = bal.uiAmount * cached;
          console.log(`[basket] using cached price for ${t.symbol}: ${cached.toFixed(8)} SOL`);
        }
      }
    }

    holdingsRaw.push({ ...t, balance: bal.uiAmount, rawAmount: bal.rawAmount, priceSol, valueSol });
  }

  const totalValueSol = holdingsRaw.reduce((s, h) => s + h.valueSol, 0);

  // Fetch SOL/USD (3-min cache — no extra API calls since value-history already fetches it)
  const solUsd = await getSolUsd();
  const totalValueUsd = solUsd > 0 ? totalValueSol * solUsd : 0;

  // Compute USD pnlPct for dynamic USDC weight — SOL price changes shouldn't trigger profit-taking
  const baselineUsd = basketStore.baselineValueUsd;
  let pnlPctUsd: number | null = null;
  if (baselineUsd != null && baselineUsd > 0 && totalValueUsd > 0) {
    if (basketStore.config.hwmEnabled) {
      const hwm = basketStore.hwmValueUsd;
      const hwmCapturedAt = basketStore.hwmCapturedAt;
      let effectiveHwm: number;
      if (hwm == null || hwmCapturedAt == null || totalValueUsd >= hwm) {
        effectiveHwm = totalValueUsd;
        // Only write when it's a genuine new peak — avoids a disk write every 3-min refresh at steady state
        if (hwm == null || hwmCapturedAt == null || totalValueUsd > hwm) {
          basketStore.updateHwm(totalValueUsd);
        }
      } else {
        const elapsedDays = (Date.now() - hwmCapturedAt) / 86_400_000;
        const decayedGap = (hwm - totalValueUsd) * Math.pow(0.5, elapsedDays / basketStore.config.hwmHalfLifeDays);
        effectiveHwm = totalValueUsd + decayedGap;
        console.log(`[basket] HWM: peak=$${hwm.toFixed(2)} effective=$${effectiveHwm.toFixed(2)} current=$${totalValueUsd.toFixed(2)} (${elapsedDays.toFixed(1)}d elapsed)`);
      }
      pnlPctUsd = ((effectiveHwm - baselineUsd) / baselineUsd) * 100;
    } else {
      pnlPctUsd = ((totalValueUsd - baselineUsd) / baselineUsd) * 100;
    }
  }

  const effectiveWeights = computeEffectiveWeights(tokens, pnlPctUsd);

  if (pnlPctUsd != null) {
    const usdcDynamic = effectiveWeights[CONFIG.USDC_MINT];
    const usdcConfig = tokens.find((t) => t.mint === CONFIG.USDC_MINT)?.targetWeight;
    if (usdcDynamic != null && usdcConfig != null && Math.abs(usdcDynamic - usdcConfig) >= 0.1) {
      console.log(`[basket] dynamic USDC weight: ${usdcDynamic.toFixed(1)}% (config: ${usdcConfig}%, pnl: ${pnlPctUsd >= 0 ? "+" : ""}${pnlPctUsd.toFixed(1)}% USD)`);
    }
  }

  const holdings: TokenHolding[] = holdingsRaw.map((h) => {
    const effectiveTarget = effectiveWeights[h.mint] ?? h.targetWeight;
    const currentWeight = totalValueSol > 0 ? (h.valueSol / totalValueSol) * 100 : 0;
    return {
      mint: h.mint,
      symbol: h.symbol,
      balance: h.balance,
      rawAmount: h.rawAmount,
      priceSol: h.priceSol,
      valueSol: h.valueSol,
      currentWeight,
      targetWeight: effectiveTarget,
      driftPct: totalValueSol > 0 ? currentWeight - effectiveTarget : -effectiveTarget,
    };
  });

  // Set baseline BEFORE setHoldings so pnl is non-null in the SSE broadcast
  if (basketStore.baselineValueSol == null && totalValueSol > 0 && totalValueUsd > 0) {
    basketStore.setBaseline(totalValueSol, totalValueUsd);
  } else if (basketStore.baselineValueSol != null && basketStore.baselineValueUsd == null && totalValueUsd > 0) {
    // Migrate old basket.json that predates USD baseline tracking
    basketStore.patchBaselineUsd(basketStore.baselineValueSol * (totalValueUsd / totalValueSol));
  }

  basketStore.setHoldings(holdings, totalValueSol, totalValueUsd);
}

// ── Rebalance ─────────────────────────────────────────────────────────────────

export function needsRebalance(): boolean {
  const { holdings, config, lastRebalanceAt } = basketStore;
  if (!holdings.length) return false;

  const driftBreached = holdings.some(
    (h) => Math.abs(h.driftPct) >= config.driftThresholdPct,
  );
  if (driftBreached) return true;

  if (lastRebalanceAt) {
    const elapsedHours = (Date.now() - lastRebalanceAt) / 3_600_000;
    if (elapsedHours >= config.rebalanceIntervalHours) return true;
  }

  return false;
}

// rawAmount: the on-chain atom amount to pass to Jupiter (correct decimals per token)
// displaySol: approximate SOL value for the trade log
interface PlannedSwap {
  inputMint: string;
  outputMint: string;
  rawAmount: bigint;
  displaySol: number;
}

interface SwapResult {
  label: string;
  sol: number;
  status: "confirmed" | "failed";
}

// Reserve SOL for gas fees across all buy swaps (priority fee + sig cost per swap)
const GAS_RESERVE_SOL = 0.01;

export async function executeRebalance(
  connection: Connection,
  keypair: Keypair,
): Promise<void> {
  await refreshHoldings(connection, keypair.publicKey);

  const { holdings, totalValueSol } = basketStore;
  if (!holdings.length || totalValueSol === 0) return;

  // Only rebalance tokens that have drifted beyond the threshold — skip dust drift
  const { driftThresholdPct, minSwapUsd } = basketStore.config;
  const sells = holdings.filter((h) => h.driftPct >= driftThresholdPct && h.mint !== WSOL);
  const buys = holdings.filter((h) => h.driftPct <= -driftThresholdPct && h.mint !== WSOL);

  // Min-swap floor only applies when the SOL price is known — a CoinGecko
  // outage (solUsd = 0) must not silently filter out every swap
  const solUsd = await getSolUsd();
  const aboveFloor = (s: PlannedSwap) => solUsd <= 0 || s.displaySol * solUsd >= minSwapUsd;
  let skipped = 0;

  const sellSwaps: PlannedSwap[] = [];
  for (const h of sells) {
    const excessSol = (h.driftPct / 100) * totalValueSol;
    const excessFraction = h.valueSol > 0 ? Math.min(excessSol / h.valueSol, 1) : 0;
    // BigInt scaling avoids precision loss for large 9-decimal balances (>2^53 atoms)
    const rawAmount = BigInt(h.rawAmount) * BigInt(Math.floor(excessFraction * 1_000_000)) / 1_000_000n;
    sellSwaps.push({ inputMint: h.mint, outputMint: WSOL, rawAmount, displaySol: excessSol });
  }
  const filteredSells = sellSwaps.filter(aboveFloor);
  skipped += sellSwaps.length - filteredSells.length;

  const results: SwapResult[] = [];

  for (const swap of filteredSells) {
    const result = await performSwap(connection, keypair, swap);
    if (result) results.push(result);
  }

  // Compute the buy budget AFTER sells execute so sell proceeds fund the buys
  let solBudget: number;
  try {
    const lamports = await connection.getBalance(keypair.publicKey);
    solBudget = Math.max(0, lamports / 1e9 - GAS_RESERVE_SOL);
  } catch {
    solBudget = Math.max(0, (store.walletBalanceSol ?? 0) - GAS_RESERVE_SOL);
  }

  const buySwaps: PlannedSwap[] = [];
  for (const h of buys) {
    const deficitSol = (Math.abs(h.driftPct) / 100) * totalValueSol;
    const buyAmount = Math.min(deficitSol, solBudget);
    if (buyAmount <= 0) continue;
    solBudget -= buyAmount;
    // Buying with SOL: input is WSOL, amount in lamports (9 decimals)
    const rawAmount = BigInt(Math.floor(buyAmount * 1e9));
    buySwaps.push({ inputMint: WSOL, outputMint: h.mint, rawAmount, displaySol: buyAmount });
  }
  const filteredBuys = buySwaps.filter(aboveFloor);
  skipped += buySwaps.length - filteredBuys.length;

  if (skipped > 0) console.log(`[basket] skipped ${skipped} swap(s) below $${minSwapUsd} min`);

  if (!filteredSells.length && !filteredBuys.length) {
    console.log("[basket] no rebalance needed");
    basketStore.recordRebalance();
    return;
  }

  console.log(`[basket] rebalancing ${filteredSells.length + filteredBuys.length} positions`);

  for (const swap of filteredBuys) {
    const result = await performSwap(connection, keypair, swap);
    if (result) results.push(result);
  }

  basketStore.recordRebalance();

  if (results.length > 0) {
    const anyFailed = results.some((r) => r.status === "failed");
    const icon = anyFailed ? "⚠️" : "⚖️";
    const lines = results.map((r) =>
      `${r.status === "confirmed" ? "✅" : "❌"} ${r.label} — ${r.sol.toFixed(4)} SOL`,
    );
    notify(`${icon} <b>Rebalance complete</b>\n${lines.join("\n")}`).catch(() => {});
  }
}

/** Quote, build, sign, send and confirm one rebalance swap. Returns null for dust skips. */
async function performSwap(
  connection: Connection,
  keypair: Keypair,
  swap: PlannedSwap,
): Promise<SwapResult | null> {
  const inputSymbol = basketStore.config.tokens.find((t) => t.mint === swap.inputMint)?.symbol
    ?? (swap.inputMint === WSOL ? "SOL" : swap.inputMint.slice(0, 4));
  const outputSymbol = basketStore.config.tokens.find((t) => t.mint === swap.outputMint)?.symbol
    ?? (swap.outputMint === WSOL ? "SOL" : swap.outputMint.slice(0, 4));
  const swapLabel = `${inputSymbol} → ${outputSymbol}`;
  const failed: SwapResult = { label: swapLabel, sol: swap.displaySol, status: "failed" };
  const confirmed: SwapResult = { label: swapLabel, sol: swap.displaySol, status: "confirmed" };

  const tradeId = randomUUID();
  const tradeRecord = {
    id: tradeId,
    timestamp: Date.now(),
    profitSol: 0,
    profitBps: 0,
    route: `REBALANCE: ${swapLabel}`,
    dexLabels: [] as string[],
    bundleId: "",
    status: "pending" as const,
    inputSol: swap.displaySol,
    outputSol: 0,
  };

  if (swap.rawAmount < 1_000n) return null; // skip dust — before addTrade to avoid phantom pending entries

  try {
    store.addTrade(tradeRecord);

    // Stagger rebalance swaps — not latency-sensitive
    await new Promise((r) => setTimeout(r, 1000));

    // Use lite API + higher slippage for rebalance (not latency-sensitive, just needs to fill)
    const params = new URLSearchParams({
      inputMint: swap.inputMint,
      outputMint: swap.outputMint,
      amount: swap.rawAmount.toString(),
      slippageBps: CONFIG.REBALANCE_SLIPPAGE_BPS.toString(),
    });

    // Retry quote on 429
    let qRes: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      qRes = await fetch(`${CONFIG.JUPITER_LITE_QUOTE_URL}?${params}`);
      if (qRes.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!qRes || !qRes.ok) {
      console.error("[basket] quote failed:", qRes ? await qRes.text() : "no response");
      store.updateTradeStatus(tradeId, "failed");
      return failed;
    }

    const quote = (await qRes.json()) as JupiterQuote;
    const outAmountSol = swap.outputMint === WSOL
      ? Number(BigInt(quote.outAmount)) / 1e9
      : swap.displaySol;

    // Build swap tx via lite API (no key needed)
    const swapBody = JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: CONFIG.PRIORITY_FEE_LAMPORTS, priorityLevel: "medium" } },
    });
    let swapHttpRes: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      swapHttpRes = await fetch(CONFIG.JUPITER_LITE_SWAP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: swapBody,
      });
      if (swapHttpRes.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!swapHttpRes || !swapHttpRes.ok) {
      const errText = swapHttpRes ? await swapHttpRes.text() : "no response";
      console.error("[basket] swap tx failed:", errText);
      store.updateTradeStatus(tradeId, "failed");
      return failed;
    }

    const swapRes = (await swapHttpRes.json()) as { swapTransaction: string };
    const tx = VersionedTransaction.deserialize(
      Buffer.from(swapRes.swapTransaction, "base64"),
    );
    tx.sign([keypair]);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    console.log(`[basket] rebalance swap sent: ${sig}`);

    // Update record with sig and approximate output
    const t = store.trades.find((r) => r.id === tradeId);
    if (t) {
      t.bundleId = sig;
      t.outputSol = outAmountSol;
      t.dexLabels = [quote.routePlan?.[0]?.swapInfo?.label ?? "Jupiter"];
    }

    // Wait for on-chain confirmation before marking status
    try {
      const result = await connection.confirmTransaction(sig, "confirmed");
      if (result.value.err) {
        console.error(`[basket] swap failed on-chain: ${JSON.stringify(result.value.err)}`);
        store.updateTradeStatus(tradeId, "failed");
        return failed;
      }
      console.log(`[basket] swap confirmed: ${sig}`);
      store.updateTradeStatus(tradeId, "confirmed");
      return confirmed;
    } catch {
      // confirmTransaction timed out — the tx may still land. Poll once before giving up.
      console.warn(`[basket] confirmation timeout for ${sig} — polling status once`);
      try {
        await new Promise((r) => setTimeout(r, 5000));
        const { value } = await connection.getSignatureStatus(sig);
        const conf = value?.confirmationStatus;
        if (conf === "confirmed" || conf === "finalized") {
          console.log(`[basket] swap confirmed (late): ${sig}`);
          store.updateTradeStatus(tradeId, "confirmed");
          return confirmed;
        }
        console.warn(`[basket] swap status unknown after poll (${conf ?? "null"}): ${sig}`);
        store.updateTradeStatus(tradeId, "failed");
        return failed;
      } catch (pollErr) {
        console.error(`[basket] status poll failed for ${sig}:`, pollErr);
        store.updateTradeStatus(tradeId, "failed");
        return failed;
      }
    }
  } catch (e) {
    console.error("[basket] swap failed:", e);
    store.updateTradeStatus(tradeId, "failed");
    return failed;
  }
}

// ── Token metadata lookup ─────────────────────────────────────────────────────
// Jupiter token API endpoints are gone from both free and paid tiers.
// Use Helius DAS getAsset (already authenticated via HELIUS_API_KEY).

export async function lookupTokenSymbol(mint: string): Promise<string | null> {
  try {
    const res = await fetch(`${CONFIG.RPC_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "lookup",
        method: "getAsset",
        params: { id: mint },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { content?: { metadata?: { symbol?: string; name?: string } } };
    };
    const meta = json.result?.content?.metadata;
    return meta?.symbol ?? meta?.name ?? null;
  } catch {
    return null;
  }
}
