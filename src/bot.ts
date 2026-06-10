import { Connection, Keypair } from "@solana/web3.js";
import { CONFIG } from "./config.js";
import { checkArbOpportunity } from "./jupiter.js";
import { executeArb, loadKeypair } from "./executor.js";
import { startWatcher, type Watcher } from "./watcher.js";
import { store } from "./store.js";
import { basketStore } from "./basket-store.js";
import { refreshHoldings, needsRebalance, executeRebalance } from "./basket.js";
import { recordSnapshot } from "./value-history.js";

let watcher: Watcher | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let balanceTimer: NodeJS.Timeout | null = null;
let rebalanceTimer: NodeJS.Timeout | null = null;
let pending = 0;
let rebalancing = false;
let lastArbAt = 0;
let connection: Connection | null = null;
let keypair: Keypair | null = null;

async function refreshBalance() {
  if (!connection || !keypair) return;
  try {
    const lamports = await connection.getBalance(keypair.publicKey);
    store.setWalletBalance(lamports / 1e9);
  } catch { /* non-fatal */ }
}

async function refreshBasket() {
  if (!connection || !keypair) return;
  try {
    await refreshHoldings(connection, keypair.publicKey);
    // basketStore.on("holdings") in api.ts handles the SSE broadcast via basketSnapshot()
    // Record value snapshot for 24h chart (fire-and-forget)
    recordSnapshot(basketStore.totalValueSol).catch(() => {});
  } catch (e) {
    console.error("[bot] basket refresh failed:", e);
  }
}

async function tryRebalance() {
  if (!connection || !keypair || rebalancing) return;
  if (pending > 0) return; // don't spend SOL while an arb bundle is in flight
  if (!needsRebalance()) return;

  rebalancing = true;
  console.log("[bot] rebalancing basket…");
  try {
    await executeRebalance(connection, keypair);
    await refreshBasket();
    await refreshBalance();
  } catch (e) {
    console.error("[bot] rebalance failed:", e);
  } finally {
    rebalancing = false;
  }
}

async function tryArb() {
  if (!connection || !keypair) return;
  if (pending >= CONFIG.MAX_PENDING) return;
  if (rebalancing) return; // pause arb during rebalance
  if (Date.now() - lastArbAt < CONFIG.ARB_COOLDOWN_MS) return;

  pending++;
  try {
    const opp = await checkArbOpportunity();
    if (!opp) { process.stdout.write("."); return; }
    lastArbAt = Date.now();
    await executeArb(opp, keypair);
    await refreshBalance();
  } catch (err) {
    console.error("[bot] arb error:", err);
  } finally {
    pending = Math.max(0, pending - 1);
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

  watcher = startWatcher(() => tryArb().catch(console.error));
  pollTimer = setInterval(() => tryArb().catch(console.error), 20_000);
  balanceTimer = setInterval(async () => {
    await refreshBalance();
    await refreshBasket();
  }, 3 * 60_000); // 3 min — basket pricing makes N quote calls, keep off lite API rate limit

  // Check rebalance every 5 minutes
  rebalanceTimer = setInterval(() => tryRebalance().catch(console.error), 5 * 60_000);

  refreshBalance();
  refreshBasket();
}

export function stopBot() {
  if (!store.botState.running) return;

  watcher?.stop();
  watcher = null;

  for (const t of [pollTimer, balanceTimer, rebalanceTimer]) {
    if (t) clearInterval(t);
  }
  pollTimer = balanceTimer = rebalanceTimer = null;

  rebalancing = false;
  connection = null;
  keypair = null;

  store.setBotState({ running: false, startedAt: null, error: null });
  console.log("[bot] stopped");
}

/** Resubscribe the websocket watcher — needed after TOKEN_MINT changes. */
export function restartWatcher(): void {
  if (!store.botState.running) return;
  watcher?.stop();
  watcher = startWatcher(() => tryArb().catch(console.error));
  console.log("[bot] watcher restarted for new token mint");
}

/** Force rebalance from API — skips needsRebalance() check. */
export async function forceRebalance(): Promise<void> {
  if (!connection || !keypair) throw new Error("Bot not running — start the bot first");
  if (rebalancing) throw new Error("Rebalance already in progress");
  if (pending > 0) throw new Error("Arb in flight — retry in a few seconds");

  rebalancing = true;
  console.log("[bot] force rebalancing basket…");
  try {
    await executeRebalance(connection, keypair);
    await refreshBasket();
    await refreshBalance();
  } finally {
    rebalancing = false;
  }
}

/** Called from API to trigger an immediate basket refresh. */
export async function triggerBasketRefresh(): Promise<void> {
  await refreshBasket();
}
