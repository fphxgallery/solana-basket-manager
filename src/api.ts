import { Router, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { CONFIG, runtimeConfig, saveRuntimeConfig } from "./config.js";
import { store } from "./store.js";
import { startBot, stopBot, forceRebalance, triggerBasketRefresh, restartWatcher } from "./bot.js";
import { walletExists, getWalletPublicKey, createWallet, importWallet } from "./wallet.js";
import { getSpread, clearSpreadCache } from "./jupiter.js";
import { basketStore, type BasketToken } from "./basket-store.js";
import { lookupTokenSymbol } from "./basket.js";
import { valueHistory, getSolUsd } from "./value-history.js";

export const router = Router();

// SSE clients
const sseClients = new Set<Response>();

function broadcast(type: string, data: unknown) {
  const msg = `data: ${JSON.stringify({ type, data })}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch { sseClients.delete(res); }
  }
}

store.on("update", broadcast);
function arbConfig() {
  return {
    arbAmountSol: runtimeConfig.ARB_AMOUNT_SOL,
    minProfitBps: runtimeConfig.MIN_PROFIT_BPS,
    tokenMint: runtimeConfig.TOKEN_MINT,
  };
}

function basketSnapshot() {
  return {
    holdings: basketStore.holdings,
    totalValueSol: basketStore.totalValueSol,
    totalValueUsd: basketStore.totalValueUsd,
    lastRebalanceAt: basketStore.lastRebalanceAt,
    config: basketStore.config,
    baselineValueSol: basketStore.baselineValueSol,
    baselineValueUsd: basketStore.baselineValueUsd,
    baselineTimestamp: basketStore.baselineTimestamp,
    pnlSol: basketStore.pnlSol,
    pnlPct: basketStore.pnlPct,
    pnlUsd: basketStore.pnlUsd,
    pnlPctUsd: basketStore.pnlPctUsd,
  };
}

basketStore.on("holdings", () => broadcast("basket", basketSnapshot()));
basketStore.on("changed", () => broadcast("basket", basketSnapshot()));

router.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send current snapshot immediately on connect (config included — UI inputs need it)
  res.write(`data: ${JSON.stringify({ type: "snapshot", data: { ...store.snapshot(), config: arbConfig() } })}\n\n`);

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

router.get("/status", (_req: Request, res: Response) => {
  res.json({ ...store.snapshot(), config: arbConfig() });
});

router.post("/start", (_req: Request, res: Response) => {
  startBot();
  res.json({ ok: true });
});

router.post("/stop", (_req: Request, res: Response) => {
  stopBot();
  res.json({ ok: true });
});

router.patch("/config", (req: Request, res: Response) => {
  const { arbAmountSol, minProfitBps, tokenMint } = req.body as {
    arbAmountSol?: number;
    minProfitBps?: number;
    tokenMint?: string;
  };

  if (arbAmountSol !== undefined) {
    if (typeof arbAmountSol !== "number" || arbAmountSol <= 0) {
      res.status(400).json({ error: "arbAmountSol must be positive number" });
      return;
    }
    runtimeConfig.ARB_AMOUNT_SOL = arbAmountSol;
  }

  if (minProfitBps !== undefined) {
    if (typeof minProfitBps !== "number" || minProfitBps < 0) {
      res.status(400).json({ error: "minProfitBps must be non-negative number" });
      return;
    }
    runtimeConfig.MIN_PROFIT_BPS = minProfitBps;
  }

  if (tokenMint !== undefined) {
    const trimmed = typeof tokenMint === "string" ? tokenMint.trim() : "";
    try {
      new PublicKey(trimmed); // throws on invalid base58 / wrong length
    } catch {
      res.status(400).json({ error: "tokenMint is not a valid Solana address" });
      return;
    }
    if (trimmed === CONFIG.WSOL_MINT) {
      res.status(400).json({ error: "tokenMint cannot be WSOL — circuits already start and end with SOL" });
      return;
    }
    if (trimmed !== runtimeConfig.TOKEN_MINT) {
      runtimeConfig.TOKEN_MINT = trimmed;
      clearSpreadCache();    // old token's spread is meaningless now
      restartWatcher();      // resubscribe websocket to the new mint
      console.log(`[config] arb token changed to ${trimmed}`);
    }
  }

  saveRuntimeConfig();
  res.json(arbConfig());
});

// ── Basket ────────────────────────────────────────────────────────────────────

router.get("/basket", (_req: Request, res: Response) => {
  res.json(basketSnapshot());
});

// 24h portfolio value history + current SOL/USD price
router.get("/basket/value-history", async (_req: Request, res: Response) => {
  const solUsd = await getSolUsd();
  res.json({ points: valueHistory, solUsd });
});

// Lookup token symbol by mint (for add-token flow)
router.get("/basket/token-info/:mint", async (req: Request, res: Response) => {
  const symbol = await lookupTokenSymbol(String(req.params.mint));
  res.json({ symbol });
});

// Replace full token list
router.put("/basket/tokens", (req: Request, res: Response) => {
  const { tokens } = req.body as { tokens: BasketToken[] };
  if (!Array.isArray(tokens)) { res.status(400).json({ error: "tokens must be array" }); return; }

  for (const t of tokens) {
    if (typeof t?.symbol !== "string" || !t.symbol.trim()) {
      res.status(400).json({ error: "each token needs a symbol" });
      return;
    }
    if (typeof t.targetWeight !== "number" || !(t.targetWeight > 0) || t.targetWeight > 100) {
      res.status(400).json({ error: `${t.symbol}: targetWeight must be a number in (0, 100]` });
      return;
    }
    try {
      new PublicKey(String(t.mint));
    } catch {
      res.status(400).json({ error: `${t.symbol}: invalid mint address` });
      return;
    }
  }
  const weightSum = tokens.reduce((s, t) => s + t.targetWeight, 0);
  if (tokens.length > 0 && Math.abs(weightSum - 100) > 0.01) {
    res.status(400).json({ error: `weights sum to ${weightSum.toFixed(2)}% — must equal 100%` });
    return;
  }

  basketStore.setTokens(tokens);
  triggerBasketRefresh().catch(console.error);
  res.json({ ok: true, tokens: basketStore.config.tokens });
});

// Update basket settings (drift threshold, rebalance interval, arb sizing)
router.patch("/basket/settings", (req: Request, res: Response) => {
  const { driftThresholdPct, rebalanceIntervalHours, arbSizingPct } = req.body as {
    driftThresholdPct?: number;
    rebalanceIntervalHours?: number;
    arbSizingPct?: number;
  };
  const patch: Parameters<typeof basketStore.updateSettings>[0] = {};
  if (driftThresholdPct != null) {
    if (typeof driftThresholdPct !== "number" || driftThresholdPct <= 0 || driftThresholdPct > 100) {
      res.status(400).json({ error: "driftThresholdPct must be a number in (0, 100]" });
      return;
    }
    patch.driftThresholdPct = driftThresholdPct;
  }
  if (rebalanceIntervalHours != null) {
    if (typeof rebalanceIntervalHours !== "number" || rebalanceIntervalHours <= 0) {
      res.status(400).json({ error: "rebalanceIntervalHours must be a positive number" });
      return;
    }
    patch.rebalanceIntervalHours = rebalanceIntervalHours;
  }
  if (arbSizingPct != null) {
    if (typeof arbSizingPct !== "number" || arbSizingPct <= 0 || arbSizingPct > 100) {
      res.status(400).json({ error: "arbSizingPct must be a number in (0, 100]" });
      return;
    }
    patch.arbSizingPct = arbSizingPct;
  }
  basketStore.updateSettings(patch);
  res.json(basketStore.config);
});

// Reset PnL baseline to current portfolio value
router.post("/basket/reset-baseline", (_req: Request, res: Response) => {
  basketStore.resetBaseline();
  res.json({ baselineValueSol: basketStore.baselineValueSol, baselineTimestamp: basketStore.baselineTimestamp });
});

// Manual rebalance trigger — force-executes (bypasses needsRebalance check), awaits completion
router.post("/basket/rebalance", async (_req: Request, res: Response) => {
  try {
    await forceRebalance();
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
  }
});

// ── Spread ───────────────────────────────────────────────────────────────────

router.get("/spread", async (_req: Request, res: Response) => {
  const spread = await getSpread();
  if (!spread) { res.status(503).json({ error: "Unable to fetch quotes" }); return; }
  res.json(spread);
});

// ── Wallet ────────────────────────────────────────────────────────────────────

router.get("/wallet", (_req: Request, res: Response) => {
  res.json({ exists: walletExists(), publicKey: getWalletPublicKey() });
});

router.post("/wallet/create", (req: Request, res: Response) => {
  const { force } = req.body as { force?: boolean };

  if (walletExists() && !force) {
    res.status(409).json({ error: "wallet_exists", publicKey: getWalletPublicKey() });
    return;
  }

  if (store.botState.running) stopBot();

  const { publicKey, secretKey } = createWallet();
  // secretKey returned once so user can back it up — not stored anywhere else
  res.json({ publicKey, secretKey });
});

router.post("/wallet/import", (req: Request, res: Response) => {
  const { secretKey, force } = req.body as { secretKey?: string; force?: boolean };

  if (!secretKey?.trim()) {
    res.status(400).json({ error: "secretKey required" });
    return;
  }

  if (walletExists() && !force) {
    res.status(409).json({ error: "wallet_exists", publicKey: getWalletPublicKey() });
    return;
  }

  if (store.botState.running) stopBot();

  try {
    const publicKey = importWallet(secretKey);
    res.json({ publicKey });
  } catch {
    res.status(400).json({ error: "invalid_key", message: "Invalid base58 secret key" });
  }
});
