import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import pkg from "../package.json";
import type { TradeRecord } from "./types.ts";

// Tracks client/package.json — bump the version there and the header pill follows.
export const APP_VERSION = `v${pkg.version}`;

export function formatSol(n: number) {
  return n.toFixed(4);
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export function truncate(s: string, n = 8) {
  return s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

// Confirmed swaps from one rebalance run land within a few seconds of each
// other. Collapse trades into events by clustering on a time gap so each run
// counts once (shared by the chart markers and the Metrics tab cadence).
export const CLUSTER_GAP_MS = 2 * 60_000;

export function rebalanceEvents(trades: TradeRecord[]): number[] {
  const ts = trades
    .filter((t) => t.status === "confirmed")
    .map((t) => t.timestamp)
    .sort((a, b) => a - b);
  const events: number[] = [];
  for (const t of ts) {
    if (!events.length || t - events[events.length - 1] > CLUSTER_GAP_MS) {
      events.push(t);
    }
  }
  return events;
}

// Strip the "REBALANCE: " prefix and split "FROM → TO" into its two legs.
function parseRoute(route: string): { from: string; to: string } {
  const body = route.replace(/^REBALANCE:\s*/, "");
  const [from = "", to = ""] = body.split("→").map((s) => s.trim());
  return { from, to };
}

export interface TradeMetrics {
  events: number;
  perWeek: number | null;
  confirmed: number;
  failed: number;
  fillRate: number | null;       // 0..1
  turnoverSol: number;           // Σ inputSol of confirmed swaps
  avgCostPct: number | null;     // mean costBps as %, over priced swaps
  pricedCount: number;
  costDragSol: number;           // Σ (costBps/1e4)·inputSol
  topFills: Array<{ route: string; costPct: number; sol: number; ts: number }>;
  cadence: { meanGapH: number; medianGapH: number; longestGapH: number } | null;
  churn: Array<{ symbol: string; sol: number }>;
  topRoutes: Array<{ route: string; sol: number; n: number }>;
  spanDays: number | null;
}

// Behavioral grade of the rebalancing actually executed — pure + testable.
// Grades the path taken (cost/cadence/churn), not a counterfactual band.
export function analyzeTrades(trades: TradeRecord[]): TradeMetrics {
  const confirmedTrades = trades.filter((t) => t.status === "confirmed");
  const failed = trades.filter((t) => t.status === "failed").length;
  const confirmed = confirmedTrades.length;
  const fillRate = confirmed + failed > 0 ? confirmed / (confirmed + failed) : null;

  const turnoverSol = confirmedTrades.reduce((s, t) => s + (t.inputSol || 0), 0);

  const priced = confirmedTrades.filter((t) => t.costBps != null);
  const pricedCount = priced.length;
  const avgCostPct = pricedCount > 0
    ? priced.reduce((s, t) => s + (t.costBps ?? 0), 0) / pricedCount / 100
    : null;
  const costDragSol = priced.reduce((s, t) => s + ((t.costBps ?? 0) / 1e4) * (t.inputSol || 0), 0);

  const topFills = [...priced]
    .map((t) => ({ route: parseRouteLabel(t.route), costPct: (t.costBps ?? 0) / 100, sol: ((t.costBps ?? 0) / 1e4) * (t.inputSol || 0), ts: t.timestamp }))
    .filter((f) => f.sol > 0)
    .sort((a, b) => b.sol - a.sol)
    .slice(0, 3);

  // Cadence from clustered events.
  const events = rebalanceEvents(trades);
  const gaps: number[] = [];
  for (let i = 1; i < events.length; i++) gaps.push(events[i] - events[i - 1]);
  const cadence = gaps.length
    ? {
        meanGapH: gaps.reduce((s, g) => s + g, 0) / gaps.length / 3.6e6,
        medianGapH: median(gaps) / 3.6e6,
        longestGapH: Math.max(...gaps) / 3.6e6,
      }
    : null;
  const spanDays = events.length > 1 ? (events[events.length - 1] - events[0]) / 864e5 : null;
  const perWeek = spanDays && spanDays > 0 ? events.length / (spanDays / 7) : null;

  // Churn — SOL value round-tripped per token (sold then re-bought, or v.v.).
  const sold: Record<string, number> = {};
  const bought: Record<string, number> = {};
  for (const t of confirmedTrades) {
    const { from, to } = parseRoute(t.route);
    const sol = t.inputSol || 0;
    if (from && from !== "SOL") sold[from] = (sold[from] ?? 0) + sol;
    if (to && to !== "SOL") bought[to] = (bought[to] ?? 0) + sol;
  }
  const churn = Object.keys({ ...sold, ...bought })
    .map((sym) => ({ symbol: sym, sol: Math.min(sold[sym] ?? 0, bought[sym] ?? 0) }))
    .filter((c) => c.sol > 0)
    .sort((a, b) => b.sol - a.sol)
    .slice(0, 3);

  // Routes by volume.
  const routeAgg: Record<string, { sol: number; n: number }> = {};
  for (const t of confirmedTrades) {
    const r = parseRouteLabel(t.route);
    routeAgg[r] = { sol: (routeAgg[r]?.sol ?? 0) + (t.inputSol || 0), n: (routeAgg[r]?.n ?? 0) + 1 };
  }
  const topRoutes = Object.entries(routeAgg)
    .map(([route, v]) => ({ route, sol: v.sol, n: v.n }))
    .sort((a, b) => b.sol - a.sol)
    .slice(0, 4);

  return {
    events: events.length, perWeek, confirmed, failed, fillRate,
    turnoverSol, avgCostPct, pricedCount, costDragSol, topFills,
    cadence, churn, topRoutes, spanDays,
  };
}

function parseRouteLabel(route: string): string {
  return route.replace(/^REBALANCE:\s*/, "");
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Donut keeps a rainbow categorical palette — the one intentionally non-cyan
// element (a cyan-mono donut would be unreadable).
export const CHART_COLORS = [
  "#c94040", "#d4704a", "#d49b4a", "#c9c44a", "#6abf69", "#4db6ac",
  "#42a5c4", "#4a7dc4", "#6a5cc4", "#a05cc4", "#c45ca0",
];

export function copyToClipboard(text: string): void {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => execCopy(text));
  } else {
    execCopy(text);
  }
}

function execCopy(text: string): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-dim hover:text-cyan transition-colors"
    >
      {copied ? <><Check className="w-3 h-3 text-good" /> copied</> : <><Copy className="w-3 h-3" /> copy</>}
    </button>
  );
}

/* Opaque cyber card — solid #0b121c fill, 1px #143040 border, 11px radius. */
export function Card({ className = "", children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={`bg-card border border-cardline rounded-card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] tracking-wide text-muted ${className}`}>{children}</div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-card border border-cardline rounded-card w-full shadow-2xl ${wide ? "max-w-xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
          <span className="text-sm font-semibold text-ink">{title}</span>
          <button onClick={onClose} aria-label="Close dialog" className="text-dim hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
