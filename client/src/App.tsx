import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  AlertTriangle,
  BarChart3,
  Check,
  CircleDollarSign,
  KeyRound,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  TrendingUp,
  X,
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
} from "chart.js";
import type { AppState, TradeRecord, BasketState, BasketToken, ValuePoint } from "./types.ts";
import { formatTime, truncate, Modal, CopyButton } from "./lib.tsx";
import { CyberBackground } from "./components/CyberBackground.tsx";
import { AppHeader } from "./components/AppHeader.tsx";
import { HeroCard } from "./components/HeroCard.tsx";
import { PortfolioChartCard } from "./components/PortfolioChartCard.tsx";
import { Tabs, type TabKey } from "./components/Tabs.tsx";
import { HoldingsTable } from "./components/HoldingsTable.tsx";
import { SettingsTab } from "./components/SettingsTab.tsx";

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

function TradeStatusBadge({ status }: { status: TradeRecord["status"] }) {
  if (status === "confirmed") return (
    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#0c241c] text-good">confirmed</span>
  );
  if (status === "failed") return (
    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a0d10] text-bad">failed</span>
  );
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#241d08] text-warn animate-pulse">pending</span>
  );
}

type WalletModal =
  | { type: "import" }
  | { type: "confirm"; action: "create" | "import"; secretKey?: string }
  | { type: "backup"; publicKey: string; secretKey: string }
  | null;

const cyInput = "w-full bg-[#0a1019] border border-cardline rounded px-2 py-1.5 text-[11px] text-ink placeholder-dim focus:outline-none focus:border-cyan-line";

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
    <>
      <CyberBackground />
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={submit} className="bg-card border border-cardline rounded-card w-full max-w-sm p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-cyan" />
            <span className="text-sm font-semibold text-ink">basket-manager — sign in</span>
          </div>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="API token"
            autoFocus
            className={`${cyInput} mb-3 px-3 py-2 text-sm`}
          />
          {error && <div className="text-xs text-bad mb-3">{error}</div>}
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="w-full bg-cyan-bg border border-cyan-line text-cyan hover:bg-[#093341] disabled:opacity-50 text-sm font-medium rounded-lg py-2 transition-colors"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
          <p className="text-xs text-dim mt-3">Token is the API_TOKEN value from the server .env file.</p>
        </form>
      </div>
    </>
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
  const [rightTab, setRightTab] = useState<TabKey>("basket");
  const [tradePage, setTradePage] = useState(0);
  const [clearArmed, setClearArmed] = useState(false);
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
  // Dynamic weight token
  const [dynMintInput, setDynMintInput] = useState("");
  const [dynMintSymbol, setDynMintSymbol] = useState<string | null>(null);
  const [dynMintLooking, setDynMintLooking] = useState(false);
  const [dynMintMsg, setDynMintMsg] = useState<string | null>(null);
  const dynMintInitRef = useRef(false);
  // Reserve floor
  const [reserveMintInput, setReserveMintInput] = useState("");
  const [reserveMintSymbol, setReserveMintSymbol] = useState<string | null>(null);
  const [reserveMintLooking, setReserveMintLooking] = useState(false);
  const [reserveMintMsg, setReserveMintMsg] = useState<string | null>(null);
  const [reserveFloorInput, setReserveFloorInput] = useState(0);
  const reserveFloorInitRef = useRef(false);
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

  // Initialize dynamic weight token settings once
  useEffect(() => {
    if (!dynMintInitRef.current && basket?.config) {
      const mint = basket.config.dynamicWeightMint ?? "";
      setDynMintInput(mint);
      const h = basket.holdings.find((hh) => hh.mint === mint);
      if (h) setDynMintSymbol(h.symbol);
      dynMintInitRef.current = true;
    }
  }, [basket]);

  // Initialize reserve floor settings once
  useEffect(() => {
    if (!reserveFloorInitRef.current && basket?.config) {
      const mint = basket.config.reserveMint ?? "";
      setReserveMintInput(mint);
      if (mint) {
        const h = basket.holdings.find((hh) => hh.mint === mint);
        if (h) setReserveMintSymbol(h.symbol);
      }
      setReserveFloorInput(basket.config.reserveFloorPct ?? 0);
      reserveFloorInitRef.current = true;
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

  async function lookupDynMint() {
    if (!dynMintInput.trim()) return;
    setDynMintLooking(true);
    setDynMintMsg(null);
    try {
      const r = await fetch(`/api/basket/token-info/${dynMintInput.trim()}`);
      const d = await r.json() as { symbol: string | null };
      if (d.symbol) { setDynMintSymbol(d.symbol); }
      else setDynMintMsg("Symbol not found — mint may still be valid");
    } catch {
      setDynMintMsg("Lookup failed");
    } finally {
      setDynMintLooking(false);
    }
  }

  async function saveDynMint() {
    await saveBasketSettings({ dynamicWeightMint: dynMintInput.trim() });
  }

  async function lookupReserveMint() {
    if (!reserveMintInput.trim()) return;
    setReserveMintLooking(true);
    setReserveMintMsg(null);
    try {
      const r = await fetch(`/api/basket/token-info/${reserveMintInput.trim()}`);
      const d = await r.json() as { symbol: string | null };
      if (d.symbol) { setReserveMintSymbol(d.symbol); }
      else setReserveMintMsg("Symbol not found — mint may still be valid");
    } catch {
      setReserveMintMsg("Lookup failed");
    } finally {
      setReserveMintLooking(false);
    }
  }

  async function saveReserveFloor() {
    await saveBasketSettings({
      reserveMint: reserveMintInput.trim() || null,
      reserveFloorPct: reserveFloorInput,
    });
  }

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

  async function saveBasketSettings(patch: { driftThresholdPct?: number; rebalanceIntervalHours?: number; hwmEnabled?: boolean; hwmHalfLifeDays?: number; minSwapUsd?: number; dynamicWeightMint?: string; reserveMint?: string | null; reserveFloorPct?: number }) {
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

  // Clear rebalance log — two-click confirm; server clears trades.json and
  // broadcasts a fresh snapshot, so the SSE stream updates every client.
  function clearLogs() {
    if (!clearArmed) {
      setClearArmed(true);
      setTimeout(() => setClearArmed(false), 3000);
      return;
    }
    setClearArmed(false);
    setTradePage(0);
    fetch("/api/trades/clear", { method: "POST" }).catch(() => {});
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

  return (
    <>
      <CyberBackground />
      <div className="min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-5 space-y-4">

          <AppHeader
            connected={connected}
            running={!!state?.botState.running}
            error={state?.botState.error ?? null}
            uptime={uptime}
            ready={!!state}
            onToggle={toggleBot}
          />

          <HeroCard
            basket={basket}
            walletBalanceSol={state?.walletBalanceSol ?? null}
            walletPublicKey={walletPublicKey}
            solUsd={solUsd}
            onResetBaseline={async () => { await fetch("/api/basket/reset-baseline", { method: "POST" }); }}
          />

          <PortfolioChartCard
            valueHistory={valueHistory}
            valueWindow={valueWindow}
            setValueWindow={setValueWindow}
            solUsd={solUsd}
          />

          {/* Tabbed panel */}
          <div className="bg-card border border-cardline rounded-card">
            {/* Tab bar — basket actions ride along on the right when BASKET is active */}
            <div className="flex items-center justify-between gap-3 border-b border-divider pr-4 flex-wrap">
              <Tabs
                active={rightTab}
                onChange={(k) => { setRightTab(k); if (k === "trades") setTradePage(0); }}
                tabs={[
                  { key: "basket", label: "BASKET", icon: Layers, count: basket?.config.tokens.length ?? 0 },
                  { key: "dynamic", label: "DYNAMIC WEIGHT", icon: TrendingUp },
                  { key: "trades", label: "REBALANCE LOG", icon: ArrowRightLeft, count: state?.trades.length ?? 0 },
                  { key: "settings", label: "SETTINGS", icon: Settings },
                ]}
              />
              {rightTab === "basket" && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {rebalanceMsg && (
                    <span className={`text-[10.5px] ${rebalanceMsg.ok ? "text-good" : "text-bad"}`}>{rebalanceMsg.text}</span>
                  )}
                  <button
                    onClick={triggerRebalance}
                    disabled={rebalancing || !state?.botState.running}
                    title={!state?.botState.running ? "Start the bot first" : "Force rebalance now"}
                    className="flex items-center gap-1.5 text-[10.5px] text-muted hover:text-cyan border border-cardline hover:border-cyan-line rounded-md transition-colors disabled:opacity-40"
                    style={{ padding: "5px 9px" }}
                  >
                    <RefreshCw className={rebalancing ? "animate-spin" : ""} style={{ width: 13, height: 13 }} />
                    {rebalancing ? "Rebalancing…" : "Rebalance"}
                  </button>
                  <button
                    onClick={openBasketEditor}
                    className="flex items-center gap-1.5 text-[10.5px] text-muted hover:text-cyan border border-cardline hover:border-cyan-line rounded-md transition-colors"
                    style={{ padding: "5px 9px" }}
                  >
                    <Pencil style={{ width: 13, height: 13 }} /> Edit basket
                  </button>
                </div>
              )}
              {rightTab === "trades" && (state?.trades.length ?? 0) > 0 && (
                <button
                  onClick={clearLogs}
                  title="Clear the rebalance log"
                  className={`flex items-center gap-1.5 text-[10.5px] rounded-md transition-colors flex-shrink-0 border ${
                    clearArmed
                      ? "text-bad bg-[#1a0d10] border-[#3a1418] hover:bg-[#231013]"
                      : "text-muted hover:text-bad border-cardline hover:border-[#3a1418]"
                  }`}
                  style={{ padding: "5px 9px" }}
                >
                  <Trash2 style={{ width: 13, height: 13 }} /> {clearArmed ? "Confirm clear" : "Clear logs"}
                </button>
              )}
            </div>

            {/* Rebalance log tab */}
            {rightTab === "trades" && (
              <>
                {!state || state.trades.length === 0 ? (
                  <div className="px-4 py-12 text-center text-dim text-sm">
                    No rebalances yet — start the bot to track and rebalance the basket
                  </div>
                ) : (() => {
                  const PAGE_SIZE = 12;
                  const totalPages = Math.ceil(state.trades.length / PAGE_SIZE);
                  const page = Math.min(tradePage, totalPages - 1);
                  const pageTrades = state.trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
                  return (
                    <>
                      <div className="divide-y divide-divider">
                        {pageTrades.map((t) => (
                          <div key={t.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <TradeStatusBadge status={t.status} />
                                <span className="text-[11px] text-ink">{t.route}</span>
                              </div>
                              <span className="text-[10px] text-dim">{formatTime(t.timestamp)}</span>
                            </div>
                            {(t.inputSol > 0 || (t.status === "confirmed" && t.profitSol !== 0)) && (
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-dim">
                                  {t.inputSol > 0 ? `${t.inputSol.toFixed(4)} SOL value swapped` : ""}
                                </span>
                                {t.status === "confirmed" && t.profitSol !== 0 && (
                                  <span className={`tabular-nums ${t.profitSol > 0 ? "text-good" : "text-bad"}`}>
                                    {t.profitSol > 0 ? "+" : ""}{t.profitSol.toFixed(4)} SOL
                                    {t.profitBps ? ` · ${t.profitBps > 0 ? "+" : ""}${t.profitBps} bps` : ""}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-2 border-t border-divider">
                          <button
                            onClick={() => setTradePage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="text-[11px] text-dim hover:text-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            ← prev
                          </button>
                          <span className="text-[11px] text-dim">{page + 1} / {totalPages}</span>
                          <button
                            onClick={() => setTradePage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page === totalPages - 1}
                            className="text-[11px] text-dim hover:text-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            next →
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </>
            )}

            {/* Basket tab — holdings table only (actions live in the tab bar) */}
            {rightTab === "basket" && (
              <HoldingsTable basket={basket} basketError={basketError} />
            )}

            {/* Dynamic Weight tab */}
            {rightTab === "dynamic" && (
              <div className="p-4 space-y-5">
                {/* ── PROFIT-TAKING CURVE — hero chart ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] tracking-wide text-muted flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" /> PROFIT-TAKING CURVE
                    </span>
                    <span className="text-[10px] text-dim flex items-center gap-1.5">
                      cap above max
                      <input type="number" min="0" max="100" step="1"
                        value={curveCapEditing}
                        onChange={(e) => setCurveCapEditing(parseFloat(e.target.value) || 0)}
                        className="w-12 bg-[#0a1019] border border-cardline rounded px-1.5 py-0.5 text-right text-ink focus:outline-none focus:border-cyan-line tabular-nums"
                      />
                      %
                    </span>
                  </div>

                  {curveEditing && (
                    <>
                      {/* chart */}
                      {(() => {
                        const pts = [...curveEditing].sort((a, b) => a[0] - b[0]);
                        const W = 620, H = 210, L = 42, R = 608, T = 16, B = 182;
                        const xs = pts.map((p) => p[0]);
                        const ys = pts.map((p) => p[1]);
                        const minX = Math.min(...xs), maxX = Math.max(...xs);
                        const maxY = Math.max(...ys, 1);
                        const sx = (v: number) => (maxX === minX ? (L + R) / 2 : L + ((v - minX) / (maxX - minX)) * (R - L));
                        const sy = (v: number) => B - (v / maxY) * (B - T);
                        const line = pts.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(" ");
                        const area = pts.length
                          ? `${sx(pts[0][0]).toFixed(1)},${B} ${line} ${sx(pts[pts.length - 1][0]).toFixed(1)},${B}`
                          : "";
                        const grid = [0.25, 0.5, 0.75].map((f) => B - f * (B - T));
                        return (
                          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mb-3" style={{ maxHeight: 230 }}>
                            {grid.map((gy, i) => (
                              <line key={i} x1={L} y1={gy} x2={R} y2={gy} stroke="#0d2230" strokeDasharray="3 4" />
                            ))}
                            <line x1={L} y1={T} x2={L} y2={B} stroke="#143040" />
                            <line x1={L} y1={B} x2={R} y2={B} stroke="#143040" />
                            {pts.length >= 2 && <polygon points={area} fill="#102a33" />}
                            {pts.length >= 2 && <polyline points={line} fill="none" stroke="#22d3ee" strokeWidth={2.5} />}
                            {pts.map((p, i) => (
                              <g key={i}>
                                <circle cx={sx(p[0])} cy={sy(p[1])} r={4.5} fill="#22d3ee" />
                                <text x={sx(p[0])} y={sy(p[1]) - 8} fill="#6b8ba0" fontSize={9} fontFamily="monospace" textAnchor="middle">{p[1]}</text>
                                <text x={sx(p[0])} y={B + 13} fill="#4f7088" fontSize={9} fontFamily="monospace" textAnchor="middle">{p[0]}</text>
                              </g>
                            ))}
                            <text x={6} y={20} fill="#4f7088" fontSize={9} fontFamily="monospace">{dynMintSymbol ?? "Token"}%</text>
                            <text x={R - 30} y={H - 4} fill="#4f7088" fontSize={9} fontFamily="monospace">PnL%</text>
                          </svg>
                        );
                      })()}

                      {/* editable breakpoint chips */}
                      <div className="flex flex-wrap items-center gap-2">
                        {curveEditing.map((pt, i) => (
                          <div key={i} className="flex items-center gap-1 bg-[#0a1019] border border-cardline rounded-md pl-2 pr-1 py-1">
                            <input
                              type="number" step="1"
                              value={pt[0]}
                              onChange={(e) => setCurveEditing((prev) => prev!.map((p, j) => j === i ? [parseFloat(e.target.value) || 0, p[1]] : p))}
                              className="w-9 bg-transparent text-right text-[11px] text-ink focus:outline-none tabular-nums"
                            />
                            <span className="text-dim text-[11px]">→</span>
                            <input
                              type="number" min="0" max="100" step="1"
                              value={pt[1]}
                              onChange={(e) => setCurveEditing((prev) => prev!.map((p, j) => j === i ? [p[0], parseFloat(e.target.value) || 0] : p))}
                              className="w-8 bg-transparent text-right text-[11px] text-ink focus:outline-none tabular-nums"
                            />
                            <span className="text-dim text-[10px]">%</span>
                            <button
                              onClick={() => setCurveEditing((prev) => prev!.filter((_, j) => j !== i))}
                              aria-label="Remove curve point"
                              className="text-dim hover:text-bad transition-colors ml-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setCurveEditing((prev) => [...prev!, [0, 0]])}
                          className="flex items-center gap-1 text-[11px] text-cyan bg-cyan-bg border border-dashed border-cyan-line rounded-md px-2.5 py-1 hover:bg-[#093341] transition-colors"
                        >
                          <Plus className="w-3 h-3" /> point
                        </button>
                      </div>

                      {curveError && <p className="text-[11px] text-bad mt-2">{curveError}</p>}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => { setCurveEditing(DEFAULT_CURVE.map((p) => [p[0], p[1]])); setCurveCapEditing(30); setCurveError(null); }}
                          className="flex-1 py-1.5 rounded-lg text-[11px] text-muted hover:text-cyan bg-[#0a1019] border border-cardline hover:border-cyan-line transition-colors"
                        >
                          Reset to defaults
                        </button>
                        <button
                          onClick={saveCurve}
                          disabled={curveSaving}
                          className="flex-1 py-1.5 rounded-lg text-[11px] text-cyan bg-cyan-bg border border-cyan-line hover:bg-[#093341] transition-colors disabled:opacity-50"
                        >
                          {curveSaving ? "Saving…" : "Save curve"}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* ── footer settings grid ── */}
                <div className="border-t border-divider pt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  {/* Dynamic weight token */}
                  <div>
                    <div className="text-[11px] tracking-wide text-muted mb-2 flex items-center gap-1.5">
                      <CircleDollarSign className="w-3.5 h-3.5" /> DYNAMIC WEIGHT TOKEN
                    </div>
                    {dynMintSymbol && dynMintInput && (
                      <div className="text-[11px] text-muted mb-1.5">
                        Current: <span className="text-ink">{dynMintSymbol}</span>
                        <span className="text-dim ml-1.5">{dynMintInput.slice(0, 6)}…</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={dynMintInput}
                        onChange={(e) => setDynMintInput(e.target.value)}
                        placeholder="Token mint address"
                        className={`${cyInput} flex-1 min-w-0`}
                      />
                      <button onClick={lookupDynMint} disabled={!dynMintInput.trim() || dynMintLooking}
                        className="px-3 py-1.5 rounded text-[11px] text-muted hover:text-cyan bg-[#0a1019] border border-cardline hover:border-cyan-line disabled:opacity-50 transition-colors whitespace-nowrap">
                        {dynMintLooking ? "…" : "Lookup"}
                      </button>
                      <button onClick={saveDynMint} disabled={!dynMintInput.trim()}
                        className="px-3 py-1.5 rounded text-[11px] text-cyan bg-cyan-bg border border-cyan-line hover:bg-[#093341] disabled:opacity-50 transition-colors whitespace-nowrap">
                        Save
                      </button>
                    </div>
                    {dynMintMsg && <p className="text-[11px] text-warn/80 mt-1.5">{dynMintMsg}</p>}
                  </div>

                  {/* HWM */}
                  <div>
                    <div className="text-[11px] tracking-wide text-muted mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> HIGH-WATER MARK
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-dim">Profit lock enabled</span>
                      <button
                        onClick={() => saveBasketSettings({ hwmEnabled: !(basket?.config.hwmEnabled ?? false) })}
                        role="switch" aria-checked={!!basket?.config.hwmEnabled} aria-label="Profit lock (high-water mark)"
                        className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${basket?.config.hwmEnabled ? "bg-cyan" : "bg-[#1a2a36]"}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${basket?.config.hwmEnabled ? "left-[18px]" : "left-0.5"}`} />
                      </button>
                    </div>
                    {basket?.config.hwmEnabled && (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-dim">Decay half-life</span>
                        <span className="flex items-center gap-1.5">
                          <input type="number" min="1" max="90" step="1"
                            key={basket.config.hwmHalfLifeDays}
                            defaultValue={basket.config.hwmHalfLifeDays ?? 7}
                            onBlur={(e) => saveBasketSettings({ hwmHalfLifeDays: parseFloat(e.target.value) })}
                            className="w-14 bg-[#0a1019] border border-cardline rounded px-2 py-1 text-right text-[11px] text-ink focus:outline-none focus:border-cyan-line tabular-nums"
                          />
                          <span className="text-[10px] text-dim">days</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Reserve floor */}
                  <div className="md:col-span-2">
                    <div className="text-[11px] tracking-wide text-muted mb-2 flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" /> RESERVE FLOOR
                    </div>
                    {reserveMintSymbol && reserveMintInput && (
                      <div className="text-[11px] text-muted mb-1.5">
                        Current: <span className="text-ink">{reserveMintSymbol}</span>
                        <span className="text-dim ml-1.5">{reserveMintInput.slice(0, 6)}…</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={reserveMintInput}
                        onChange={(e) => setReserveMintInput(e.target.value)}
                        placeholder="Reserve token mint (leave blank to disable)"
                        className={`${cyInput} flex-1 min-w-[160px]`}
                      />
                      <button onClick={lookupReserveMint} disabled={!reserveMintInput.trim() || reserveMintLooking}
                        className="px-3 py-1.5 rounded text-[11px] text-muted hover:text-cyan bg-[#0a1019] border border-cardline hover:border-cyan-line disabled:opacity-50 transition-colors whitespace-nowrap">
                        {reserveMintLooking ? "…" : "Lookup"}
                      </button>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-dim">min</span>
                        <input type="number" min="0" max="100" step="1"
                          value={reserveFloorInput}
                          onChange={(e) => setReserveFloorInput(parseFloat(e.target.value) || 0)}
                          className="w-14 bg-[#0a1019] border border-cardline rounded px-2 py-1 text-right text-[11px] text-ink focus:outline-none focus:border-cyan-line tabular-nums"
                        />
                        <span className="text-[10px] text-dim">%</span>
                      </span>
                      <button onClick={saveReserveFloor}
                        className="px-3 py-1.5 rounded text-[11px] text-cyan bg-cyan-bg border border-cyan-line hover:bg-[#093341] transition-colors whitespace-nowrap">
                        Save
                      </button>
                    </div>
                    {reserveMintMsg && <p className="text-[11px] text-warn/80 mt-1.5">{reserveMintMsg}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Settings tab */}
            {rightTab === "settings" && (
              <SettingsTab
                walletPublicKey={walletPublicKey}
                walletWorking={walletWorking}
                walletError={walletError}
                onImportClick={() => { setWalletModal({ type: "import" }); setWalletError(null); setImportKeyInput(""); }}
                onCreate={() => handleWalletCreate(false)}
                basket={basket}
                onSaveSettings={saveBasketSettings}
                telegram={telegram}
                telegramToken={telegramToken}
                setTelegramToken={setTelegramToken}
                telegramChatId={telegramChatId}
                setTelegramChatId={setTelegramChatId}
                telegramError={telegramError}
                telegramTesting={telegramTesting}
                telegramTestMsg={telegramTestMsg}
                onSaveTelegram={saveTelegram}
                onDisconnect={disconnectTelegram}
                onTest={testTelegram}
                reportEnabled={reportEnabled}
                reportTime={reportTime}
                setReportTime={setReportTime}
                reportSending={reportSending}
                reportSendMsg={reportSendMsg}
                onSaveSchedule={saveReportSchedule}
                onSendNow={sendReportNow}
              />
            )}
          </div>
        </div>
      </div>

      {/* Basket editor modal */}
      {basketEditorOpen && (
        <Modal title="Configure Basket" onClose={() => setBasketEditorOpen(false)} wide>
          <div className="space-y-4 w-full">

            {/* Token list */}
            {editorTokens.length > 0 && (
              <table className="w-full text-[11px] mb-1">
                <thead>
                  <tr className="text-dim border-b border-divider">
                    <th className="text-left pb-1.5 font-normal">Symbol</th>
                    <th className="text-left pb-1.5 font-normal">Mint</th>
                    <th className="text-right pb-1.5 font-normal w-20">Weight %</th>
                    <th className="pb-1.5 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {editorTokens.map((t, i) => (
                    <tr key={t.mint}>
                      <td className="py-1.5 pr-2">
                        <input
                          value={t.symbol}
                          onChange={(e) => setEditorTokens((prev) => prev.map((x, j) => j === i ? { ...x, symbol: e.target.value } : x))}
                          className="w-20 bg-[#0a1019] border border-cardline rounded px-2 py-0.5 text-ink focus:outline-none focus:border-cyan-line"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-dim">{truncate(t.mint, 5)}</td>
                      <td className="py-1.5 text-right">
                        <input
                          type="number" min="0.1" max="100" step="0.1"
                          value={t.targetWeight}
                          onChange={(e) => setEditorTokens((prev) => prev.map((x, j) => j === i ? { ...x, targetWeight: parseFloat(e.target.value) || 0 } : x))}
                          className="w-16 bg-[#0a1019] border border-cardline rounded px-2 py-0.5 text-right text-ink focus:outline-none focus:border-cyan-line"
                        />
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <button onClick={() => setEditorTokens((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Remove token"
                          className="text-dim hover:text-bad transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Weight total */}
            <div className={`text-[11px] flex items-center gap-1.5 ${Math.abs(editorTotal - 100) < 0.01 ? "text-good" : editorTotal > 100 ? "text-bad" : "text-warn"}`}>
              {Math.abs(editorTotal - 100) < 0.01 ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              Total: {editorTotal.toFixed(1)}% {Math.abs(editorTotal - 100) < 0.01 ? "— ready to save" : `— ${(100 - editorTotal).toFixed(1)}% remaining`}
            </div>

            {/* Add row */}
            <div className="border-t border-divider pt-3 space-y-2">
              <p className="text-[11px] text-muted">Add token</p>
              <div className="flex gap-2">
                <input
                  value={editorMint}
                  onChange={(e) => setEditorMint(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && editorLookupMint()}
                  placeholder="Mint address"
                  className={`${cyInput} flex-1 px-3 py-2`}
                />
                <button onClick={editorLookupMint} disabled={!editorMint.trim() || editorLookingUp}
                  className="px-4 py-2 rounded-lg text-[11px] text-muted hover:text-cyan bg-[#0a1019] border border-cardline hover:border-cyan-line disabled:opacity-50 transition-colors whitespace-nowrap">
                  {editorLookingUp ? "…" : "Lookup"}
                </button>
              </div>
              {editorLookupMsg && <p className="text-[11px] text-warn/80">{editorLookupMsg}</p>}
              <div className="flex gap-2">
                <input
                  value={editorSymbol}
                  onChange={(e) => setEditorSymbol(e.target.value)}
                  placeholder="Symbol"
                  className={`${cyInput} flex-1 px-3 py-2`}
                />
                <input
                  type="number" min="0.1" max="100" step="0.1"
                  value={editorWeight}
                  onChange={(e) => setEditorWeight(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && editorAddRow()}
                  placeholder="Weight %"
                  className="w-28 bg-[#0a1019] border border-cardline rounded-lg px-3 py-2 text-[11px] text-ink placeholder-dim focus:outline-none focus:border-cyan-line"
                />
                <button onClick={editorAddRow}
                  className="px-4 py-2 rounded-lg text-[11px] text-cyan bg-cyan-bg border border-cyan-line hover:bg-[#093341] transition-colors whitespace-nowrap flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {basketError && <p className="text-[11px] text-bad">{basketError}</p>}

            <button
              onClick={saveBasket}
              disabled={editorSaving || Math.abs(editorTotal - 100) > 0.01}
              className="w-full py-2 rounded-lg bg-cyan text-[#04141a] hover:bg-cyan-deep text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {editorSaving ? "Saving…" : "Save Basket"}
            </button>
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {walletModal?.type === "import" && (
        <Modal title="Import Wallet" onClose={() => setWalletModal(null)}>
          <div className="flex items-start gap-2 mb-4 p-3 bg-[#241d08] border border-[#5a4a12] rounded-lg">
            <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <p className="text-xs text-warn/90">
              Your key is sent over HTTP to this server. Only use on localhost or a trusted private network.
            </p>
          </div>
          <label className="block mb-4">
            <span className="text-xs text-muted block mb-1.5">Base58 secret key</span>
            <textarea
              rows={3}
              value={importKeyInput}
              onChange={(e) => setImportKeyInput(e.target.value)}
              placeholder="Paste your base58 secret key…"
              className={`${cyInput} px-3 py-2 resize-none`}
            />
          </label>
          {walletError && <p className="mb-3 text-xs text-bad">{walletError}</p>}
          <button
            onClick={() => handleWalletImport(false)}
            disabled={walletWorking || !importKeyInput.trim()}
            className="w-full py-2 rounded-lg bg-cyan text-[#04141a] hover:bg-cyan-deep text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {walletWorking ? "Importing…" : "Import"}
          </button>
        </Modal>
      )}

      {/* Overwrite confirmation */}
      {walletModal?.type === "confirm" && (
        <Modal title="Replace existing wallet?" onClose={() => setWalletModal(null)}>
          <div className="flex items-start gap-2 mb-5 p-3 bg-[#1a0d10] border border-[#3a1418] rounded-lg">
            <AlertTriangle className="w-4 h-4 text-bad shrink-0 mt-0.5" />
            <p className="text-xs text-bad/90">
              A wallet already exists. Replacing it is <strong>irreversible</strong> — the current keypair file will be overwritten. Make sure you have a backup of the existing key.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setWalletModal(null)}
              className="flex-1 py-2 rounded-lg text-muted hover:text-ink bg-[#0a1019] border border-cardline text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (walletModal.action === "create") handleWalletCreate(true);
                else handleWalletImport(true);
              }}
              disabled={walletWorking}
              className="flex-1 py-2 rounded-lg text-bad bg-[#1a0d10] border border-[#3a1418] hover:bg-[#231013] text-sm font-medium transition-colors disabled:opacity-50"
            >
              {walletWorking ? "Working…" : "Replace"}
            </button>
          </div>
        </Modal>
      )}

      {/* Backup secret key — shown once after generate */}
      {walletModal?.type === "backup" && (
        <Modal title="Back up your secret key" onClose={() => setWalletModal(null)}>
          <div className="flex items-start gap-2 mb-4 p-3 bg-[#241d08] border border-[#5a4a12] rounded-lg">
            <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
            <p className="text-xs text-warn/90">
              This is the <strong>only time</strong> your secret key is shown. Save it somewhere safe — if you lose it you lose access to this wallet.
            </p>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted">Public key</span>
              <CopyButton text={walletModal.publicKey} />
            </div>
            <div className="bg-[#0a1019] border border-cardline rounded-lg px-3 py-2 text-xs text-muted break-all">
              {walletModal.publicKey}
            </div>
          </div>
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted">Secret key (base58)</span>
              <CopyButton text={walletModal.secretKey} />
            </div>
            <div className="bg-[#0a1019] border border-[#5a4a12] rounded-lg px-3 py-2 text-xs text-warn break-all select-all">
              {walletModal.secretKey}
            </div>
          </div>
          <button
            onClick={() => setWalletModal(null)}
            className="w-full py-2 rounded-lg text-good bg-[#0c241c] border border-[#1a4034] hover:bg-[#0f2d23] text-sm font-medium transition-colors"
          >
            I've saved my key
          </button>
        </Modal>
      )}
    </>
  );
}
