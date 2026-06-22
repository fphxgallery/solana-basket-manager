import { EventEmitter } from "events";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR ?? "./data";
const TRADES_PATH = path.resolve(DATA_DIR, "trades.json");
const LENDING_PATH = path.resolve(DATA_DIR, "lending-log.json");

function loadJson<T>(file: string): T[] {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8")) as T[];
  } catch { /* start fresh on corrupt file */ }
  return [];
}

function saveJson(file: string, data: unknown) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (e) {
    console.error(`[store] save ${path.basename(file)} failed:`, e);
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

// Jupiter Lend deposit/withdraw activity. Kept separate from TradeRecord so lend ops
// never pollute rebalance cost metrics or draw value-chart rebalance markers.
export interface LendingEvent {
  id: string;
  timestamp: number;
  kind: "deposit" | "withdraw";
  amountUsd: number;
  apyPct?: number;   // deposits only
  sig: string;       // tx signature ("" if it failed before sending)
  status: "confirmed" | "failed";
  note?: string;     // e.g. "fund STIX → SOL sell"
}

export interface BotState {
  running: boolean;
  startedAt: number | null;
  error: string | null;
}

export interface StoreSnapshot {
  botState: BotState;
  trades: TradeRecord[];
  lendingEvents: LendingEvent[];
  totalProfitSol: number;
  totalTrades: number;
  walletBalanceSol: number | null;
}

const MAX_TRADES = 100;
const MAX_LENDING = 100;

class Store extends EventEmitter {
  trades: TradeRecord[];
  lendingEvents: LendingEvent[];
  botState: BotState = { running: false, startedAt: null, error: null };
  totalProfitSol = 0;
  totalTrades = 0;
  walletBalanceSol: number | null = null;

  constructor() {
    super();
    this.trades = loadJson<TradeRecord>(TRADES_PATH);
    this.lendingEvents = loadJson<LendingEvent>(LENDING_PATH);
    // Recompute totals from persisted trades
    for (const t of this.trades) {
      if (t.status === "confirmed") {
        this.totalTrades++;
        this.totalProfitSol += t.profitSol;
      }
    }
  }

  addLendingEvent(ev: LendingEvent) {
    this.lendingEvents.unshift(ev);
    if (this.lendingEvents.length > MAX_LENDING) this.lendingEvents.pop();
    saveJson(LENDING_PATH, this.lendingEvents);
    this.emit("update", "lending", ev);
  }

  clearLending() {
    this.lendingEvents = [];
    saveJson(LENDING_PATH, this.lendingEvents);
    this.emit("update", "snapshot", this.snapshot());
  }

  addTrade(trade: TradeRecord) {
    this.trades.unshift(trade);
    if (this.trades.length > MAX_TRADES) this.trades.pop();
    saveJson(TRADES_PATH, this.trades);
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
    saveJson(TRADES_PATH, this.trades);
    this.emit("update", "trade", t);
  }

  clearTrades() {
    this.trades = [];
    this.totalTrades = 0;
    this.totalProfitSol = 0;
    saveJson(TRADES_PATH, this.trades);
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
      lendingEvents: [...this.lendingEvents],
      totalProfitSol: this.totalProfitSol,
      totalTrades: this.totalTrades,
      walletBalanceSol: this.walletBalanceSol,
    };
  }
}

export const store = new Store();
