export interface TradeRecord {
  id: string;
  timestamp: number;
  profitSol: number;
  profitBps: number;
  route: string;
  dexLabels: string[];
  bundleId: string;
  status: "pending" | "confirmed" | "failed";
  inputSol: number;
  outputSol: number;
  costBps?: number; // execution cost = Jupiter quote price impact, in bps (absent on older records)
}

export interface BotState {
  running: boolean;
  startedAt: number | null;
  error: string | null;
}

export interface BasketToken {
  mint: string;
  symbol: string;
  targetWeight: number;
}

export interface TokenHolding {
  mint: string;
  symbol: string;
  balance: number;
  priceSol: number;
  valueSol: number;
  currentWeight: number;
  targetWeight: number;
  driftPct: number;
}

export interface BasketState {
  config: {
    tokens: BasketToken[];
    driftThresholdPct: number;
    rebalanceIntervalHours: number;
    hwmEnabled: boolean;
    hwmHalfLifeDays: number;
    curvePoints: Array<[number, number]>;
    curveCap: number;
    minSwapUsd: number;
    dynamicWeightMint: string;
    reserveMint: string | null;
    reserveFloorPct: number;
    lendEnabled: boolean;
    lendMint: string;
    lendBufferPct: number;
    lendBufferDriftMult: number;
    lendMinDepositUsd: number;
  };
  holdings: TokenHolding[];
  totalValueSol: number;
  totalValueUsd: number;
  lastRebalanceAt: number | null;
  baselineValueSol: number | null;
  baselineValueUsd: number | null;
  baselineTimestamp: number | null;
  pnlSol: number | null;
  pnlPct: number | null;
  pnlUsd: number | null;
  pnlPctUsd: number | null;
  hwmValueUsd: number | null;
  hwmCapturedAt: number | null;
  lentValueSol: number;
  lentValueUsd: number;
  lentBalanceUi: number;
  lendApy: number;
}

export interface ValuePoint {
  ts: number;
  valueUsd: number;
}

export interface AppState {
  botState: BotState;
  trades: TradeRecord[];
  totalProfitSol: number;
  totalTrades: number;
  walletBalanceSol: number | null;
}
