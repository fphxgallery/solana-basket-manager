import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import pkg from "../package.json";

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

// Donut keeps a rainbow categorical palette — the one intentionally non-cyan
// element (a cyan-mono donut would be unreadable).
export const CHART_COLORS = [
  "#22d3ee", "#34d399", "#a78bfa", "#f59e0b", "#f472b6",
  "#60a5fa", "#fb7185", "#4ade80", "#facc15", "#c084fc",
  "#2dd4bf", "#fb923c", "#818cf8", "#e879f9", "#38bdf8",
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
