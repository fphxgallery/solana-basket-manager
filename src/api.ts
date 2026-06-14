import { Router, type Request, type Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { store } from "./store.js";
import { startBot, stopBot, forceRebalance, triggerBasketRefresh } from "./bot.js";
import { walletExists, getWalletPublicKey, createWallet, importWallet } from "./wallet.js";
import { basketStore, type BasketToken } from "./basket-store.js";
import { lookupTokenSymbol } from "./basket.js";
import { valueHistory, getSolUsd } from "./value-history.js";
import { getTelegramStatus, setTelegramConfig, clearTelegramConfig, notify, setReportSchedule, sendDailyReport } from "./telegram.js";

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
    hwmValueUsd: basketStore.hwmValueUsd,
    hwmCapturedAt: basketStore.hwmCapturedAt,
  };
}

basketStore.on("holdings", () => broadcast("basket", basketSnapshot()));
basketStore.on("changed", () => broadcast("basket", basketSnapshot()));

router.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send current snapshot immediately on connect
  res.write(`data: ${JSON.stringify({ type: "snapshot", data: store.snapshot() })}\n\n`);

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

router.get("/status", (_req: Request, res: Response) => {
  res.json(store.snapshot());
});

router.post("/start", (_req: Request, res: Response) => {
  startBot();
  res.json({ ok: true });
});

router.post("/stop", (_req: Request, res: Response) => {
  stopBot();
  res.json({ ok: true });
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

// Update basket settings (drift threshold, rebalance interval)
router.patch("/basket/settings", (req: Request, res: Response) => {
  const { driftThresholdPct, rebalanceIntervalHours, hwmEnabled, hwmHalfLifeDays, curvePoints, curveCap, minSwapUsd, dynamicWeightMint, reserveMint, reserveFloorPct } = req.body as {
    driftThresholdPct?: number;
    rebalanceIntervalHours?: number;
    hwmEnabled?: boolean;
    hwmHalfLifeDays?: number;
    curvePoints?: Array<[number, number]>;
    curveCap?: number;
    minSwapUsd?: number;
    dynamicWeightMint?: string;
    reserveMint?: string | null;
    reserveFloorPct?: number;
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
  if (hwmEnabled != null) {
    if (typeof hwmEnabled !== "boolean") {
      res.status(400).json({ error: "hwmEnabled must be a boolean" });
      return;
    }
    patch.hwmEnabled = hwmEnabled;
  }
  if (hwmHalfLifeDays != null) {
    if (typeof hwmHalfLifeDays !== "number" || hwmHalfLifeDays <= 0) {
      res.status(400).json({ error: "hwmHalfLifeDays must be a positive number" });
      return;
    }
    patch.hwmHalfLifeDays = hwmHalfLifeDays;
  }
  if (curvePoints != null) {
    if (!Array.isArray(curvePoints) || curvePoints.length < 2) {
      res.status(400).json({ error: "curvePoints must be an array of at least 2 points" });
      return;
    }
    for (const p of curvePoints) {
      if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== "number" || typeof p[1] !== "number" || p[1] < 0 || p[1] > 100) {
        res.status(400).json({ error: "each curve point must be [pnlPct, usdcPct] with usdcPct in [0, 100]" });
        return;
      }
    }
    for (let i = 1; i < curvePoints.length; i++) {
      if (curvePoints[i][0] <= curvePoints[i - 1][0]) {
        res.status(400).json({ error: "curve points must have strictly ascending PnL% values" });
        return;
      }
    }
    patch.curvePoints = curvePoints;
  }
  if (curveCap != null) {
    if (typeof curveCap !== "number" || curveCap < 0 || curveCap > 100) {
      res.status(400).json({ error: "curveCap must be a number in [0, 100]" });
      return;
    }
    patch.curveCap = curveCap;
  }
  if (minSwapUsd != null) {
    if (typeof minSwapUsd !== "number" || minSwapUsd < 0) {
      res.status(400).json({ error: "minSwapUsd must be a non-negative number" });
      return;
    }
    patch.minSwapUsd = minSwapUsd;
  }
  if (dynamicWeightMint != null) {
    if (typeof dynamicWeightMint !== "string" || !dynamicWeightMint.trim()) {
      res.status(400).json({ error: "dynamicWeightMint must be a non-empty string" });
      return;
    }
    try { new PublicKey(dynamicWeightMint); } catch {
      res.status(400).json({ error: "dynamicWeightMint: invalid mint address" });
      return;
    }
    patch.dynamicWeightMint = dynamicWeightMint;
  }
  if (reserveMint !== undefined) {
    if (reserveMint !== null) {
      if (typeof reserveMint !== "string") {
        res.status(400).json({ error: "reserveMint must be a string or null" });
        return;
      }
      try { new PublicKey(reserveMint); } catch {
        res.status(400).json({ error: "reserveMint: invalid mint address" });
        return;
      }
    }
    patch.reserveMint = reserveMint;
  }
  if (reserveFloorPct != null) {
    if (typeof reserveFloorPct !== "number" || reserveFloorPct < 0 || reserveFloorPct > 100) {
      res.status(400).json({ error: "reserveFloorPct must be a number in [0, 100]" });
      return;
    }
    patch.reserveFloorPct = reserveFloorPct;
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

// ── Telegram ──────────────────────────────────────────────────────────────────

router.get("/telegram", (_req: Request, res: Response) => {
  res.json(getTelegramStatus());
});

router.post("/telegram", (req: Request, res: Response) => {
  const { token, chatId } = req.body as { token?: string; chatId?: string };
  if (!token?.trim() || !chatId?.trim()) {
    res.status(400).json({ error: "token and chatId required" });
    return;
  }
  setTelegramConfig(token.trim(), chatId.trim());
  res.json({ ok: true, ...getTelegramStatus() });
});

router.delete("/telegram", (_req: Request, res: Response) => {
  clearTelegramConfig();
  res.json({ ok: true });
});

router.post("/telegram/test", async (_req: Request, res: Response) => {
  if (!getTelegramStatus().configured) {
    res.status(400).json({ error: "not configured" });
    return;
  }
  await notify("🔔 Test message from Basket Manager");
  res.json({ ok: true });
});

router.post("/telegram/report", async (_req: Request, res: Response) => {
  if (!getTelegramStatus().configured) {
    res.status(400).json({ error: "not configured" });
    return;
  }
  try {
    await sendDailyReport();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.patch("/telegram/report-schedule", (req: Request, res: Response) => {
  const { enabled, time } = req.body as { enabled?: boolean; time?: string };
  if (enabled != null && typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be boolean" });
    return;
  }
  if (time != null) {
    if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
      res.status(400).json({ error: "time must be HH:MM (24h)" });
      return;
    }
  }
  const current = getTelegramStatus();
  setReportSchedule(
    enabled !== undefined ? enabled : current.reportEnabled,
    time !== undefined ? time : current.reportTime,
  );
  res.json(getTelegramStatus());
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
