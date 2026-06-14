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

        <div className="mt-2 text-[30px] leading-none font-bold text-ink">
          {totalUsd != null ? `$${totalUsd.toFixed(0)}` : "—"}
        </div>

        {basket?.pnlUsd != null ? (
          <div className={`mt-1.5 text-sm font-semibold ${pnlUp ? "text-good" : "text-bad"}`}>
            {pnlUp ? "+" : "-"}${Math.abs(basket.pnlUsd).toFixed(2)}
            {basket.pnlPctUsd != null && (
              <span className="ml-1.5">({basket.pnlPctUsd >= 0 ? "+" : ""}{basket.pnlPctUsd.toFixed(2)}%)</span>
            )}
          </div>
        ) : (
          <div className="mt-1.5 text-sm text-dim">Collecting…</div>
        )}

        {/* HWM current ÷ peak bar */}
        {ratio != null && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] text-dim mb-1">
              <span>{peakUsd != null ? `All Time High $${peakUsd.toFixed(2)}` : ""}</span>
              <span>{(ratio * 100).toFixed(1)}% of ATH</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-[#0e1c28] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.min(ratio, 1) * 100}%`, background: "var(--cyan)" }}
              />
              {/* peak tick */}
              <div className="absolute inset-y-0 right-0 w-px bg-cyan/70" />
            </div>
          </div>
        )}

        {/* HWM decay progress bar */}
        {decayFrac != null && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] text-dim mb-1">
              <span>PEAK DECAY</span>
              <span className="text-warn">{decayLabel}</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-[#0e1c28] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${decayFrac * 100}%`, background: "var(--warn)" }}
              />
              {/* half-life marker */}
              <div className="absolute inset-y-0 right-0 w-px bg-warn/60" />
            </div>
          </div>
        )}

        {/* wallet balance tile — pinned bottom */}
        <div className="mt-auto pt-4">
          <div className="rounded-lg border border-cardline bg-[#0a1019] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-wide text-muted">WALLET BALANCE</span>
              <span className="text-sm text-ink">
                {walletBalanceSol != null ? `${formatSol(walletBalanceSol)} SOL` : "—"}
              </span>
            </div>
            {walletPublicKey && (
              <>
                <div className="my-2 h-px bg-divider" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-dim">{truncate(walletPublicKey, 10)}</span>
                  <CopyButton text={walletPublicKey} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* divider */}
      <div className="hidden md:block w-px bg-divider my-5" />
      <div className="md:hidden h-px bg-divider mx-5" />

      {/* RIGHT — distribution donut + legend */}
      <div className="flex-1 p-5">
        <CardLabel>DISTRIBUTION</CardLabel>
        {holdings.length ? (
          <div className="mt-3 flex items-center justify-center gap-8">
            <div className="relative flex-shrink-0" style={{ width: 196, height: 196 }}>
              {donutData && <Doughnut data={donutData} options={donutOptions} />}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-ink leading-none">{holdings.length}</span>
                <span className="text-dim mt-0.5" style={{ fontSize: 10 }}>TOKENS</span>
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
