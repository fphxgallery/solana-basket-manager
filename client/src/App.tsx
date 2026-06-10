import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Check,
  CircleDollarSign,
  Clock,
  Copy,
  Cpu,
  Download,
  KeyRound,
  Layers,
  RefreshCw,
  Plus,
  Send,
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
          <span className="text-sm font-semibold text-white">BASKET MANAGER — sign in</span>
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
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [walletModal, setWalletModal] = useState<WalletModal>(null);
  const [importKeyInput, setImportKeyInput] = useState("");
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletWorking, setWalletWorking] = useState(false);
  const [basket, setBasket] = useState<BasketState | null>(null);
  const [rightTab, setRightTab] = useState<"trades" | "basket" | "dynamic">("trades");
  const [basketEditorOpen, setBasketEditorOpen] = useState(false);
  const [editorTokens, setEditorTokens] = useState<BasketToken[]>([]);
  const [editorMint, setEditorMint] = useState("");
  const [editorSymbol, setEditorSymbol] = useState("");
  const [editorWeight, setEditorWeight] = useState("");
  const [editorLookingUp, setEditorLookingUp] = useState(false);
  const [editorLookupMsg, setEditorLookupMsg] = useState<string | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [curveEditing, setCurveEditing] = useState<Array<[number, number]> | null>(null);
  const [curveCapEditing, setCurveCapEditing] = useState(30);
  const [curveSaving, setCurveSaving] = useState(false);
  const [curveError, setCurveError] = useState<string | null>(null);
  const curveInitRef = useRef(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceMsg, setRebalanceMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([]);
  const [solUsd, setSolUsd] = useState<number>(0);
  const [valueWindow, setValueWindow] = useState<"24h" | "7d" | "30d">("24h");
  const [telegram, setTelegram] = useState<{ configured: boolean; chatId?: string; reportEnabled: boolean; reportTime: string | null } | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestMsg, setTelegramTestMsg] = useState<string | null>(null);
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportTime, setReportTime] = useState("08:00");
  const [reportSending, setReportSending] = useState(false);
  const [reportSendMsg, setReportSendMsg] = useState<string | null>(null);
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

  // Telegram
  useEffect(() => {
    fetch("/api/telegram")
      .then((r) => r.json() as Promise<{ configured: boolean; chatId?: string; reportEnabled: boolean; reportTime: string | null }>)
      .then((d) => {
        setTelegram(d);
        setReportEnabled(d.reportEnabled ?? false);
        if (d.reportTime) setReportTime(d.reportTime);
      })
      .catch(() => {});
  }, []);

  // Initialize curve editor once when basket first loads
  useEffect(() => {
    if (!curveInitRef.current && basket?.config.curvePoints) {
      setCurveEditing(basket.config.curvePoints.map((p) => [p[0], p[1]]));
      setCurveCapEditing(basket.config.curveCap ?? 30);
      curveInitRef.current = true;
    }
  }, [basket]);

  async function saveCurve() {
    if (!curveEditing) return;
    setCurveError(null);
    const sorted = [...curveEditing].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][0] === sorted[i - 1][0]) {
        setCurveError("Duplicate PnL% values — each must be unique");
        return;
      }
    }
    if (sorted.length < 2) { setCurveError("Need at least 2 points"); return; }
    setCurveSaving(true);
    try {
      const res = await fetch("/api/basket/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curvePoints: sorted, curveCap: curveCapEditing }),
      });
      const d = await res.json() as { error?: string };
      if (!res.ok) { setCurveError(d.error ?? "Save failed"); return; }
      setCurveEditing(sorted);
    } finally {
      setCurveSaving(false);
    }
  }

  const DEFAULT_CURVE: Array<[number, number]> = [[-20, 0], [-10, 5], [0, 10], [10, 15], [15, 20], [20, 25]];

  async function saveTelegram() {
    setTelegramError(null);
    if (!telegramToken.trim() || !telegramChatId.trim()) {
      setTelegramError("Both fields required");
      return;
    }
    const r = await fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: telegramToken.trim(), chatId: telegramChatId.trim() }),
    });
    if (r.ok) {
      const d = await r.json() as { configured: boolean; chatId?: string; reportEnabled: boolean; reportTime: string | null };
      setTelegram(d);
      setTelegramToken("");
      setTelegramChatId("");
    } else {
      const d = await r.json() as { error?: string };
      setTelegramError(d.error ?? "Save failed");
    }
  }

  async function disconnectTelegram() {
    await fetch("/api/telegram", { method: "DELETE" });
    setTelegram({ configured: false, reportEnabled: false, reportTime: null });
  }

  async function testTelegram() {
    setTelegramTesting(true);
    setTelegramTestMsg(null);
    try {
      const r = await fetch("/api/telegram/test", { method: "POST" });
      setTelegramTestMsg(r.ok ? "Sent!" : "Failed — check token/chat ID");
    } catch {
      setTelegramTestMsg("Failed");
    } finally {
      setTelegramTesting(false);
      setTimeout(() => setTelegramTestMsg(null), 3000);
    }
  }

  async function saveReportSchedule(patch: { enabled?: boolean; time?: string }) {
    const r = await fetch("/api/telegram/report-schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) {
      const d = await r.json() as { reportEnabled: boolean; reportTime: string | null };
      setReportEnabled(d.reportEnabled);
      if (d.reportTime) setReportTime(d.reportTime);
    }
  }

  async function sendReportNow() {
    setReportSending(true);
    setReportSendMsg(null);
    try {
      const r = await fetch("/api/telegram/report", { method: "POST" });
      setReportSendMsg(r.ok ? "Sent!" : "Failed");
    } catch {
      setReportSendMsg("Failed");
    } finally {
      setReportSending(false);
      setTimeout(() => setReportSendMsg(null), 3000);
    }
  }

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

  async function saveBasketSettings(patch: { driftThresholdPct?: number; rebalanceIntervalHours?: number; hwmEnabled?: boolean; hwmHalfLifeDays?: number }) {
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
          setState(data as AppState);
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

  // ── Line chart data (portfolio value, filtered by valueWindow) ───────────────
  const lineData = (() => {
    if (!valueHistory.length) return null;

    const windowMs = valueWindow === "30d" ? 30 * 864e5 : valueWindow === "7d" ? 7 * 864e5 : 864e5;
    const cutoff = Date.now() - windowMs;
    const filtered = valueHistory.filter((p) => p.ts >= cutoff);
    if (!filtered.length) return null;

    // Downsample for display: 7d → every 5th point, 30d → every 20th point
    const step = valueWindow === "30d" ? 20 : valueWindow === "7d" ? 5 : 1;
    const points = step === 1 ? filtered : filtered.filter((_, i) => i % step === 0 || i === filtered.length - 1);

    const labels = points.map((p) => {
      const d = new Date(p.ts);
      if (valueWindow === "30d") {
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
      }
      if (valueWindow === "7d") {
        return d.toLocaleDateString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    });

    return {
      labels,
      datasets: [{
        label: "Portfolio (USD)",
        data: points.map((p) => p.valueUsd),
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139, 92, 246, 0.08)",
        borderWidth: 1.5,
        pointRadius: points.length < 20 ? 3 : 0,
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
          <span className="text-sm font-semibold tracking-wide text-white">BASKET MANAGER</span>
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

            {/* Line — portfolio value */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">PORTFOLIO VALUE</span>
                  <div className="flex items-center gap-1">
                    {(["24h", "7d", "30d"] as const).map((w) => (
                      <button
                        key={w}
                        onClick={() => setValueWindow(w)}
                        className={`px-1.5 py-0.5 rounded text-xs transition-colors ${valueWindow === w ? "bg-violet-600 text-white" : "text-gray-500 hover:text-gray-300"}`}
                      >
                        {w.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
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

          {/* P&L */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <TrendingUp className="w-3.5 h-3.5" />
              P&L
            </div>
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

          {/* Telegram */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <Send className="w-3.5 h-3.5" />
              TELEGRAM
            </div>
            {telegram?.configured ? (
              <>
                <div className="text-xs text-emerald-400 mb-1">Connected</div>
                <div className="text-xs text-gray-500 mb-3 font-mono">Chat ID: {telegram.chatId}</div>
                <div className="flex gap-2">
                  <button
                    onClick={testTelegram}
                    disabled={telegramTesting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors disabled:opacity-50"
                  >
                    {telegramTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    {telegramTestMsg ?? "Test"}
                  </button>
                  <button
                    onClick={disconnectTelegram}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-red-900/40 hover:text-red-400 border border-gray-700 transition-colors"
                  >
                    <X className="w-3 h-3" /> Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  type="password"
                  placeholder="Bot token"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 mb-2"
                />
                <input
                  type="text"
                  placeholder="Chat ID"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 mb-2"
                />
                {telegramError && <p className="text-xs text-red-400 mb-2">{telegramError}</p>}
                <button
                  onClick={saveTelegram}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors"
                >
                  <Check className="w-3 h-3" /> Connect
                </button>
              </>
            )}
          </div>

          {/* Daily Report */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
              <Clock className="w-3.5 h-3.5" />
              DAILY REPORT
            </div>
            {!telegram?.configured ? (
              <p className="text-xs text-gray-600">Connect Telegram to enable daily reports.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Scheduled</span>
                  <button
                    onClick={() => saveReportSchedule({ enabled: !reportEnabled })}
                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${reportEnabled ? "bg-violet-600" : "bg-gray-700"}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${reportEnabled ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </div>
                {reportEnabled && (
                  <label className="block">
                    <span className="text-xs text-gray-600 block mb-1">Send at (server local time)</span>
                    <input
                      type="time"
                      value={reportTime}
                      onChange={(e) => setReportTime(e.target.value)}
                      onBlur={(e) => saveReportSchedule({ time: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </label>
                )}
                <button
                  onClick={sendReportNow}
                  disabled={reportSending}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700 transition-colors disabled:opacity-50"
                >
                  {reportSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {reportSendMsg ?? "Send Report Now"}
                </button>
              </div>
            )}
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
                <ArrowRightLeft className="w-3.5 h-3.5" /> REBALANCE LOG
                <span className="text-gray-600 ml-1">{state?.trades.length ?? 0}</span>
              </button>
              <button
                onClick={() => setRightTab("basket")}
                className={`flex items-center gap-1.5 text-xs py-3 mr-4 border-b-2 transition-colors ${rightTab === "basket" ? "border-violet-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                <Layers className="w-3.5 h-3.5" /> BASKET
                <span className="text-gray-600 ml-1">{basket?.config.tokens.length ?? 0}</span>
              </button>
              <button
                onClick={() => setRightTab("dynamic")}
                className={`flex items-center gap-1.5 text-xs py-3 border-b-2 transition-colors ${rightTab === "dynamic" ? "border-violet-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}
              >
                <TrendingUp className="w-3.5 h-3.5" /> DYNAMIC WEIGHT
              </button>
            </div>

            {/* Trade log tab */}
            {rightTab === "trades" && (
              <>
                {!state || state.trades.length === 0 ? (
                  <div className="px-4 py-12 text-center text-gray-600 text-sm">
                    No rebalances yet — start the bot to track and rebalance the basket
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800/60">
                    {state.trades.map((t) => (
                      <div key={t.id} className="px-4 py-3 hover:bg-gray-800/30 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <TradeStatusBadge status={t.status} />
                            <span className="text-sm text-gray-300">{t.route}</span>
                          </div>
                          <span className="text-xs text-gray-600">{formatTime(t.timestamp)}</span>
                        </div>
                        {t.inputSol > 0 && (
                          <div className="text-xs text-gray-600">
                            {t.inputSol.toFixed(4)} SOL value swapped
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Dynamic Weight tab */}
            {rightTab === "dynamic" && (
              <div className="p-4 space-y-5">
                {/* HWM */}
                <div>
                  <div className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> HIGH-WATER MARK
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">Profit lock enabled</span>
                      <button
                        onClick={() => saveBasketSettings({ hwmEnabled: !(basket?.config.hwmEnabled ?? false) })}
                        className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${basket?.config.hwmEnabled ? "bg-violet-600" : "bg-gray-700"}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${basket?.config.hwmEnabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </div>
                    {basket?.config.hwmEnabled && (
                      <label className="block">
                        <span className="text-xs text-gray-600 block mb-1">Decay half-life (days)</span>
                        <input type="number" min="1" max="90" step="1"
                          key={basket.config.hwmHalfLifeDays}
                          defaultValue={basket.config.hwmHalfLifeDays ?? 7}
                          onBlur={(e) => saveBasketSettings({ hwmHalfLifeDays: parseFloat(e.target.value) })}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Curve editor */}
                <div className="border-t border-gray-800 pt-4">
                  <div className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" /> PROFIT-TAKING CURVE
                  </div>
                  {curveEditing && (
                    <>
                      <table className="w-full text-xs mb-2">
                        <thead>
                          <tr className="text-gray-600 border-b border-gray-800">
                            <th className="text-left pb-1.5 font-normal">PnL %</th>
                            <th className="text-left pb-1.5 font-normal pl-2">USDC %</th>
                            <th className="pb-1.5 w-6" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/40">
                          {curveEditing.map((pt, i) => (
                            <tr key={i}>
                              <td className="py-1 pr-2">
                                <input
                                  type="number" step="1"
                                  value={pt[0]}
                                  onChange={(e) => setCurveEditing((prev) => prev!.map((p, j) => j === i ? [parseFloat(e.target.value) || 0, p[1]] : p))}
                                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-white focus:outline-none focus:border-violet-500"
                                />
                              </td>
                              <td className="py-1 pl-2 pr-2">
                                <input
                                  type="number" min="0" max="100" step="1"
                                  value={pt[1]}
                                  onChange={(e) => setCurveEditing((prev) => prev!.map((p, j) => j === i ? [p[0], parseFloat(e.target.value) || 0] : p))}
                                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-white focus:outline-none focus:border-violet-500"
                                />
                              </td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => setCurveEditing((prev) => prev!.filter((_, j) => j !== i))}
                                  className="text-gray-700 hover:text-red-400 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button
                        onClick={() => setCurveEditing((prev) => [...prev!, [0, 0]])}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-400 transition-colors mb-3"
                      >
                        <Plus className="w-3 h-3" /> Add point
                      </button>
                      <label className="block mb-3">
                        <span className="text-xs text-gray-600 block mb-1">Cap above max PnL (%)</span>
                        <input type="number" min="0" max="100" step="1"
                          value={curveCapEditing}
                          onChange={(e) => setCurveCapEditing(parseFloat(e.target.value) || 0)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                        />
                      </label>
                      {curveError && <p className="text-xs text-red-400 mb-2">{curveError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setCurveEditing(DEFAULT_CURVE.map((p) => [p[0], p[1]])); setCurveCapEditing(30); setCurveError(null); }}
                          className="flex-1 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700 transition-colors"
                        >
                          Reset to defaults
                        </button>
                        <button
                          onClick={saveCurve}
                          disabled={curveSaving}
                          className="flex-1 py-1.5 rounded-lg text-xs bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 border border-violet-500/20 transition-colors disabled:opacity-50"
                        >
                          {curveSaving ? "Saving…" : "Save curve"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
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
                  <div className="grid grid-cols-2 gap-3">
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
