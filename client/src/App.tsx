import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Check,
  CircleDollarSign,
  Copy,
  Cpu,
  Download,
  KeyRound,
  Layers,
  RefreshCw,
  Plus,
  Square,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";
import type { AppState, TradeRecord, BasketState, BasketToken, ValuePoint } from "./types.ts";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
);

const SOLSCAN_TX = "https://solscan.io/tx/";

function formatSol(n: number) {
  return n.toFixed(4);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function truncate(s: string, n = 8) {
  return s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

function StatusBadge({ running, error }: { running: boolean; error: string | null }) {
  if (error) return (
    <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 text-red-400 text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      Error
    </span>
  );
  if (running) return (
    <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Running
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-700/50 text-gray-400 text-xs font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
      Stopped
    </span>
  );
}

function TradeStatusBadge({ status }: { status: TradeRecord["status"] }) {
  if (status === "confirmed") return (
    <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">confirmed</span>
  );
  if (status === "failed") return (
    <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/10 text-red-400">failed</span>
  );
  return (
    <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-400 animate-pulse">pending</span>
  );
}

interface SpreadResult {
  profitBps: number;
  routeLabels: string[];
  dexLabels: string[];
  inputSol: number;
  outputSol: number;
}

type WalletModal =
  | { type: "import" }
  | { type: "confirm"; action: "create" | "import"; secretKey?: string }
  | { type: "backup"; publicKey: string; secretKey: string }
  | null;

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-gray-900 border border-gray-700 rounded-xl w-full shadow-2xl ${wide ? "max-w-xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <span className="text-sm font-semibold text-white">{title}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function copyToClipboard(text: string): void {
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-400 transition-colors"
    >
      {copied ? <><Check className="w-3 h-3 text-emerald-400" /> copied</> : <><Copy className="w-3 h-3" /> copy</>}
    </button>
  );
}

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      if (res.ok) onSuccess();
      else setError("Invalid token");
    } catch {
      setError("Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">ARB AGENT — sign in</span>
        </div>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="API token"
          autoFocus
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 mb-3"
        />
        {error && <div className="text-xs text-red-400 mb-3">{error}</div>}
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
        <p className="text-xs text-gray-500 mt-3">Token is the API_TOKEN value from the server .env file.</p>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Dashboard />;
}

function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(false);
  const [arbAmountInput, setArbAmountInput] = useState("");
  const [minProfitInput, setMinProfitInput] = useState("");
  const [tokenMintInput, setTokenMintInput] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [walletModal, setWalletModal] = useState<WalletModal>(null);
  const [importKeyInput, setImportKeyInput] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletWorking, setWalletWorking] = useState(false);
  const [spread, setSpread] = useState<SpreadResult | null>(null);
  const [spreadUpdatedAt, setSpreadUpdatedAt] = useState<number | null>(null);
  const [basket, setBasket] = useState<BasketState | null>(null);
  const [rightTab, setRightTab] = useState<"trades" | "basket">("trades");
  const [basketEditorOpen, setBasketEditorOpen] = useState(false);
  const [editorTokens, setEditorTokens] = useState<BasketToken[]>([]);
  const [editorMint, setEditorMint] = useState("");
  const [editorSymbol, setEditorSymbol] = useState("");
  const [editorWeight, setEditorWeight] = useState("");
  const [editorLookingUp, setEditorLookingUp] = useState(false);
  const [editorLookupMsg, setEditorLookupMsg] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceMsg, setRebalanceMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([]);
  const [solUsd, setSolUsd] = useState<number>(0);
  const esRef = useRef<EventSource | null>(null);

  // Basket fetch on load
  useEffect(() => {
    fetch("/api/basket")
      .then((r) => r.json() as Promise<BasketState>)
      .then(setBasket)
      .catch(() => {});
  }, []);

  // Value history — poll every 3 minutes (matches server refresh cadence)
  useEffect(() => {
    function fetchHistory() {
      fetch("/api/basket/value-history")
        .then((r) => r.json() as Promise<{ points: ValuePoint[]; solUsd: number }>)
        .then((d) => { setValueHistory(d.points); if (d.solUsd > 0) setSolUsd(d.solUsd); })
        .catch(() => {});
    }
    fetchHistory();
    const t = setInterval(fetchHistory, 3 * 60_000);
    return () => clearInterval(t);
  }, []);

  // Basket helpers
  const totalConfiguredWeight = basket?.config.tokens.reduce((s, t) => s + t.targetWeight, 0) ?? 0;
  const editorTotal = editorTokens.reduce((s, t) => s + t.targetWeight, 0);

  function openBasketEditor() {
    setEditorTokens(basket?.config.tokens ? [...basket.config.tokens] : []);
    setEditorMint(""); setEditorSymbol(""); setEditorWeight("");
    setEditorLookupMsg(null); setBasketError(null);
    setBasketEditorOpen(true);
  }

  async function editorLookupMint() {
    if (!editorMint.trim()) return;
    setEditorLookingUp(true);
    setEditorLookupMsg(null);
    try {
      const r = await fetch(`/api/basket/token-info/${editorMint.trim()}`);
      const d = await r.json() as { symbol: string | null };
      if (d.symbol) { setEditorSymbol(d.symbol); setEditorLookupMsg(null); }
      else setEditorLookupMsg("Not found — enter symbol manually");
    } catch {
      setEditorLookupMsg("Lookup failed — enter symbol manually");
    } finally {
      setEditorLookingUp(false);
    }
  }

  function editorAddRow() {
    if (!editorMint.trim() || !editorSymbol.trim() || !editorWeight) { setBasketError("Fill all fields"); return; }
    const w = parseFloat(editorWeight);
    if (isNaN(w) || w <= 0) { setBasketError("Invalid weight"); return; }
    if (editorTokens.some((t) => t.mint === editorMint.trim())) { setBasketError("Token already in list"); return; }
    setEditorTokens((prev) => [...prev, { mint: editorMint.trim(), symbol: editorSymbol.trim(), targetWeight: w }]);
    setEditorMint(""); setEditorSymbol(""); setEditorWeight(""); setBasketError(null); setEditorLookupMsg(null);
  }

  async function saveBasket() {
    if (Math.abs(editorTotal - 100) > 0.01) { setBasketError(`Weights sum to ${editorTotal.toFixed(1)}% — must equal 100%`); return; }
    setEditorSaving(true);
    try {
      const res = await fetch("/api/basket/tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: editorTokens }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setBasketError(d.error ?? "Failed"); return; }
      setBasketEditorOpen(false);
    } finally {
      setEditorSaving(false);
    }
  }

  async function removeToken(mint: string) {
    const newTokens = (basket?.config.tokens ?? []).filter((t) => t.mint !== mint);
    await fetch("/api/basket/tokens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: newTokens }),
    });
  }

  async function updateWeight(mint: string, weight: number) {
    const newTokens = (basket?.config.tokens ?? []).map((t) =>
      t.mint === mint ? { ...t, targetWeight: weight } : t,
    );
    const res = await fetch("/api/basket/tokens", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: newTokens }),
    });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      setBasketError(d.error ?? "Failed");
    } else {
      setBasketError(null);
    }
  }

  async function saveBasketSettings(patch: { driftThresholdPct?: number; rebalanceIntervalHours?: number; arbSizingPct?: number }) {
    await fetch("/api/basket/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function triggerRebalance() {
    setRebalancing(true);
    setRebalanceMsg(null);
    try {
      const res = await fetch("/api/basket/rebalance", { method: "POST" });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (res.ok) {
        setRebalanceMsg({ ok: true, text: "Rebalance complete" });
      } else {
        setRebalanceMsg({ ok: false, text: d.error ?? "Rebalance failed" });
      }
    } catch {
      setRebalanceMsg({ ok: false, text: "Request failed" });
    } finally {
      setRebalancing(false);
      setTimeout(() => setRebalanceMsg(null), 5000);
    }
  }

  // Spread polling
  useEffect(() => {
    function fetchSpread() {
      fetch("/api/spread")
        .then((r) => r.ok ? r.json() as Promise<SpreadResult> : Promise.reject())
        .then((d) => { setSpread(d); setSpreadUpdatedAt(Date.now()); })
        .catch(() => {});
    }
    fetchSpread();
    const t = setInterval(fetchSpread, 20_000);
    return () => clearInterval(t);
  }, []);

  // Fetch wallet on load
  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json() as Promise<{ publicKey: string | null }>)
      .then((d) => setWalletPublicKey(d.publicKey))
      .catch(() => {});
  }, []);

  async function handleWalletCreate(force = false) {
    setWalletWorking(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/wallet/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json() as { error?: string; publicKey?: string; secretKey?: string };
      if (res.status === 409) {
        setWalletModal({ type: "confirm", action: "create" });
        return;
      }
      if (!res.ok) { setWalletError(data.error ?? "Failed"); return; }
      setWalletPublicKey(data.publicKey!);
      setWalletModal({ type: "backup", publicKey: data.publicKey!, secretKey: data.secretKey! });
    } finally {
      setWalletWorking(false);
    }
  }

  async function handleWalletImport(force = false) {
    if (!importKeyInput.trim()) { setWalletError("Paste your base58 secret key"); return; }
    setWalletWorking(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/wallet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretKey: importKeyInput.trim(), force }),
      });
      const data = await res.json() as { error?: string; publicKey?: string };
      if (res.status === 409) {
        setWalletModal({ type: "confirm", action: "import", secretKey: importKeyInput.trim() });
        return;
      }
      if (!res.ok) { setWalletError(data.error === "invalid_key" ? "Invalid key — check it and try again" : (data.error ?? "Failed")); return; }
      setWalletPublicKey(data.publicKey!);
      setImportKeyInput("");
      setWalletModal(null);
    } finally {
      setWalletWorking(false);
    }
  }

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/events");
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        const { type, data } = JSON.parse(e.data) as { type: string; data: unknown };

        if (type === "basket") {
          setBasket((prev) => {
            const incoming = data as BasketState;
            if (!prev) return incoming;
            // Preserve pnl fields if incoming has nulls (transient CoinGecko/pricing failure)
            return {
              ...incoming,
              pnlUsd: incoming.pnlUsd ?? prev.pnlUsd,
              pnlPctUsd: incoming.pnlPctUsd ?? prev.pnlPctUsd,
              pnlSol: incoming.pnlSol ?? prev.pnlSol,
              pnlPct: incoming.pnlPct ?? prev.pnlPct,
            };
          });
          return;
        }

        if (type === "snapshot") {
          const snap = data as AppState;
          setState(snap);
          setArbAmountInput(String(snap.config?.arbAmountSol ?? "0.1"));
          setMinProfitInput(String(snap.config?.minProfitBps ?? "500"));
          setTokenMintInput(snap.config?.tokenMint ?? "");
          return;
        }

        setState((prev) => {
          if (!prev) return prev;
          if (type === "trade") {
            const trade = data as TradeRecord;
            const exists = prev.trades.find((t) => t.id === trade.id);
            const trades = exists
              ? prev.trades.map((t) => (t.id === trade.id ? trade : t))
              : [trade, ...prev.trades.slice(0, 99)];
            const totalTrades = trades.filter((t) => t.status === "confirmed").length;
            const totalProfitSol = trades
              .filter((t) => t.status === "confirmed")
              .reduce((s, t) => s + t.profitSol, 0);
            return { ...prev, trades, totalTrades, totalProfitSol };
          }
          if (type === "status") return { ...prev, botState: data as AppState["botState"] };
          if (type === "balance") return { ...prev, walletBalanceSol: data as number };
          return prev;
        });
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => esRef.current?.close();
  }, []);

  async function toggleBot() {
    if (!state) return;
    const action = state.botState.running ? "stop" : "start";
    await fetch(`/api/${action}`, { method: "POST" });
  }

  async function saveConfig() {
    setConfigSaving(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arbAmountSol: parseFloat(arbAmountInput),
          minProfitBps: parseInt(minProfitInput),
          tokenMint: tokenMintInput.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setConfigError(err.error ?? "Save failed");
        return;
      }
      const updated = await res.json() as { arbAmountSol: number; minProfitBps: number; tokenMint: string };
      setState((prev) =>
        prev ? { ...prev, config: { ...prev.config, ...updated } } : prev,
      );
      setTokenMintInput(updated.tokenMint);
    } finally {
      setConfigSaving(false);
    }
  }

  const uptime = state?.botState.startedAt
    ? Math.floor((Date.now() - state.botState.startedAt) / 1000)
    : null;

  // ── Chart palette — violet-anchored, evenly distributed ──────────────────────
  const CHART_COLORS = [
    "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4", "#10b981",
    "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#ec4899",
    "#a78bfa", "#818cf8", "#60a5fa", "#22d3ee", "#34d399",
  ];

  // ── Donut chart data (token distribution by current SOL value) ───────────────
  const donutData = (() => {
    if (!basket?.holdings.length) return null;
    const labels = basket.holdings.map((h) => h.symbol);
    const values = basket.holdings.map((h) => h.valueSol);
    return {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: "rgb(3 7 18)", // gray-950
        borderWidth: 2,
        hoverOffset: 6,
      }],
    };
  })();

  const donutOptions: ChartOptions<"doughnut"> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "65%",
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
        backgroundColor: "rgb(17 24 39)",
        borderColor: "rgb(55 65 81)",
        borderWidth: 1,
        titleColor: "rgb(209 213 219)",
        bodyColor: "rgb(156 163 175)",
      },
    },
  };

  // ── Line chart data (24h portfolio value in USD) ──────────────────────────────
  const lineData = (() => {
    if (!valueHistory.length) return null;
    return {
      labels: valueHistory.map((p) => {
        const d = new Date(p.ts);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }),
      datasets: [{
        label: "Portfolio (USD)",
        data: valueHistory.map((p) => p.valueUsd),
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139, 92, 246, 0.08)",
        borderWidth: 1.5,
        pointRadius: valueHistory.length < 20 ? 3 : 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.3,
      }],
    };
  })();

  const lineOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` $${(ctx.parsed.y as number).toFixed(2)}`,
        },
        backgroundColor: "rgb(17 24 39)",
        borderColor: "rgb(55 65 81)",
        borderWidth: 1,
        titleColor: "rgb(209 213 219)",
        bodyColor: "rgb(156 163 175)",
      },
    },
    scales: {
      x: {
        ticks: {
          color: "rgb(75 85 99)",
          font: { size: 10 },
          maxTicksLimit: 8,
          maxRotation: 0,
        },
        grid: { color: "rgba(55,65,81,0.3)" },
        border: { color: "rgb(55 65 81)" },
      },
      y: {
        ticks: {
          color: "rgb(75 85 99)",
          font: { size: 10 },
          callback: (v) => `$${Number(v).toFixed(0)}`,
        },
        grid: { color: "rgba(55,65,81,0.3)" },
        border: { color: "rgb(55 65 81)" },
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-950 font-mono">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-violet-400" />
          <span className="text-sm font-semibold tracking-wide text-white">ARB AGENT</span>
          <span className="text-xs text-gray-500">{state?.config?.tokenMint ? truncate(state.config.tokenMint, 6) : "…"}</span>
        </div>
        <div className="flex items-center gap-3">
          {!connected && (
            <span className="text-xs text-gray-500 animate-pulse">reconnecting…</span>
          )}
          {state && (
            <StatusBadge running={state.botState.running} error={state.botState.error} />
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">

        {/* Charts row — shown when basket has holdings */}
        {basket?.holdings.length ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Donut — token distribution */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-3">DISTRIBUTION</div>
              <div className="flex gap-4 items-center">
                <div className="relative flex-shrink-0" style={{ width: 150, height: 150 }}>
                  {donutData && <Doughnut data={donutData} options={donutOptions} />}
                  {basket.totalValueSol > 0 && solUsd > 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-sm font-bold text-white leading-tight">
                        ${(basket.totalValueSol * solUsd).toFixed(0)}
                      </span>
                      <span className="text-gray-600" style={{ fontSize: 9 }}>total</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1 overflow-hidden">
                  {basket.holdings.map((h, i) => (
                    <div key={h.mint} className="flex items-center gap-1.5 min-w-0 justify-end">
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {h.currentWeight.toFixed(1)}%
                      </span>
                      <span className="text-xs text-gray-400 truncate">{h.symbol}</span>
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Line — 24h portfolio value */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <span className="text-xs text-gray-400">PORTFOLIO VALUE (24H)</span>
                {solUsd > 0 && (
                  <span className="text-xs text-gray-400">SOL = <span className="text-white">${solUsd.toFixed(2)}</span></span>
                )}
              </div>
              {lineData ? (
                <div className="flex-1 min-h-0" style={{ minHeight: 140 }}>
                  <Line data={lineData} options={lineOptions} />
                </div>
              ) : (
                <div className="flex items-center justify-center text-gray-600 text-xs" style={{ minHeight: 140 }}>
                  Collecting data…
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-12 gap-4">
        {/* Left column */}
        <div className="col-span-4 flex flex-col gap-4">
          {/* Wallet balance */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <Wallet className="w-3.5 h-3.5" />
              WALLET BALANCE
            </div>
            <div className="text-2xl font-bold text-white">
              {state?.walletBalanceSol != null
                ? `${formatSol(state.walletBalanceSol)} SOL`
                : "—"}
            </div>
          </div>

          {/* Live spread */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              LIVE SPREAD
              {spreadUpdatedAt && (
                <span className="ml-auto text-gray-600">{formatTime(spreadUpdatedAt)}</span>
              )}
            </div>
            {spread ? (() => {
              const pct = spread.profitBps / 100;
              const aboveThreshold = state && spread.profitBps >= state.config?.minProfitBps;
              const color = aboveThreshold
                ? "text-emerald-400"
                : spread.profitBps > 0
                ? "text-yellow-400"
                : "text-red-400";
              return (
                <>
                  <div className={`text-2xl font-bold mb-2 ${color}`}>
                    {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                    {aboveThreshold && (
                      <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">above target</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mb-0.5">
                    {spread.routeLabels.join(" → ")}
                  </div>
                  <div className="text-xs text-gray-600">
                    {spread.dexLabels.join(" → ")}
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    {spread.inputSol.toFixed(3)} → {spread.outputSol.toFixed(3)} SOL
                  </div>
                </>
              );
            })() : (
              <div className="text-gray-600 text-sm">Fetching…</div>
            )}
          </div>

          {/* P&L */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <TrendingUp className="w-3.5 h-3.5" />
              P&L
            </div>
            <div className="text-xs text-gray-500 mb-1">ARB</div>
            <div className={`text-xl font-bold ${(state?.totalProfitSol ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {state ? `+${formatSol(state.totalProfitSol)} SOL` : "—"}
            </div>
            <div className="text-xs text-gray-500 mt-0.5 mb-3">
              {state?.totalTrades ?? 0} confirmed trades
            </div>
            <div className="text-xs text-gray-500 mb-1">BASKET</div>
            {basket?.pnlUsd != null ? (
              <>
                <div className={`text-xl font-bold ${basket.pnlUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {basket.pnlUsd >= 0 ? "+" : "-"}${Math.abs(basket.pnlUsd).toFixed(2)}
                  {basket.pnlPctUsd != null && (
                    <span className="text-sm font-normal ml-1.5 text-gray-400">
                      ({basket.pnlPctUsd >= 0 ? "+" : ""}{basket.pnlPctUsd.toFixed(2)}%)
                    </span>
                  )}
                </div>
                {basket.baselineTimestamp && (
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="text-xs text-gray-600">
                      since {new Date(basket.baselineTimestamp).toLocaleDateString()}
                    </div>
                    <button
                      onClick={async () => {
                        await fetch("/api/basket/reset-baseline", { method: "POST" });
                      }}
                      className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      reset
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-600 text-sm">Collecting…</div>
            )}
          </div>

          {/* Bot control */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <Cpu className="w-3.5 h-3.5" />
              BOT CONTROL
            </div>
            <button
              onClick={toggleBot}
              disabled={!state}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                state?.botState.running
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                  : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
              }`}
            >
              {state?.botState.running ? (
                <><Square className="w-3.5 h-3.5 fill-current" /> Stop Bot</>
              ) : (
                <><Activity className="w-3.5 h-3.5" /> Start Bot</>
              )}
            </button>

            {state?.botState.error && (
              <div className="mt-2 text-xs text-red-400 bg-red-500/5 rounded p-2 break-all">
                {state.botState.error}
              </div>
            )}

            {uptime != null && (
              <div className="mt-2 text-xs text-gray-500 text-center">
                up {Math.floor(uptime / 60)}m {uptime % 60}s
              </div>
            )}
          </div>

          {/* Wallet */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <KeyRound className="w-3.5 h-3.5" />
              WALLET
            </div>
            {walletPublicKey ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-300 font-mono break-all">{truncate(walletPublicKey, 10)}</span>
                  <CopyButton text={walletPublicKey} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setWalletModal({ type: "import" }); setWalletError(null); setImportKeyInput(""); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors"
                  >
                    <Download className="w-3 h-3" /> Import
                  </button>
                  <button
                    onClick={() => handleWalletCreate(false)}
                    disabled={walletWorking}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">No wallet configured.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setWalletModal({ type: "import" }); setWalletError(null); setImportKeyInput(""); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors"
                  >
                    <Download className="w-3 h-3" /> Import
                  </button>
                  <button
                    onClick={() => handleWalletCreate(false)}
                    disabled={walletWorking}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" /> Generate
                  </button>
                </div>
              </>
            )}
            {walletError && (
              <p className="mt-2 text-xs text-red-400">{walletError}</p>
            )}
          </div>

          {/* Config */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <CircleDollarSign className="w-3.5 h-3.5" />
              CONFIG
            </div>
            <div className="space-y-3">
              {/* Only show static arb amount when no basket is configured — basket uses % of portfolio instead */}
              {!basket?.config.tokens.length && (
                <label className="block">
                  <span className="text-xs text-gray-500 block mb-1">Arb amount (SOL)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={arbAmountInput}
                    onChange={(e) => setArbAmountInput(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </label>
              )}
              <label className="block">
                <span className="text-xs text-gray-500 block mb-1">Arb token mint</span>
                <input
                  type="text"
                  spellCheck={false}
                  value={tokenMintInput}
                  onChange={(e) => setTokenMintInput(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-violet-500"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500 block mb-1">Min profit (bps, 500=5%)</span>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={minProfitInput}
                  onChange={(e) => setMinProfitInput(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </label>
              <button
                onClick={saveConfig}
                disabled={configSaving}
                className="w-full py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {configSaving ? "Saving…" : "Apply"}
              </button>
              {configError && (
                <p className="text-xs text-red-400">{configError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column — tabbed */}
        <div className="col-span-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            {/* Tab bar */}
            <div className="flex items-center border-b border-gray-800 px-4">
              <button
                onClick={() => setRightTab("trades")}
                className={`flex items-center gap-1.5 text-xs py-3 mr-4 border-b-2 transition-colors ${rightTab === "trades" ? "border-violet-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> TRADE LOG
                <span className="text-gray-600 ml-1">{state?.trades.length ?? 0}</span>
              </button>
              <button
                onClick={() => setRightTab("basket")}
                className={`flex items-center gap-1.5 text-xs py-3 border-b-2 transition-colors ${rightTab === "basket" ? "border-violet-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                <Layers className="w-3.5 h-3.5" /> BASKET
                <span className="text-gray-600 ml-1">{basket?.config.tokens.length ?? 0}</span>
              </button>
            </div>

            {/* Trade log tab */}
            {rightTab === "trades" && (
              <>
                {!state || state.trades.length === 0 ? (
                  <div className="px-4 py-12 text-center text-gray-600 text-sm">
                    No trades yet — start the bot to begin scanning
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800/60">
                    {state.trades.map((t) => (
                      <div key={t.id} className="px-4 py-3 hover:bg-gray-800/30 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <TradeStatusBadge status={t.status} />
                            <span className={`text-sm font-semibold ${t.profitSol >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              +{formatSol(t.profitSol)} SOL
                            </span>
                            <span className="text-xs text-gray-500">({(t.profitBps / 100).toFixed(2)}%)</span>
                          </div>
                          <span className="text-xs text-gray-600">{formatTime(t.timestamp)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
                          <span className="text-gray-400">{t.route}</span>
                          <span className="text-gray-700">·</span>
                          <span>{t.dexLabels.join(" → ")}</span>
                          <span className="ml-auto text-gray-600 shrink-0">
                            {t.inputSol.toFixed(3)} → {t.outputSol.toFixed(3)} SOL
                          </span>
                        </div>
                        {t.bundleId && (
                          <div className="mt-0.5 text-xs text-gray-700">
                            bundle:{" "}
                            <a href={`${SOLSCAN_TX}${t.bundleId}`} target="_blank" rel="noopener noreferrer"
                              className="text-violet-500/60 hover:text-violet-400 transition-colors">
                              {truncate(t.bundleId, 6)}
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Basket tab */}
            {rightTab === "basket" && (
              <div className="p-4 space-y-4">
                {/* Holdings table */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" /> HOLDINGS
                      {basket?.totalValueSol ? (
                        <span className="text-gray-600 ml-1">≈ {formatSol(basket.totalValueSol)} SOL total</span>
                      ) : null}
                    </span>
                    <div className="flex items-center gap-2">
                      {rebalanceMsg && (
                        <span className={`text-xs ${rebalanceMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
                          {rebalanceMsg.text}
                        </span>
                      )}
                      <button
                        onClick={triggerRebalance}
                        disabled={rebalancing || !state?.botState.running}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-400 transition-colors disabled:opacity-40"
                        title={!state?.botState.running ? "Start the bot first" : "Force rebalance now"}
                      >
                        <RefreshCw className={`w-3 h-3 ${rebalancing ? "animate-spin" : ""}`} />
                        {rebalancing ? "Rebalancing…" : "Rebalance"}
                      </button>
                      <button
                        onClick={openBasketEditor}
                        className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Edit basket
                      </button>
                    </div>
                  </div>

                  {!basket?.config.tokens.length ? (
                    <div className="py-8 text-center text-gray-600 text-sm">No tokens configured — add one to start</div>
                  ) : (
                    <>
                      {/* Weight total warning */}
                      {Math.abs(totalConfiguredWeight - 100) > 0.01 && (
                        <div className="mb-2 flex items-center gap-1.5 text-xs text-yellow-400">
                          <AlertTriangle className="w-3 h-3" />
                          Weights sum to {totalConfiguredWeight.toFixed(1)}% — must equal 100%
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-600 border-b border-gray-800">
                              <th className="text-left pb-2 font-normal">Token</th>
                              <th className="text-right pb-2 font-normal">Balance</th>
                              <th className="text-right pb-2 font-normal">Value (SOL)</th>
                              <th className="text-right pb-2 font-normal">Current %</th>
                              <th className="text-right pb-2 font-normal">Target %</th>
                              <th className="text-right pb-2 font-normal">Drift</th>
                              <th className="pb-2" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800/40">
                            {basket.config.tokens.map((token) => {
                              const h = basket.holdings.find((h) => h.mint === token.mint);
                              const drift = h?.driftPct ?? 0;
                              const driftColor = Math.abs(drift) >= (basket.config.driftThresholdPct)
                                ? "text-red-400"
                                : Math.abs(drift) >= (basket.config.driftThresholdPct / 2)
                                ? "text-yellow-400"
                                : "text-gray-500";
                              return (
                                <tr key={token.mint} className="hover:bg-gray-800/20">
                                  <td className="py-2">
                                    <div className="font-medium text-white">{token.symbol}</div>
                                    <div className="text-gray-600">{truncate(token.mint, 4)}</div>
                                  </td>
                                  <td className="text-right py-2 text-gray-300">
                                    {h ? h.balance.toFixed(4) : "—"}
                                  </td>
                                  <td className="text-right py-2 text-gray-300">
                                    {h ? formatSol(h.valueSol) : "—"}
                                  </td>
                                  <td className="text-right py-2 text-gray-300">
                                    {h ? h.currentWeight.toFixed(1) + "%" : "—"}
                                  </td>
                                  <td className="text-right py-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="1"
                                      key={`${token.mint}-${(h?.targetWeight ?? token.targetWeight).toFixed(1)}`}
                                      defaultValue={(h?.targetWeight ?? token.targetWeight).toFixed(1)}
                                      onBlur={(e) => updateWeight(token.mint, parseFloat(e.target.value))}
                                      className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-right text-white focus:outline-none focus:border-violet-500"
                                    />
                                  </td>
                                  <td className={`text-right py-2 font-medium ${driftColor}`}>
                                    {h ? (drift >= 0 ? "+" : "") + drift.toFixed(1) + "%" : "—"}
                                  </td>
                                  <td className="text-right py-2">
                                    <button onClick={() => removeToken(token.mint)}
                                      className="text-gray-700 hover:text-red-400 transition-colors">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {basketError && <p className="mt-1 text-xs text-red-400">{basketError}</p>}
                      {basket.lastRebalanceAt && (
                        <p className="mt-2 text-xs text-gray-600">Last rebalance: {formatTime(basket.lastRebalanceAt)}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Basket settings */}
                <div className="border-t border-gray-800 pt-4">
                  <div className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                    <CircleDollarSign className="w-3.5 h-3.5" /> BASKET SETTINGS
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="block">
                      <span className="text-xs text-gray-600 block mb-1">Drift threshold (%)</span>
                      <input type="number" min="1" max="50" step="0.5"
                        defaultValue={basket?.config.driftThresholdPct ?? 5}
                        onBlur={(e) => saveBasketSettings({ driftThresholdPct: parseFloat(e.target.value) })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-600 block mb-1">Rebalance interval (h)</span>
                      <input type="number" min="1" max="168" step="1"
                        defaultValue={basket?.config.rebalanceIntervalHours ?? 24}
                        onBlur={(e) => saveBasketSettings({ rebalanceIntervalHours: parseFloat(e.target.value) })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-gray-600 block mb-1">Arb sizing (% of portfolio)</span>
                      <input type="number" min="1" max="100" step="1"
                        defaultValue={basket?.config.arbSizingPct ?? 10}
                        onBlur={(e) => saveBasketSettings({ arbSizingPct: parseFloat(e.target.value) })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>{/* end grid cols-12 */}
      </div>

      {/* Basket editor modal */}
      {basketEditorOpen && (
        <Modal title="Configure Basket" onClose={() => setBasketEditorOpen(false)} wide>
          <div className="space-y-4 w-full">

            {/* Token list */}
            {editorTokens.length > 0 && (
              <table className="w-full text-xs mb-1">
                <thead>
                  <tr className="text-gray-600 border-b border-gray-800">
                    <th className="text-left pb-1.5 font-normal">Symbol</th>
                    <th className="text-left pb-1.5 font-normal">Mint</th>
                    <th className="text-right pb-1.5 font-normal w-20">Weight %</th>
                    <th className="pb-1.5 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {editorTokens.map((t, i) => (
                    <tr key={t.mint}>
                      <td className="py-1.5 pr-2">
                        <input
                          value={t.symbol}
                          onChange={(e) => setEditorTokens((prev) => prev.map((x, j) => j === i ? { ...x, symbol: e.target.value } : x))}
                          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-white focus:outline-none focus:border-violet-500"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-gray-500 font-mono">{truncate(t.mint, 5)}</td>
                      <td className="py-1.5 text-right">
                        <input
                          type="number" min="0.1" max="100" step="0.1"
                          value={t.targetWeight}
                          onChange={(e) => setEditorTokens((prev) => prev.map((x, j) => j === i ? { ...x, targetWeight: parseFloat(e.target.value) || 0 } : x))}
                          className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-right text-white focus:outline-none focus:border-violet-500"
                        />
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <button onClick={() => setEditorTokens((prev) => prev.filter((_, j) => j !== i))}
                          className="text-gray-700 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Weight total */}
            <div className={`text-xs flex items-center gap-1.5 ${Math.abs(editorTotal - 100) < 0.01 ? "text-emerald-400" : editorTotal > 100 ? "text-red-400" : "text-yellow-400"}`}>
              {Math.abs(editorTotal - 100) < 0.01 ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              Total: {editorTotal.toFixed(1)}% {Math.abs(editorTotal - 100) < 0.01 ? "— ready to save" : `— ${(100 - editorTotal).toFixed(1)}% remaining`}
            </div>

            {/* Add row */}
            <div className="border-t border-gray-800 pt-3 space-y-2">
              <p className="text-xs text-gray-500">Add token</p>
              <div className="flex gap-2">
                <input
                  value={editorMint}
                  onChange={(e) => setEditorMint(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && editorLookupMint()}
                  placeholder="Mint address"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-violet-500"
                />
                <button onClick={editorLookupMint} disabled={!editorMint.trim() || editorLookingUp}
                  className="px-4 py-2 rounded-lg text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors whitespace-nowrap">
                  {editorLookingUp ? "…" : "Lookup"}
                </button>
              </div>
              {editorLookupMsg && <p className="text-xs text-yellow-400/80">{editorLookupMsg}</p>}
              <div className="flex gap-2">
                <input
                  value={editorSymbol}
                  onChange={(e) => setEditorSymbol(e.target.value)}
                  placeholder="Symbol"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
                <input
                  type="number" min="0.1" max="100" step="0.1"
                  value={editorWeight}
                  onChange={(e) => setEditorWeight(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && editorAddRow()}
                  placeholder="Weight %"
                  className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
                <button onClick={editorAddRow}
                  className="px-4 py-2 rounded-lg text-xs bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors whitespace-nowrap flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {basketError && <p className="text-xs text-red-400">{basketError}</p>}

            <button
              onClick={saveBasket}
              disabled={editorSaving || Math.abs(editorTotal - 100) > 0.01}
              className="w-full py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {editorSaving ? "Saving…" : "Save Basket"}
            </button>
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {walletModal?.type === "import" && (
        <Modal title="Import Wallet" onClose={() => setWalletModal(null)}>
          <div className="flex items-start gap-2 mb-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300/80">
              Your key is sent over HTTP to this server. Only use on localhost or a trusted private network.
            </p>
          </div>
          <label className="block mb-4">
            <span className="text-xs text-gray-400 block mb-1.5">Base58 secret key</span>
            <textarea
              rows={3}
              value={importKeyInput}
              onChange={(e) => setImportKeyInput(e.target.value)}
              placeholder="Paste your base58 secret key…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-violet-500 resize-none"
            />
          </label>
          {walletError && <p className="mb-3 text-xs text-red-400">{walletError}</p>}
          <button
            onClick={() => handleWalletImport(false)}
            disabled={walletWorking || !importKeyInput.trim()}
            className="w-full py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {walletWorking ? "Importing…" : "Import"}
          </button>
        </Modal>
      )}

      {/* Overwrite confirmation */}
      {walletModal?.type === "confirm" && (
        <Modal title="Replace existing wallet?" onClose={() => setWalletModal(null)}>
          <div className="flex items-start gap-2 mb-5 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300/80">
              A wallet already exists. Replacing it is <strong>irreversible</strong> — the current keypair file will be overwritten. Make sure you have a backup of the existing key.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setWalletModal(null)}
              className="flex-1 py-2 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (walletModal.action === "create") handleWalletCreate(true);
                else handleWalletImport(true);
              }}
              disabled={walletWorking}
              className="flex-1 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {walletWorking ? "Working…" : "Replace"}
            </button>
          </div>
        </Modal>
      )}

      {/* Backup secret key — shown once after generate */}
      {walletModal?.type === "backup" && (
        <Modal title="Back up your secret key" onClose={() => setWalletModal(null)}>
          <div className="flex items-start gap-2 mb-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300/80">
              This is the <strong>only time</strong> your secret key is shown. Save it somewhere safe — if you lose it you lose access to this wallet.
            </p>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">Public key</span>
              <CopyButton text={walletModal.publicKey} />
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono break-all">
              {walletModal.publicKey}
            </div>
          </div>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">Secret key (base58)</span>
              <CopyButton text={walletModal.secretKey} />
            </div>
            <div className="bg-gray-800 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs text-yellow-200 font-mono break-all select-all">
              {walletModal.secretKey}
            </div>
          </div>
          <button
            onClick={() => setWalletModal(null)}
            className="w-full py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 text-sm font-medium transition-colors"
          >
            I've saved my key
          </button>
        </Modal>
      )}
    </div>
  );
}
