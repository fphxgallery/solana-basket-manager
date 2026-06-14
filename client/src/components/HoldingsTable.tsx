import { AlertTriangle } from "lucide-react";
import type { BasketState } from "../types.ts";
import { formatSol, truncate, formatTime } from "../lib.tsx";

export function HoldingsTable({
  basket,
  basketError,
}: {
  basket: BasketState | null;
  basketError: string | null;
}) {
  const tokens = basket?.config.tokens ?? [];
  const threshold = basket?.config.driftThresholdPct ?? 5;
  const dynMint = basket?.config.dynamicWeightMint;
  const reserveMint = basket?.config.reserveMint;
  const floorPct = basket?.config.reserveFloorPct ?? 0;
  const totalWeight = tokens.reduce((s, t) => s + t.targetWeight, 0);

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
      {/* one-line holdings summary */}
      <div className="flex items-center flex-wrap gap-x-1 text-[10px] text-dim pb-3">
        <span className="text-[11px] tracking-wide text-muted">HOLDINGS</span>
        {basket?.totalValueSol ? <span>· ≈ {formatSol(basket.totalValueSol)} SOL total</span> : null}
        <span>· {basket?.lastRebalanceAt ? <>last {formatTime(basket.lastRebalanceAt)}</> : <>no rebalance yet</>}</span>
        {nextForced && <span>· next forced {nextForced}</span>}
      </div>

      <div>
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
                        <td className="text-right py-2 text-muted tabular-nums">{tgt.toFixed(1)}%</td>
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
