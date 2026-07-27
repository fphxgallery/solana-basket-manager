import { Doughnut } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import type { BasketState } from "../types.ts";
import { Card, CardLabel, CHART_COLORS, formatSol, truncate, CopyButton } from "../lib.tsx";

export function HeroCard({
  basket,
  walletBalanceSol,
  walletPublicKey,
  solUsd,
  onResetBaseline,
}: {
  basket: BasketState | null;
  walletBalanceSol: number | null;
  walletPublicKey: string | null;
  solUsd: number;
  onResetBaseline: () => void;
}) {
  const holdings = basket?.holdings ?? [];

  const donutData = holdings.length
    ? {
        labels: holdings.map((h) => h.symbol),
        datasets: [
          {
            data: holdings.map((h) => h.valueSol),
            backgroundColor: CHART_COLORS.slice(0, holdings.length),
            borderColor: "#0b121c",
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      }
    : null;

  const donutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed as number;
            const usd = solUsd > 0 ? ` ($${(val * solUsd).toFixed(2)})` : "";
            return ` ${val.toFixed(4)} SOL${usd}`;
          },
        },
        backgroundColor: "#0b121c",
        borderColor: "#143040",
        borderWidth: 1,
        titleColor: "#eafbff",
        bodyColor: "#6b8ba0",
      },
    },
  };

  // HWM decay countdown
  let decayLabel: string | null = null;
  let decayFrac: number | null = null;
  let peakUsd: number | null = null;
  if (basket?.config.hwmEnabled && basket.hwmValueUsd != null && basket.hwmCapturedAt != null) {
    peakUsd = basket.hwmValueUsd;
    const elapsedDays = (Date.now() - basket.hwmCapturedAt) / 86_400_000;
    const halfLife = basket.config.hwmHalfLifeDays ?? 7;
    const toHalf = halfLife - elapsedDays;
    decayFrac = Math.max(0, Math.min(elapsedDays / halfLife, 1));
    decayLabel = toHalf > 0
      ? (toHalf >= 1 ? `${toHalf.toFixed(1)}d` : `${(toHalf * 24).toFixed(0)}h`) + " to ½"
      : "past ½-life";
  }

  const totalUsd = basket?.totalValueUsd ?? (basket && solUsd > 0 ? basket.totalValueSol * solUsd : null);
  const ratio = peakUsd != null && peakUsd > 0 && totalUsd != null ? totalUsd / peakUsd : null;
  const pnlUp = (basket?.pnlUsd ?? 0) >= 0;

  return (
    <Card className="flex flex-col md:flex-row">
      {/* LEFT — merged P&L + wallet tile */}
      <div className="flex-1 p-5 flex flex-col">
        <div className="flex items-center justify-between">
          <CardLabel>
            PORTFOLIO
            {basket?.baselineTimestamp && (
              <span className="text-dim"> · since {new Date(basket.baselineTimestamp).toLocaleDateString()}</span>
            )}
          </CardLabel>
          {basket?.baselineTimestamp && (
            <button
              onClick={onResetBaseline}
              className="text-[11px] text-dim hover:text-cyan transition-colors px-1.5 py-0.5 rounded border border-cardline hover:border-cyan-line"
            >
              reset
            </button>
          )}
        </div>

        {/* big value on the left, stat list on the right */}
        <div className="mt-4 grid grid-cols-[1.1fr_1fr] gap-5">
          <div>
            <div className="text-[40px] leading-none font-bold text-ink">
              {totalUsd != null ? `$${totalUsd.toFixed(0)}` : "—"}
            </div>
            {basket?.pnlUsd != null ? (
              <div className="mt-3">
                <div className={`text-[17px] font-semibold ${pnlUp ? "text-good" : "text-bad"}`}>
                  {pnlUp ? "+" : "-"}${Math.abs(basket.pnlUsd).toFixed(2)}
                </div>
                {basket.pnlPctUsd != null && (
                  <div className={`text-[13px] mt-0.5 ${pnlUp ? "text-good/80" : "text-bad/80"}`}>
                    {basket.pnlPctUsd >= 0 ? "+" : ""}{basket.pnlPctUsd.toFixed(2)}%
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 text-base text-dim">Collecting…</div>
            )}
          </div>

          {/* stat list */}
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-dim">Wallet</span>
              <span className="text-ink tabular-nums">{walletBalanceSol != null ? `${formatSol(walletBalanceSol)} SOL` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dim">In SOL</span>
              <span className="text-ink tabular-nums">{basket ? `${basket.totalValueSol.toFixed(2)} SOL` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dim">P&amp;L (SOL)</span>
              <span className={`tabular-nums ${(basket?.pnlSol ?? 0) >= 0 ? "text-good" : "text-bad"}`}>
                {basket?.pnlSol != null ? `${basket.pnlSol >= 0 ? "+" : ""}${basket.pnlSol.toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dim">Lent · APY</span>
              <span className="text-ink tabular-nums">
                {basket?.config.lendEnabled && (basket?.lentValueUsd ?? 0) > 0
                  ? `$${basket.lentValueUsd.toFixed(0)} · ${(basket.lendApy ?? 0).toFixed(1)}%`
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dim">SOL price</span>
              <span className="text-ink tabular-nums">{solUsd > 0 ? `$${solUsd.toFixed(2)}` : "—"}</span>
            </div>
            {walletPublicKey && (
              <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-divider">
                <span className="text-[11px] text-dim">{truncate(walletPublicKey, 6)}</span>
                <CopyButton text={walletPublicKey} />
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto" />

        {/* HWM meters — ATH ratio + peak decay, side by side, below the stat tiles */}
        {(ratio != null || decayFrac != null) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ratio != null && (
              <div>
                <div className="flex items-center justify-between text-xs text-dim mb-1.5">
                  <span>{peakUsd != null ? `ATH $${peakUsd.toFixed(2)}` : ""}</span>
                  <span>{(ratio * 100).toFixed(1)}%</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-[#0e1c28] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.min(ratio, 1) * 100}%`,
                      backgroundImage: "linear-gradient(90deg, #f87171, #fbbf24 55%, #34d399)",
                      backgroundSize: `${100 / Math.max(Math.min(ratio, 1) * 100, 0.01) * 100}% 100%`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                  <div className="absolute inset-y-0 right-0 w-px bg-cyan/70" />
                </div>
              </div>
            )}
            {decayFrac != null && (
              <div>
                <div className="flex items-center justify-between text-xs text-dim mb-1.5">
                  <span>PEAK DECAY</span>
                  <span className="text-warn">{decayLabel}</span>
                </div>
                <div className="relative h-1.5 rounded-full bg-[#0e1c28] overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${decayFrac * 100}%`,
                      backgroundImage: "linear-gradient(90deg, #34d399, #fbbf24 55%, #f87171)",
                      backgroundSize: `${100 / Math.max(decayFrac * 100, 0.01) * 100}% 100%`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                  <div className="absolute inset-y-0 right-0 w-px bg-warn/60" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* divider */}
      <div className="hidden md:block w-px bg-divider my-5" />
      <div className="md:hidden h-px bg-divider mx-5" />

      {/* RIGHT — distribution donut + legend. Label is absolutely placed so the
          legend can top-align level with it while the donut stays centered. */}
      <div className="flex-1 p-5 relative">
        <CardLabel className="absolute top-5 left-5">DISTRIBUTION</CardLabel>
        {holdings.length ? (
          <div className="flex items-stretch justify-center gap-8">
            <div className="flex-1 flex items-center justify-center">
              <div className="relative flex-shrink-0" style={{ width: 196, height: 196 }}>
                {donutData && <Doughnut data={donutData} options={donutOptions} />}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-ink leading-none">{holdings.length}</span>
                  <span className="text-dim mt-0.5" style={{ fontSize: 10 }}>TOKENS</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              {holdings.map((h, i) => (
                <div key={h.mint} className="flex items-center justify-end gap-2">
                  <span className="text-[11px] text-muted text-right tabular-nums" style={{ width: 44 }}>
                    {h.currentWeight.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-ink text-right truncate" style={{ width: 50 }}>{h.symbol}</span>
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 h-[132px] flex items-center justify-center text-dim text-xs">No holdings yet</div>
        )}
      </div>
    </Card>
  );
}
