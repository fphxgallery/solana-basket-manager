import { Connection, Keypair } from "@solana/web3.js";
import { CONFIG } from "./config.js";
import { loadKeypair } from "./wallet.js";
import { store } from "./store.js";
import { basketStore } from "./basket-store.js";
import { refreshHoldings, needsRebalance, executeRebalance, reconcileLending } from "./basket.js";
import { recordSnapshot } from "./value-history.js";
import { notify, getReportSchedule, sendDailyReport } from "./telegram.js";

let balanceTimer: NodeJS.Timeout | null = null;
let rebalanceTimer: NodeJS.Timeout | null = null;
let reportTimer: NodeJS.Timeout | null = null;
let rebalancing = false;
let connection: Connection | null = null;
let keypair: Keypair | null = null;
let lastReportDate: string | null = null;

function checkDailyReport() {
  const { enabled, time } = getReportSchedule();
  if (!enabled || !time) return;

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  // Use local date (not UTC) — toISOString() flips at midnight UTC which mismatches local hours
  const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")}`;

  if (currentTime >= time && lastReportDate !== today) {
    lastReportDate = today;
    sendDailyReport().catch((e) => console.error("[bot] daily report failed:", e));
  }
}

async function refreshBasket() {
  if (!connection || !keypair) return;
  try {
    await refreshHoldings(connection, keypair.publicKey);
    // basketStore.on("holdings") in api.ts handles the SSE broadcast via basketSnapshot()
    // Record value snapshot for 24h chart (fire-and-forget)
    recordSnapshot(basketStore.totalValueSol).catch(() => {});
    // Park excess idle USDC into Jupiter Lend — skip while a rebalance is mid-flight
    // so we don't strand funds a swap is about to spend (it withdraws on demand anyway).
    if (!rebalancing) {
      await reconcileLending(connection, keypair).catch((e) => console.error("[bot] lend reconcile failed:", e));
    }
  } catch (e) {
    console.error("[bot] basket refresh failed:", e);
  }
}

async function tryRebalance() {
  if (!connection || !keypair || rebalancing) return;
  if (!needsRebalance()) return;

  rebalancing = true;
  console.log("[bot] rebalancing basket…");
  try {
    await executeRebalance(connection, keypair);
    await refreshBasket();
  } catch (e) {
    console.error("[bot] rebalance failed:", e);
  } finally {
    rebalancing = false;
  }
}

export function startBot() {
  if (store.botState.running) return;

  try {
    keypair = loadKeypair();
    connection = new Connection(CONFIG.RPC_URL, "processed");
  } catch (err) {
    store.setBotState({ error: String(err), running: false });
    return;
  }

  store.setBotState({ running: true, startedAt: Date.now(), error: null });
  console.log("[bot] started —", keypair.publicKey.toBase58());
  notify("🤖 Basket Manager started").catch(() => {});

  balanceTimer = setInterval(() => refreshBasket().catch(console.error), 3 * 60_000); // 3 min

  // Check rebalance every 5 minutes
  rebalanceTimer = setInterval(() => tryRebalance().catch(console.error), 5 * 60_000);

  // Check daily report schedule every minute
  reportTimer = setInterval(checkDailyReport, 60_000);

  refreshBasket();
}

export function stopBot() {
  if (!store.botState.running) return;

  for (const t of [balanceTimer, rebalanceTimer, reportTimer]) {
    if (t) clearInterval(t);
  }
  balanceTimer = rebalanceTimer = reportTimer = null;

  rebalancing = false;
  connection = null;
  keypair = null;

  store.setBotState({ running: false, startedAt: null, error: null });
  console.log("[bot] stopped");
  notify("🛑 Basket Manager stopped").catch(() => {});
}

/** Force rebalance from API — skips needsRebalance() check. */
export async function forceRebalance(): Promise<void> {
  if (!connection || !keypair) throw new Error("Bot not running — start the bot first");
  if (rebalancing) throw new Error("Rebalance already in progress");

  rebalancing = true;
  console.log("[bot] force rebalancing basket…");
  try {
    await executeRebalance(connection, keypair);
    await refreshBasket();
  } finally {
    rebalancing = false;
  }
}

/** Called from API to trigger an immediate basket refresh. */
export async function triggerBasketRefresh(): Promise<void> {
  await refreshBasket();
}
