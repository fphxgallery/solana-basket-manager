import fs from "fs";
import path from "path";
import { basketStore } from "./basket-store.js";
import { store } from "./store.js";
import { getSolUsd } from "./value-history.js";

const CONFIG_PATH = path.resolve(process.env.DATA_DIR ?? "./data", "telegram.json");

interface TelegramConfig {
  token: string;
  chatId: string;
  reportEnabled?: boolean;
  reportTime?: string | null; // "HH:MM" 24h, server local time
}

let config: TelegramConfig | null = null;

function load(): TelegramConfig | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as TelegramConfig;
    }
  } catch { /* ignore */ }
  return null;
}

function save(cfg: TelegramConfig | null) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    if (cfg) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    } else {
      try { fs.unlinkSync(CONFIG_PATH); } catch { /* already gone */ }
    }
  } catch (e) {
    console.error("[telegram] save failed:", e);
  }
}

config = load();

export function setTelegramConfig(token: string, chatId: string) {
  config = { ...(config ?? {}), token, chatId };
  save(config);
}

export function clearTelegramConfig() {
  config = null;
  save(null);
}

export function getTelegramStatus(): {
  configured: boolean;
  chatId?: string;
  reportEnabled: boolean;
  reportTime: string | null;
} {
  return {
    configured: !!config?.token,
    chatId: config?.chatId,
    reportEnabled: config?.reportEnabled ?? false,
    reportTime: config?.reportTime ?? null,
  };
}

export function setReportSchedule(enabled: boolean, time: string | null) {
  if (!config) return; // no-op if telegram not configured
  config = { ...config, reportEnabled: enabled, reportTime: time };
  save(config);
}

export function getReportSchedule(): { enabled: boolean; time: string | null } {
  return {
    enabled: config?.reportEnabled ?? false,
    time: config?.reportTime ?? null,
  };
}

/** Fire-and-forget Telegram message. Silently swallows errors. */
export async function notify(message: string): Promise<void> {
  if (!config?.token || !config?.chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, text: message, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[telegram] send failed:", err);
    }
  } catch (e) {
    console.error("[telegram] notify failed:", e);
  }
}

/** Send a rich message (Bot API 10.1+). Falls back to plain notify on error. */
async function notifyRich(message: string): Promise<void> {
  if (!config?.token || !config?.chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.token}/sendRichMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: config.chatId, rich_message: { html: message } }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn("[telegram] sendRichMessage failed, falling back to sendMessage:", err);
      await notify(message);
    }
  } catch (e) {
    console.error("[telegram] notifyRich failed:", e);
  }
}

/** Send the daily portfolio report. */
export async function sendDailyReport(): Promise<void> {
  if (!config?.token || !config?.chatId) return;

  const { holdings, totalValueSol, totalValueUsd, baselineTimestamp, pnlUsd, pnlPctUsd, hwmValueUsd, hwmCapturedAt, lentValueUsd, lendApy } = basketStore;
  const basketConfig = basketStore.config;
  const solUsd = await getSolUsd();
  const walletSol = store.walletBalanceSol;

  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let msg = `<h3>📊 Daily Report — ${date}</h3>`;

  if (totalValueUsd > 0) {
    let line = `💼 <b>$${totalValueUsd.toFixed(2)}</b>`;
    const parts: string[] = [];
    if (totalValueSol > 0) parts.push(`${totalValueSol.toFixed(4)} SOL`);
    if (solUsd > 0) parts.push(`SOL $${solUsd.toFixed(2)}`);
    if (parts.length) line += ` <i>· ${parts.join(" · ")}</i>`;
    msg += `<p>${line}</p>`;
  } else if (solUsd > 0) {
    msg += `<p>💲 <i>SOL $${solUsd.toFixed(2)}</i></p>`;
  }

  if (basketConfig.lendEnabled && lentValueUsd > 0) {
    msg += `<p>🌱 <b>Lent $${lentValueUsd.toFixed(2)}</b> <i>· ${lendApy.toFixed(2)}% APY</i></p>`;
  }

  if (pnlUsd != null && pnlPctUsd != null) {
    const icon = pnlUsd >= 0 ? "📈" : "📉";
    const arrow = pnlUsd >= 0 ? "▲" : "▼";
    const pctStr = pnlPctUsd >= 0 ? `+${pnlPctUsd.toFixed(2)}%` : `${pnlPctUsd.toFixed(2)}%`;
    let note = pctStr;
    if (baselineTimestamp) {
      const since = new Date(baselineTimestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      note += ` · since ${since}`;
    }
    msg += `<p>${icon} <b>${arrow}$${Math.abs(pnlUsd).toFixed(2)}</b> <i>(${note})</i></p>`;
  }

  if (basketConfig.hwmEnabled && hwmValueUsd != null && hwmCapturedAt != null) {
    const elapsedDays = (Date.now() - hwmCapturedAt) / 86_400_000;
    const halfLife = basketConfig.hwmHalfLifeDays ?? 7;
    const toHalfLife = halfLife - elapsedDays;
    const timeStr = toHalfLife > 0
      ? (toHalfLife >= 1 ? `${toHalfLife.toFixed(1)}d` : `${(toHalfLife * 24).toFixed(0)}h`) + " to ½"
      : "past ½-life";
    msg += `<p>🏔 <b>Peak $${hwmValueUsd.toFixed(2)}</b> <i>· ${timeStr}</i></p>`;
  }

  if (walletSol != null) {
    let line = `🏦 <b>${walletSol.toFixed(4)} SOL</b>`;
    if (solUsd > 0) line += ` <i>($${(walletSol * solUsd).toFixed(2)})</i>`;
    msg += `<p>${line}</p>`;
  }

  if (holdings.length > 0) {
    msg += `\n<table bordered striped>\n`;
    msg += `<tr><th>Symbol</th><th align="right">Current</th><th align="right">Target</th><th align="right">Drift</th></tr>\n`;
    for (const h of holdings) {
      const drift = h.driftPct >= 0 ? `+${h.driftPct.toFixed(1)}%` : `${h.driftPct.toFixed(1)}%`;
      msg += `<tr><td>${h.symbol}</td><td align="right">${h.currentWeight.toFixed(1)}%</td><td align="right">${h.targetWeight.toFixed(1)}%</td><td align="right">${drift}</td></tr>\n`;
    }
    msg += `</table>`;
  }

  await notifyRich(msg);
}
