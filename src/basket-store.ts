import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

export interface BasketToken {
  mint: string;
  symbol: string;
  targetWeight: number; // 0–100, all tokens must sum to 100
}

export interface BasketConfig {
  tokens: BasketToken[];
  driftThresholdPct: number;      // rebalance trigger per token, default 5
  rebalanceIntervalHours: number; // forced rebalance cadence, default 24
  hwmEnabled: boolean;            // high-water mark profit lock, default false
  hwmHalfLifeDays: number;        // HWM decay half-life in days, default 7
  curvePoints: Array<[number, number]>; // [pnlPct, tokenWeightPct] pairs, ascending by pnlPct
  curveCap: number;               // dynamic token weight when pnlPct > last curve point, default 30
  minSwapUsd: number;             // skip rebalance swaps worth less than this in USD, default 5
  dynamicWeightMint: string;      // token that gets the dynamic profit-taking weight (default USDC)
  reserveMint: string | null;     // token with a hard floor weight; null = disabled
  reserveFloorPct: number;        // minimum weight % enforced for reserveMint
  // ── Jupiter Lend (idle-USDC yield) ──
  lendEnabled: boolean;           // master switch; false ships a no-op
  lendMint: string;               // underlying token to park (default USDC, usually == dynamicWeightMint)
  lendBufferPct: number;          // floor: keep at least this % of TOTAL PORTFOLIO value liquid in-wallet
  lendBufferDriftMult: number;    // dynamic buffer = max(lendBufferPct, mult × driftThresholdPct) % of portfolio; 0 = static
  lendMinDepositUsd: number;      // don't deposit/withdraw smaller than this (gas floor)
}

export interface TokenHolding {
  mint: string;
  symbol: string;
  balance: number;        // human units (e.g. 1.5 USDC)
  rawAmount: string;      // on-chain atom string (e.g. "1500000" for USDC with 6 decimals)
  priceSol: number;       // price per 1 token in SOL
  valueSol: number;       // balance × priceSol
  currentWeight: number;  // 0–100
  targetWeight: number;   // 0–100
  driftPct: number;       // currentWeight − targetWeight (signed)
}

const DATA_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "basket.json");

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const DEFAULTS: BasketConfig = {
  tokens: [],
  driftThresholdPct: 1,
  rebalanceIntervalHours: 24,
  hwmEnabled: false,
  hwmHalfLifeDays: 7,
  curvePoints: [[-20, 0], [-10, 5], [0, 10], [10, 15], [15, 20], [20, 25]],
  curveCap: 30,
  minSwapUsd: 5,
  dynamicWeightMint: USDC_MINT,
  reserveMint: null,
  reserveFloorPct: 0,
  lendEnabled: false,
  lendMint: USDC_MINT,
  lendBufferPct: 4,
  lendBufferDriftMult: 2.5,
  lendMinDepositUsd: 10,
};

class BasketStore extends EventEmitter {
  config: BasketConfig;
  holdings: TokenHolding[] = [];
  totalValueSol = 0;
  totalValueUsd = 0;
  lastRebalanceAt: number | null = null;
  /** Last known price per token (mint → SOL). Persists across failed refreshes. */
  priceCache: Record<string, number> = {};
  /** Portfolio value when PnL tracking started. Null = not yet set. */
  baselineValueSol: number | null = null;
  baselineValueUsd: number | null = null;
  baselineTimestamp: number | null = null;
  /** High-water mark for dynamic USDC weight profit lock. */
  hwmValueUsd: number | null = null;
  hwmCapturedAt: number | null = null;
  /** Jupiter Lend — transient, recomputed each refresh (not persisted). */
  lentValueSol = 0;
  lentValueUsd = 0;
  lentBalanceUi = 0;  // lent amount in whole lendMint tokens
  lendApy = 0;        // current vault APY, percent
  lendEarningsLifetimeUi = 0;   // cumulative earned, whole lendMint tokens (transient)
  lendEarningsLifetimeUsd = 0;  // transient
  lendEarningsPeriodUsd = 0;    // lifetime − baseline, transient
  /** Earnings baseline for the "since" period — persisted. */
  lendEarningsBaselineUi: number | null = null;
  lendEarningsBaselineAt: number | null = null;

  get pnlSol(): number | null {
    if (this.baselineValueSol == null || this.totalValueSol === 0) return null;
    return this.totalValueSol - this.baselineValueSol;
  }

  get pnlPct(): number | null {
    if (this.baselineValueSol == null || this.baselineValueSol === 0) return null;
    return ((this.totalValueSol - this.baselineValueSol) / this.baselineValueSol) * 100;
  }

  get pnlUsd(): number | null {
    if (this.baselineValueUsd == null || this.totalValueUsd === 0) return null;
    return this.totalValueUsd - this.baselineValueUsd;
  }

  get pnlPctUsd(): number | null {
    if (this.baselineValueUsd == null || this.baselineValueUsd === 0) return null;
    return ((this.totalValueUsd - this.baselineValueUsd) / this.baselineValueUsd) * 100;
  }

  constructor() {
    super();
    this.config = this._load();
  }

  private _load(): BasketConfig {
    try {
      if (fs.existsSync(DATA_PATH)) {
        const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8")) as BasketConfig & {
          priceCache?: Record<string, number>;
          totalValueUsd?: number;
          baselineValueSol?: number;
          baselineValueUsd?: number;
          baselineTimestamp?: number;
          lastRebalanceAt?: number;
          hwmValueUsd?: number;
          hwmCapturedAt?: number;
          lendEarningsBaselineUi?: number;
          lendEarningsBaselineAt?: number;
        };
        if (raw.priceCache) this.priceCache = raw.priceCache;
        if (raw.totalValueUsd) this.totalValueUsd = raw.totalValueUsd;
        if (raw.baselineValueSol != null) this.baselineValueSol = raw.baselineValueSol;
        if (raw.baselineValueUsd != null) this.baselineValueUsd = raw.baselineValueUsd;
        if (raw.baselineTimestamp != null) this.baselineTimestamp = raw.baselineTimestamp;
        if (raw.lastRebalanceAt != null) this.lastRebalanceAt = raw.lastRebalanceAt;
        if (raw.hwmValueUsd != null) this.hwmValueUsd = raw.hwmValueUsd;
        if (raw.hwmCapturedAt != null) this.hwmCapturedAt = raw.hwmCapturedAt;
        if (raw.lendEarningsBaselineUi != null) this.lendEarningsBaselineUi = raw.lendEarningsBaselineUi;
        if (raw.lendEarningsBaselineAt != null) this.lendEarningsBaselineAt = raw.lendEarningsBaselineAt;
        const { priceCache: _pc, totalValueUsd: _tvu, baselineValueSol: _bv, baselineValueUsd: _bvu, baselineTimestamp: _bt, lastRebalanceAt: _lr, hwmValueUsd: _hv, hwmCapturedAt: _hc, lendEarningsBaselineUi: _leb, lendEarningsBaselineAt: _lea, ...config } = raw;
        // Merge defaults — a basket.json missing a field (old version, hand edit)
        // must not produce undefined settings (NaN/dead drift checks)
        return { ...DEFAULTS, ...config };
      }
    } catch { /* ignore, use defaults */ }
    return { ...DEFAULTS };
  }

  private _save() {
    try {
      fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
      fs.writeFileSync(DATA_PATH, JSON.stringify({
        ...this.config,
        priceCache: this.priceCache,
        totalValueUsd: this.totalValueUsd,
        baselineValueSol: this.baselineValueSol,
        baselineValueUsd: this.baselineValueUsd,
        baselineTimestamp: this.baselineTimestamp,
        lastRebalanceAt: this.lastRebalanceAt,
        hwmValueUsd: this.hwmValueUsd,
        hwmCapturedAt: this.hwmCapturedAt,
        lendEarningsBaselineUi: this.lendEarningsBaselineUi,
        lendEarningsBaselineAt: this.lendEarningsBaselineAt,
      }, null, 2));
    } catch (e) {
      console.error("[basket-store] save failed:", e);
    }
  }

  setTokens(tokens: BasketToken[]) {
    this.config.tokens = tokens;
    this._save();
    this.emit("changed");
  }

  updateSettings(patch: Partial<Omit<BasketConfig, "tokens">>) {
    Object.assign(this.config, patch);
    this._save();
    this.emit("changed");
  }

  setHoldings(holdings: TokenHolding[], totalValueSol: number, totalValueUsd: number) {
    this.holdings = holdings;
    this.totalValueSol = totalValueSol;
    if (totalValueUsd > 0) this.totalValueUsd = totalValueUsd; // keep last known on CoinGecko failure
    this._save(); // persists priceCache + totalValueUsd so restart doesn't lose it
    this.emit("holdings");
  }

  setBaseline(valueSol: number, valueUsd: number) {
    this.baselineValueSol = valueSol;
    this.baselineValueUsd = valueUsd;
    this.baselineTimestamp = Date.now();
    this._save();
  }

  /** Patch USD baseline only — used to migrate old basket.json that lacked baselineValueUsd. */
  patchBaselineUsd(valueUsd: number) {
    this.baselineValueUsd = valueUsd;
    this._save();
  }

  resetBaseline() {
    this.baselineValueSol = this.totalValueSol > 0 ? this.totalValueSol : null;
    this.baselineValueUsd = this.totalValueUsd > 0 ? this.totalValueUsd : null;
    this.baselineTimestamp = this.baselineValueSol != null ? Date.now() : null;
    // HWM is relative to baseline — reset it too so a poisoned HWM can't persist
    this.hwmValueUsd = this.totalValueUsd > 0 ? this.totalValueUsd : null;
    this.hwmCapturedAt = this.hwmValueUsd != null ? Date.now() : null;
    this._save();
    this.emit("changed"); // push updated pnl (now 0%) to SSE clients immediately
  }

  setLendState(s: {
    lentValueSol: number; lentValueUsd: number; lentBalanceUi: number; lendApy: number;
    earningsLifetimeUi: number; priceUsd: number;
  }) {
    this.lentValueSol = s.lentValueSol;
    this.lentValueUsd = s.lentValueUsd;
    this.lentBalanceUi = s.lentBalanceUi;
    this.lendApy = s.lendApy;
    this.lendEarningsLifetimeUi = s.earningsLifetimeUi;
    this.lendEarningsLifetimeUsd = s.earningsLifetimeUi * s.priceUsd;
    // First observation seeds the baseline so "this period" starts at 0 rather than counting
    // earnings that accrued before the feature existed.
    if (this.lendEarningsBaselineUi == null && s.earningsLifetimeUi > 0) {
      this.lendEarningsBaselineUi = s.earningsLifetimeUi;
      this.lendEarningsBaselineAt = Date.now();
      this._save();
    }
    const periodUi = Math.max(0, s.earningsLifetimeUi - (this.lendEarningsBaselineUi ?? s.earningsLifetimeUi));
    this.lendEarningsPeriodUsd = periodUi * s.priceUsd;
    // No emit here — setHoldings runs right after in the same refresh and broadcasts.
  }

  resetLendEarnings() {
    this.lendEarningsBaselineUi = this.lendEarningsLifetimeUi;
    this.lendEarningsBaselineAt = Date.now();
    this.lendEarningsPeriodUsd = 0;
    this._save();
    this.emit("changed");
  }

  updateHwm(valueUsd: number) {
    this.hwmValueUsd = valueUsd;
    this.hwmCapturedAt = Date.now();
    this._save();
  }

  recordRebalance() {
    this.lastRebalanceAt = Date.now();
    this._save(); // persist so interval-based rebalance survives restarts
  }
}

export const basketStore = new BasketStore();
