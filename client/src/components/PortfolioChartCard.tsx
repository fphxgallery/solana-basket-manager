import { Line } from "react-chartjs-2";
import type { ChartOptions, ChartData, Plugin } from "chart.js";
import type { ValuePoint, TradeRecord } from "../types.ts";
import { Card, CardLabel, rebalanceEvents } from "../lib.tsx";

type Win = "24h" | "7d" | "30d" | "90d";

export function PortfolioChartCard({
  valueHistory,
  valueWindow,
  setValueWindow,
  solUsd,
  trades,
}: {
  valueHistory: ValuePoint[];
  valueWindow: Win;
  setValueWindow: (w: Win) => void;
  solUsd: number;
  trades: TradeRecord[];
}) {
  // Fractional category indices (one per in-window rebalance event) for the
  // marker plugin. Filled alongside lineData so the two stay in sync.
  const markerIdx: number[] = [];

  const lineData: ChartData<"line"> | null = (() => {
    if (!valueHistory.length) return null;
    const windowMs = valueWindow === "90d" ? 90 * 864e5 : valueWindow === "30d" ? 30 * 864e5 : valueWindow === "7d" ? 7 * 864e5 : 864e5;
    const cutoff = Date.now() - windowMs;
    const filtered = valueHistory.filter((p) => p.ts >= cutoff);
    if (!filtered.length) return null;

    const step = valueWindow === "90d" ? 60 : valueWindow === "30d" ? 20 : valueWindow === "7d" ? 5 : 1;
    const points = step === 1 ? filtered : filtered.filter((_, i) => i % step === 0 || i === filtered.length - 1);

    // Map each rebalance event onto a fractional position across the plotted
    // points (evenly spaced on the category axis): find the surrounding samples
    // by timestamp and interpolate the index.
    const n = points.length;
    if (n > 1) {
      for (const ev of rebalanceEvents(trades)) {
        if (ev < points[0].ts || ev > points[n - 1].ts) continue;
        let i = 0;
        while (i < n - 1 && points[i + 1].ts <= ev) i++;
        if (i >= n - 1) { markerIdx.push(n - 1); continue; }
        const span = points[i + 1].ts - points[i].ts;
        markerIdx.push(span > 0 ? i + (ev - points[i].ts) / span : i);
      }
    }

    const labels = points.map((p) => {
      const d = new Date(p.ts);
      if (valueWindow === "90d" || valueWindow === "30d") return d.toLocaleDateString([], { month: "short", day: "numeric" });
      if (valueWindow === "7d") return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });

    // endpoint dot — only the last point gets a visible marker
    const last = points.length - 1;
    return {
      labels,
      datasets: [
        {
          label: "Portfolio (USD)",
          data: points.map((p) => p.valueUsd),
          borderColor: "#22d3ee",
          backgroundColor: (ctx) => {
            const { chart } = ctx;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return "rgba(34,211,238,0.12)";
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, "rgba(34,211,238,0.28)");
            g.addColorStop(1, "rgba(34,211,238,0.01)");
            return g;
          },
          borderWidth: 1.5,
          pointRadius: points.map((_, i) => (i === last ? 3.5 : points.length < 20 ? 2 : 0)),
          pointBackgroundColor: "#22d3ee",
          pointBorderColor: "#0b121c",
          pointBorderWidth: 1,
          pointHoverRadius: 4,
          fill: true,
          tension: 0.3,
        },
      ],
    };
  })();

  // Draws a faint vertical line at each rebalance event. Sits behind the line
  // (beforeDatasetsDraw) so the value curve stays on top.
  const rebalanceMarkers: Plugin<"line"> = {
    id: "rebalanceMarkers",
    beforeDatasetsDraw(chart) {
      if (!markerIdx.length) return;
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      if (!xScale || !chartArea) return;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(34,211,238,0.32)";
      ctx.setLineDash([3, 3]);
      for (const fi of markerIdx) {
        const lo = Math.floor(fi);
        const frac = fi - lo;
        const xLo = xScale.getPixelForValue(lo);
        const xHi = xScale.getPixelForValue(Math.min(lo + 1, xScale.max ?? lo));
        const x = xLo + (xHi - xLo) * frac;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      }
      ctx.restore();
    },
  };

  const lineOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => ` $${(ctx.parsed.y as number).toFixed(2)}` },
        backgroundColor: "#0b121c",
        borderColor: "#143040",
        borderWidth: 1,
        titleColor: "#eafbff",
        bodyColor: "#6b8ba0",
      },
    },
    scales: {
      x: {
        ticks: { color: "#4f7088", font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 },
        grid: { color: "rgba(20,48,64,0.5)" },
        border: { color: "#143040" },
      },
      y: {
        ticks: { color: "#4f7088", font: { size: 10 }, callback: (v) => `$${Number(v).toFixed(0)}` },
        grid: { color: "rgba(20,48,64,0.5)" },
        border: { color: "#143040" },
      },
    },
  };

  return (
    <Card className="p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <CardLabel>PORTFOLIO VALUE</CardLabel>
          <div className="flex items-center gap-1">
            {(["24h", "7d", "30d", "90d"] as const).map((w) => (
              <button
                key={w}
                onClick={() => setValueWindow(w)}
                className={`px-1.5 py-0.5 rounded text-[11px] transition-colors ${
                  valueWindow === w ? "bg-cyan text-[#04141a] font-medium" : "text-dim hover:text-muted"
                }`}
              >
                {w.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {markerIdx.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-dim">
              <span className="inline-block w-2.5 border-t border-dashed border-cyan/60" /> rebalance
            </span>
          )}
          {solUsd > 0 && (
            <span className="text-[11px] text-muted">SOL = <span className="text-ink">${solUsd.toFixed(2)}</span></span>
          )}
        </div>
      </div>
      {lineData ? (
        <div className="flex-1 min-h-0" style={{ minHeight: 180 }}>
          <Line data={lineData} options={lineOptions} plugins={[rebalanceMarkers]} />
        </div>
      ) : (
        <div className="flex items-center justify-center text-dim text-xs" style={{ minHeight: 180 }}>
          Collecting data…
        </div>
      )}
    </Card>
  );
}
