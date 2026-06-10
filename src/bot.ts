import { Connection, Keypair } from "@solana/web3.js";
import { CONFIG } from "./config.js";
import { loadKeypair } from "./wallet.js";
import { store } from "./store.js";
import { basketStore } from "./basket-store.js";
import { refreshHoldings, needsRebalance, executeRebalance } from "./basket.js";
import { recordSnapshot } from "./value-history.js";

let balanceTimer: NodeJS.Timeout | null = null;
let rebalanceTimer: NodeJS.Timeout | null = null;
let rebalancing = false;
let connection: Connection | null = null;
let keypair: Keypair | null = null;

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

  balanceTimer = setInterval(() => refreshBasket().catch(console.error), 3 * 60_000); // 3 min

  // Check rebalance every 5 minutes
  rebalanceTimer = setInterval(() => tryRebalance().catch(console.error), 5 * 60_000);

  refreshBasket();
}

export function stopBot() {
  if (!store.botState.running) return;

  for (const t of [balanceTimer, rebalanceTimer]) {
    if (t) clearInterval(t);
  }
  balanceTimer = rebalanceTimer = null;

  rebalancing = false;
  connection = null;
  keypair = null;

  store.setBotState({ running: false, startedAt: null, error: null });
  console.log("[bot] stopped");
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
