import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

const TRADES_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "trades.json");

function loadTrades(): TradeRecord[] {
  try {
    if (fs.existsSync(TRADES_PATH)) {
      return JSON.parse(fs.readFileSync(TRADES_PATH, "utf-8")) as TradeRecord[];
    }
  } catch { /* start fresh on corrupt file */ }
  return [];
}

function saveTrades(trades: TradeRecord[]) {
  try {
    fs.mkdirSync(path.dirname(TRADES_PATH), { recursive: true });
    fs.writeFileSync(TRADES_PATH, JSON.stringify(trades));
  } catch (e) {
    console.error("[store] save trades failed:", e);
  }
}

export interface TradeRecord {
  id: string;
  timestamp: number;
  profitSol: number;
  profitBps: number;
  route: string;        // "SOL → TOKEN → USDC → SOL"
  dexLabels: string[];  // DEX per leg
  bundleId: string;
  status: "pending" | "confirmed" | "failed";
  inputSol: number;
  outputSol: number;
  costBps: number;      // execution cost = Jupiter quote price impact, in bps (0 = unknown)
}

export interface BotState {
  running: boolean;
  startedAt: number | null;
  error: string | null;
}

export interface StoreSnapshot {
  botState: BotState;
  trades: TradeRecord[];
  totalProfitSol: number;
  totalTrades: number;
  walletBalanceSol: number | null;
}

const MAX_TRADES = 100;

class Store extends EventEmitter {
  trades: TradeRecord[];
  botState: BotState = { running: false, startedAt: null, error: null };
  totalProfitSol = 0;
  totalTrades = 0;
  walletBalanceSol: number | null = null;

  constructor() {
    super();
    this.trades = loadTrades();
    // Recompute totals from persisted trades
    for (const t of this.trades) {
      if (t.status === "confirmed") {
        this.totalTrades++;
        this.totalProfitSol += t.profitSol;
      }
    }
  }

  addTrade(trade: TradeRecord) {
    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.pop();
    saveTrades(this.trades);
    this.emit("update", "trade", trade);
  }

  updateTradeStatus(id: string, status: TradeRecord["status"]) {
    const t = this.trades.find((r) => r.id === id);
    if (!t) return;
    const wasPending = t.status === "pending";
    t.status = status;
    if (status === "confirmed" && wasPending) {
      this.totalTrades++;
      this.totalProfitSol += t.profitSol;
    }
    saveTrades(this.trades);
    this.emit("update", "trade", t);
  }

  clearTrades() {
    this.trades = [];
    this.totalTrades = 0;
    this.totalProfitSol = 0;
    saveTrades(this.trades);
    // push a fresh snapshot so all connected clients drop the log
    this.emit("update", "snapshot", this.snapshot());
  }

  setBotState(patch: Partial<BotState>) {
    Object.assign(this.botState, patch);
    this.emit("update", "status", this.botState);
  }

  setWalletBalance(sol: number) {
    this.walletBalanceSol = sol;
    this.emit("update", "balance", sol);
  }

  snapshot(): StoreSnapshot {
    return {
      botState: { ...this.botState },
      trades: [...this.trades],
      totalProfitSol: this.totalProfitSol,
      totalTrades: this.totalTrades,
      walletBalanceSol: this.walletBalanceSol,
    };
  }
}

export const store = new Store();
