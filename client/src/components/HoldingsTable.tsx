import { RefreshCw, Pencil, AlertTriangle, X } from "lucide-react";
import type { BasketState, AppState } from "../types.ts";
import { formatSol, truncate, formatTime } from "../lib.tsx";

export function HoldingsTable({
  basket,
  state,
  rebalancing,
  rebalanceMsg,
  basketError,
  onRebalance,
  onEdit,
  onUpdateWeight,
  onRemoveToken,
}: {
  basket: BasketState | null;
  state: AppState | null;
  rebalancing: boolean;
  rebalanceMsg: { ok: boolean; text: string } | null;
  basketError: string | null;
  onRebalance: () => void;
  onEdit: () => void;
  onUpdateWeight: (mint: string, weight: number) => void;
  onRemoveToken: (mint: string) => void;
}) {
  const tokens = basket?.config.tokens ?? [];
  const threshold = basket?.config.driftThresholdPct ?? 5;
  const dynMint = basket?.config.dynamicWeightMint;
  const reserveMint = basket?.config.reserveMint;
  const floorPct = basket?.config.reserveFloorPct ?? 0;
  const totalWeight = tokens.reduce((s, t) => s + t.targetWeight, 0);
  const running = !!state?.botState.running;

  // shared bar scale so per-token allocation bars are comparable
  const maxW = Math.max(
    1,
    ...tokens.flatMap((t) => {
      const h = basket?.holdings.find((hh) => hh.mint === t.mint);
      return [t.targetWeight, h?.currentWeight ?? 0];
    }),
    reserveMint ? floorPct : 0,
  );

  // next forced rebalance = last + interval
  let nextForced: string | null = null;
  if (basket?.lastRebalanceAt && basket.config.rebalanceIntervalHours) {
    const next = basket.lastRebalanceAt + basket.config.rebalanceIntervalHours * 3600_000;
    nextForced = formatTime(next);
  }

  return (
    <div className="p-4">
      {/* ── action strip — bounded band, hairline divider below ── */}
      <div className="flex items-start justify-between pb-3.5 border-b border-divider">
        <div className="min-w-0">
          <div className="text-[11px] tracking-wide text-muted">
            HOLDINGS
            {basket?.totalValueSol ? (
              <span className="text-dim"> · ≈ {formatSol(basket.totalValueSol)} SOL total</span>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] text-dim">
            {basket?.lastRebalanceAt ? <>last {formatTime(basket.lastRebalanceAt)}</> : <>no rebalance yet</>}
            {nextForced && <> · next forced {nextForced}</>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rebalanceMsg && (
            <span className={`text-[10.5px] ${rebalanceMsg.ok ? "text-good" : "text-bad"}`}>{rebalanceMsg.text}</span>
          )}
          <button
            onClick={onRebalance}
            disabled={rebalancing || !running}
            title={!running ? "Start the bot first" : "Force rebalance now"}
            className="flex items-center gap-1.5 text-[10.5px] text-muted hover:text-cyan border border-cardline hover:border-cyan-line rounded-md transition-colors disabled:opacity-40"
            style={{ padding: "5px 9px" }}
          >
            <RefreshCw className={rebalancing ? "animate-spin" : ""} style={{ width: 13, height: 13 }} />
            {rebalancing ? "Rebalancing…" : "Rebalance"}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 text-[10.5px] text-muted hover:text-cyan border border-cardline hover:border-cyan-line rounded-md transition-colors"
            style={{ padding: "5px 9px" }}
          >
            <Pencil style={{ width: 13, height: 13 }} /> Edit basket
          </button>
        </div>
      </div>

      <div className="pt-3.5">
        {!tokens.length ? (
          <div className="py-8 text-center text-dim text-sm">No tokens configured — add one to start</div>
        ) : (
          <>
            {Math.abs(totalWeight - 100) > 0.01 && (
              <div className="mb-2 flex items-center gap-1.5 text-[11px] text-warn">
                <AlertTriangle className="w-3 h-3" />
                Weights sum to {totalWeight.toFixed(1)}% — must equal 100%
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-dim border-b border-divider">
                    <th className="text-left pb-2 font-normal">Token</th>
                    <th className="text-right pb-2 font-normal">Balance</th>
                    <th className="text-right pb-2 font-normal">Value</th>
                    <th className="text-right pb-2 font-normal">Current %</th>
                    <th className="text-right pb-2 font-normal">Target %</th>
                    <th className="text-right pb-2 font-normal">Drift</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {tokens.map((token) => {
                    const h = basket?.holdings.find((hh) => hh.mint === token.mint);
                    const drift = h?.driftPct ?? 0;
                    const cur = h?.currentWeight ?? 0;
                    const tgt = h?.targetWeight ?? token.targetWeight;
                    const inBand = Math.abs(drift) < threshold;
                    const isDyn = !!dynMint && token.mint === dynMint;
                    const isReserve = !!reserveMint && token.mint === reserveMint;
                    return (
                      <tr key={token.mint} className="hover:bg-white/[0.02]">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-ink">{token.symbol}</span>
                            {isDyn && (
                              <span className="px-1 py-px rounded text-[8.5px] leading-none text-cyan bg-cyan-bg border border-cyan-line">DYNAMIC</span>
                            )}
                            {isReserve && (
                              <span className="px-1 py-px rounded text-[8.5px] leading-none text-warn bg-[#2a2208] border border-[#5a4a12]">RESERVE</span>
                            )}
                          </div>
                          <div className="text-dim">{truncate(token.mint, 4)}</div>
                          {/* allocation mini-bar: fill = current, tick = target, amber tick = reserve floor */}
                          <div className="relative mt-1 h-1 rounded-full bg-[#0e1c28] overflow-hidden" style={{ width: 96 }}>
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{ width: `${(cur / maxW) * 100}%`, background: isDyn ? "var(--cyan)" : inBand ? "var(--good)" : "var(--warn)" }}
                            />
                            {/* target tick */}
                            <div className="absolute inset-y-0 w-px bg-ink/60" style={{ left: `${(tgt / maxW) * 100}%` }} />
                            {/* reserve floor marker */}
                            {isReserve && floorPct > 0 && (
                              <div className="absolute inset-y-0 w-px bg-warn" style={{ left: `${(floorPct / maxW) * 100}%` }} />
                            )}
                          </div>
                        </td>
                        <td className="text-right py-2 text-muted tabular-nums">{h ? h.balance.toFixed(4) : "—"}</td>
                        <td className="text-right py-2 text-muted tabular-nums">{h ? formatSol(h.valueSol) : "—"}</td>
                        <td className="text-right py-2 text-muted tabular-nums">{h ? cur.toFixed(1) + "%" : "—"}</td>
                        <td className="text-right py-2">
                          <input
                            type="number" min="0" max="100" step="1"
                            key={`${token.mint}-${tgt.toFixed(1)}`}
                            defaultValue={tgt.toFixed(1)}
                            onBlur={(e) => onUpdateWeight(token.mint, parseFloat(e.target.value))}
                            className="w-16 bg-[#0a1019] border border-cardline rounded px-1.5 py-0.5 text-right text-ink focus:outline-none focus:border-cyan-line tabular-nums"
                          />
                        </td>
                        <td className="text-right py-2">
                          {h ? (
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums ${
                                inBand ? "text-good bg-[#0c241c]" : "text-warn bg-[#241d08]"
                              }`}
                            >
                              {drift >= 0 ? "+" : ""}{drift.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="text-right py-2 pl-2">
                          <button onClick={() => onRemoveToken(token.mint)} className="text-dim hover:text-bad transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {basketError && <p className="mt-2 text-[11px] text-bad">{basketError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
