import type { TradeRecord } from "../types.ts";
import { analyzeTrades, formatTime } from "../lib.tsx";

// Behavioral rebalance-quality report. Pure client-side over state.trades —
// no new endpoint. Grades the path actually taken (cost / cadence / churn),
// not a counterfactual band sweep.
export function MetricsTab({ trades }: { trades: TradeRecord[] }) {
  const m = analyzeTrades(trades);

  if (m.confirmed === 0 && m.failed === 0) {
    return (
      <div className="px-4 py-12 text-center text-dim text-sm">
        No rebalances yet — metrics populate once the bot executes swaps
      </div>
    );
  }

  const fmtGap = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h`);

  return (
    <div className="p-4 space-y-4">
      {/* Top metric tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tile
          label="Avg cost"
          value={m.avgCostPct != null ? `${m.avgCostPct.toFixed(2)}%` : "—"}
          sub={m.pricedCount > 0 ? `${m.pricedCount} priced swaps` : "no priced swaps"}
          tone={m.avgCostPct != null && m.avgCostPct >= 1 ? "warn" : "default"}
        />
        <Tile
          label="Fill rate"
          value={m.fillRate != null ? `${(m.fillRate * 100).toFixed(0)}%` : "—"}
          sub={`${m.confirmed} ok · ${m.failed} failed`}
          tone={m.fillRate != null && m.fillRate < 0.9 ? "warn" : "good"}
        />
        <Tile
          label="Rebalances"
          value={`${m.events}`}
          sub={m.perWeek != null ? `${m.perWeek.toFixed(1)} / week` : "—"}
        />
        <Tile
          label="Turnover"
          value={`${m.turnoverSol.toFixed(3)}`}
          sub="SOL swapped"
        />
      </div>

      {/* Cost drag — the actionable bit */}
      <Section title="Cost drag" right={`${m.costDragSol.toFixed(4)} SOL lost to price impact`}>
        {m.topFills.length === 0 ? (
          <div className="text-[11px] text-dim py-1">No priced swaps with measurable impact yet.</div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[10px] text-dim uppercase tracking-wide">Most expensive fills</div>
            {m.topFills.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-ink">{f.route}</span>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-dim">{formatTime(f.ts)}</span>
                  <span className={f.costPct >= 1 ? "text-warn" : "text-muted"}>{f.costPct.toFixed(2)}%</span>
                  <span className="text-bad w-20 text-right">−{f.sol.toFixed(4)} SOL</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Behavior — cadence + churn + routes */}
      <Section title="Behavior">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {/* Cadence */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-dim uppercase tracking-wide">Cadence</div>
            {m.cadence ? (
              <div className="space-y-1 text-[11px] tabular-nums">
                <Row k="Mean gap" v={fmtGap(m.cadence.meanGapH)} />
                <Row k="Median gap" v={fmtGap(m.cadence.medianGapH)} />
                <Row k="Longest gap" v={fmtGap(m.cadence.longestGapH)} />
                {m.spanDays != null && <Row k="Span" v={`${m.spanDays.toFixed(1)}d`} />}
              </div>
            ) : (
              <div className="text-[11px] text-dim">Need ≥2 rebalances for cadence.</div>
            )}
          </div>

          {/* Churn */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-dim uppercase tracking-wide">Churn (round-tripped)</div>
            {m.churn.length ? (
              <div className="space-y-1 text-[11px] tabular-nums">
                {m.churn.map((c) => (
                  <Row key={c.symbol} k={c.symbol} v={`${c.sol.toFixed(4)} SOL`} vClass="text-warn" />
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-dim">No tokens both bought and sold.</div>
            )}
          </div>
        </div>

        {/* Top routes by volume */}
        {m.topRoutes.length > 0 && (
          <div className="space-y-1.5 mt-3 pt-3 border-t border-divider">
            <div className="text-[10px] text-dim uppercase tracking-wide">Top routes by volume</div>
            {m.topRoutes.map((r) => (
              <div key={r.route} className="flex items-center justify-between text-[11px] tabular-nums">
                <span className="text-ink">{r.route}</span>
                <span className="text-dim">{r.sol.toFixed(3)} SOL · {r.n}×</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="text-[10px] text-dim leading-relaxed">
        Grades the path taken, not a better band. Cost metrics cover priced swaps only (pre-v3.2.0 fills lack
        impact data); the trade log keeps a recent window (last 100), so totals are over that window.
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warn" }) {
  const valClass = tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="bg-white/[0.02] border border-cardline rounded-md px-3 py-2.5">
      <div className="text-[10px] text-muted tracking-wide">{label}</div>
      <div className={`text-[19px] leading-tight font-semibold tabular-nums ${valClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-dim tabular-nums">{sub}</div>}
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div className="border border-cardline rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-muted tracking-wide uppercase">{title}</span>
        {right && <span className="text-[10px] text-dim tabular-nums">{right}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, vClass = "text-ink" }: { k: string; v: string; vClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-dim">{k}</span>
      <span className={vClass}>{v}</span>
    </div>
  );
}
