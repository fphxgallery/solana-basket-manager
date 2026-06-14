import { KeyRound, Download, Plus, AlertTriangle, Send, Check, RefreshCw, X, Clock, SlidersHorizontal } from "lucide-react";
import type { BasketState } from "../types.ts";
import { truncate, CopyButton } from "../lib.tsx";

interface TelegramInfo { configured: boolean; chatId?: string; reportEnabled: boolean; reportTime: string | null }

export interface SettingsTabProps {
  // wallet
  walletPublicKey: string | null;
  walletWorking: boolean;
  walletError: string | null;
  onImportClick: () => void;
  onCreate: () => void;
  // basket settings
  basket: BasketState | null;
  onSaveSettings: (patch: { driftThresholdPct?: number; rebalanceIntervalHours?: number; minSwapUsd?: number }) => void;
  // telegram
  telegram: TelegramInfo | null;
  telegramToken: string;
  setTelegramToken: (s: string) => void;
  telegramChatId: string;
  setTelegramChatId: (s: string) => void;
  telegramError: string | null;
  telegramTesting: boolean;
  telegramTestMsg: string | null;
  onSaveTelegram: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  // daily report
  reportEnabled: boolean;
  reportTime: string;
  setReportTime: (s: string) => void;
  reportSending: boolean;
  reportSendMsg: string | null;
  onSaveSchedule: (patch: { enabled?: boolean; time?: string }) => void;
  onSendNow: () => void;
}

const input = "w-full bg-[#0a1019] border border-cardline rounded px-2 py-1.5 text-[11px] text-ink placeholder-dim focus:outline-none focus:border-cyan-line";
const ghostBtn = "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-muted hover:text-cyan bg-[#0a1019] border border-cardline hover:border-cyan-line transition-colors disabled:opacity-50";

function Panel({ icon: Icon, title, children }: { icon: typeof KeyRound; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-cardline rounded-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted mb-3">
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      {children}
    </div>
  );
}

export function SettingsTab(p: SettingsTabProps) {
  return (
    <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* LEFT — Wallet + Basket Settings */}
      <div className="space-y-4">
        <Panel icon={KeyRound} title="WALLET">
          {p.walletPublicKey ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-ink">{truncate(p.walletPublicKey, 10)}</span>
                <CopyButton text={p.walletPublicKey} />
              </div>
              <div className="flex gap-2">
                <button onClick={p.onImportClick} className={ghostBtn}><Download className="w-3 h-3" /> Import</button>
                <button onClick={p.onCreate} disabled={p.walletWorking} className={ghostBtn}><Plus className="w-3 h-3" /> New keypair</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-dim mb-3">No wallet configured.</p>
              <div className="flex gap-2">
                <button onClick={p.onImportClick} className={ghostBtn}><Download className="w-3 h-3" /> Import</button>
                <button onClick={p.onCreate} disabled={p.walletWorking} className={ghostBtn}><Plus className="w-3 h-3" /> Generate</button>
              </div>
            </>
          )}
          <div className="mt-3 flex items-start gap-1.5 text-[10px] text-warn/80">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            Generating a new wallet replaces the active keypair.
          </div>
          {p.walletError && <p className="mt-2 text-[11px] text-bad">{p.walletError}</p>}
        </Panel>

        <Panel icon={SlidersHorizontal} title="BASKET SETTINGS">
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] text-dim block mb-1">Drift threshold (%)</span>
              <input type="number" min="1" max="50" step="0.5"
                defaultValue={p.basket?.config.driftThresholdPct ?? 5}
                onBlur={(e) => p.onSaveSettings({ driftThresholdPct: parseFloat(e.target.value) })}
                className={input} />
            </label>
            <label className="block">
              <span className="text-[11px] text-dim block mb-1">Rebalance interval (h)</span>
              <input type="number" min="1" max="168" step="1"
                defaultValue={p.basket?.config.rebalanceIntervalHours ?? 24}
                onBlur={(e) => p.onSaveSettings({ rebalanceIntervalHours: parseFloat(e.target.value) })}
                className={input} />
            </label>
            <label className="block">
              <span className="text-[11px] text-dim block mb-1">Min swap ($)</span>
              <input type="number" min="0" max="100" step="1"
                defaultValue={p.basket?.config.minSwapUsd ?? 5}
                onBlur={(e) => p.onSaveSettings({ minSwapUsd: parseFloat(e.target.value) })}
                className={input} />
            </label>
          </div>
        </Panel>
      </div>

      {/* RIGHT — combined Telegram + Daily Report */}
      <div className="bg-card border border-cardline rounded-card p-4 self-start max-w-[460px] w-full">
        {/* TELEGRAM */}
        <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted mb-3">
          <Send className="w-3.5 h-3.5" /> TELEGRAM
        </div>
        {p.telegram?.configured ? (
          <>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-good" style={{ boxShadow: "0 0 7px var(--good)" }} />
              <span className="text-[11px] text-good">Connected</span>
            </div>
            <div className="text-[11px] text-dim mb-3">Chat ID: {p.telegram.chatId}</div>
            <div className="flex gap-2">
              <button onClick={p.onTest} disabled={p.telegramTesting} className={ghostBtn}>
                {p.telegramTesting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                {p.telegramTestMsg ?? "Test"}
              </button>
              <button onClick={p.onDisconnect} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-bad bg-[#1a0d10] border border-[#3a1418] hover:bg-[#231013] transition-colors">
                <X className="w-3 h-3" /> Disconnect
              </button>
            </div>
          </>
        ) : (
          <>
            <input type="password" placeholder="Bot token" value={p.telegramToken}
              onChange={(e) => p.setTelegramToken(e.target.value)} className={`${input} mb-2`} />
            <input type="text" placeholder="Chat ID" value={p.telegramChatId}
              onChange={(e) => p.setTelegramChatId(e.target.value)} className={`${input} mb-2`} />
            {p.telegramError && <p className="text-[11px] text-bad mb-2">{p.telegramError}</p>}
            <button onClick={p.onSaveTelegram} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-cyan bg-cyan-bg border border-cyan-line hover:bg-[#093341] transition-colors">
              <Check className="w-3 h-3" /> Connect
            </button>
          </>
        )}

        <div className="my-4 h-px bg-divider" />

        {/* DAILY REPORT */}
        <div className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted mb-3">
          <Clock className="w-3.5 h-3.5" /> DAILY REPORT
        </div>
        {!p.telegram?.configured ? (
          <p className="text-[11px] text-dim">Connect Telegram to enable daily reports.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">Scheduled</span>
              <button
                onClick={() => p.onSaveSchedule({ enabled: !p.reportEnabled })}
                className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${p.reportEnabled ? "bg-cyan" : "bg-[#1a2a36]"}`}
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${p.reportEnabled ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            {p.reportEnabled && (
              <label className="block">
                <span className="text-[11px] text-dim block mb-1">Send at (server local time)</span>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-dim absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input type="time" value={p.reportTime}
                    onChange={(e) => p.setReportTime(e.target.value)}
                    onBlur={(e) => p.onSaveSchedule({ time: e.target.value })}
                    className={`${input} pl-7`} />
                </div>
              </label>
            )}
            <button onClick={p.onSendNow} disabled={p.reportSending} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] text-muted hover:text-cyan bg-[#0a1019] border border-cardline hover:border-cyan-line transition-colors disabled:opacity-50">
              {p.reportSending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              {p.reportSendMsg ?? "Send Report Now"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
