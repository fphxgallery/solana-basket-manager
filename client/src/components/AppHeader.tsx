import { Square, Play } from "lucide-react";
import { APP_VERSION } from "../lib.tsx";

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `up ${h}h ${m}m ${sec}s` : `up ${m}m ${sec}s`;
}

export function AppHeader({
  connected,
  running,
  error,
  uptime,
  ready,
  onToggle,
}: {
  connected: boolean;
  running: boolean;
  error: string | null;
  uptime: number | null;
  ready: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4 px-1 py-1">
      {/* identity — left */}
      <div className="flex items-center gap-2.5">
        <img src="/favicon.svg" className="w-5 h-5" alt="" />
        <span className="text-sm font-semibold tracking-wide text-ink">basket-manager</span>
        <span className="px-1.5 py-0.5 rounded text-[10px] leading-none text-cyan bg-cyan-bg border border-cyan-line">
          {APP_VERSION}
        </span>
      </div>

      {/* live state / control — right */}
      <div className="flex items-center gap-3">
        {!connected && <span className="text-[11px] text-dim animate-pulse">reconnecting…</span>}
        {error && (
          <span className="text-[11px] text-bad max-w-[200px] truncate" title={error}>{error}</span>
        )}
        {running && uptime != null && (
          <span className="text-[11px] text-muted">{fmtUptime(uptime)}</span>
        )}
        <span
          className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ${
            error
              ? "text-bad bg-[#2a0f12]"
              : running
              ? "text-good bg-[#0c241c]"
              : "text-dim bg-[#0e1822]"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${error ? "bg-bad" : running ? "bg-good animate-pulse" : "bg-dim"}`}
            style={running && !error ? { boxShadow: "0 0 7px var(--good)" } : undefined}
          />
          {error ? "Error" : running ? "Running" : "Stopped"}
        </span>
        <button
          onClick={onToggle}
          disabled={!ready}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 ${
            running
              ? "text-bad bg-[#2a0f12] hover:bg-[#3a1418] border border-[#4a1a20]"
              : "text-cyan bg-cyan-bg hover:bg-[#093341] border border-cyan-line"
          }`}
        >
          {running ? <><Square className="w-3 h-3 fill-current" /> Stop bot</> : <><Play className="w-3 h-3 fill-current" /> Start bot</>}
        </button>
      </div>
    </header>
  );
}
