import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { CONFIG } from "./config.js";

// ── Jupiter Lend Earn venue ────────────────────────────────────────────────────
// Wraps the Jupiter Lend Earn REST API (lite host, no key — same tier as the swap
// API). Modeled as a LendingVenue so a second venue (e.g. Kamino) could be slotted
// in later without touching basket.ts. All amounts are on-chain base units (bigint
// in, string out over the wire).
//
// Endpoints (verified 2026-06-21):
//   GET  /tokens                 → vault list w/ assetAddress, decimals, totalRate (bps), asset.price (USD)
//   GET  /positions?users=<pk>   → per-vault { token{ assetAddress, decimals }, underlyingAssets, shares }
//   POST /deposit  { asset, amount, signer } → { transaction: base64 }  (unsigned)
//   POST /withdraw { asset, amount, signer } → { transaction: base64 }  (unsigned)

export interface LendTokenInfo {
  decimals: number;
  apyPct: number;       // annualized supply+rewards rate, percent (e.g. 6.93)
  priceUsd: number;     // underlying asset USD price per whole token
  vaultAddress: string; // jlToken / position address (used to query earnings)
}

export interface LendPosition {
  underlyingRaw: bigint; // value of the position in underlying base units (principal + accrued)
  decimals: number;
}

export interface LendOpResult {
  ok: boolean;
  sig?: string;
  error?: string;
}

interface VaultEntry {
  address: string;   // jlToken / vault address
  assetAddress: string;
  decimals: number;
  totalRate: string; // bps as string, e.g. "693"
  asset?: { price?: string };
}

interface PositionEntry {
  token: { assetAddress: string; decimals: number };
  underlyingAssets: string;
}

// ── Resilient reads ─────────────────────────────────────────────────────────────
// The lite Lend host is shared/no-key: it rate-limits (429) and times out (504).
// Reads retry with backoff, then fall back to a short per-endpoint cache so a burst
// of failures never drops the lent balance out of accounting.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_TRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lendGet<T>(path: string): Promise<T> {
  const name = path.split("?")[0];
  let lastErr = name;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${CONFIG.JUPITER_LEND_BASE_URL}${path}`);
    } catch (e) {
      lastErr = `${name} ${e instanceof Error ? e.message : e}`;
    }
    if (res?.ok) return (await res.json()) as T;
    if (res) lastErr = `${name} ${res.status}`;
    const retryable = !res || RETRYABLE.has(res.status);
    if (!retryable || attempt === MAX_TRIES - 1) break;
    // Honor Retry-After (429s often send it); else exponential backoff.
    const retryAfter = res ? Number(res.headers.get("retry-after")) : 0;
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1) ** 2);
  }
  throw new Error(`lend ${lastErr}`);
}

// Per-endpoint cache, keyed by full path (so per-owner). On fetch failure it serves
// the last good value (stale-on-error) — a transient 429/504 burst stays invisible to
// pricing/weights. TTL > refresh interval (3 min) so most refreshes are served cached.
const cache = new Map<string, { at: number; value: unknown }>();
async function lendGetCached<T>(path: string, ttlMs: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    const value = await lendGet<T>(path);
    cache.set(path, { at: Date.now(), value });
    return value;
  } catch (e) {
    if (hit) {
      const ageS = Math.round((Date.now() - hit.at) / 1000);
      console.warn(`[lending] ${path.split("?")[0]} failed (${e instanceof Error ? e.message : e}) — serving cached ${ageS}s old`);
      return hit.value as T;
    }
    throw e;
  }
}

const READ_TTL_MS = 4 * 60_000;

async function fetchVaults(): Promise<VaultEntry[]> {
  return lendGetCached<VaultEntry[]>("/tokens", READ_TTL_MS);
}

export interface LendingVenue {
  /** Token economics for an underlying mint, or null if no vault exists for it. */
  getTokenInfo(mint: string): Promise<LendTokenInfo | null>;
  /** Current lent position for owner in an underlying mint (zero if none). */
  getPosition(owner: PublicKey, mint: string): Promise<LendPosition>;
  /** Cumulative lifetime earnings for owner in a vault, in underlying base units. */
  getEarnings(owner: PublicKey, vaultAddress: string): Promise<bigint>;
  /** Build, sign, send and confirm a deposit of amountRaw underlying base units. */
  deposit(connection: Connection, keypair: Keypair, mint: string, amountRaw: bigint): Promise<LendOpResult>;
  /** Build, sign, send and confirm a withdraw of amountRaw underlying base units. */
  withdraw(connection: Connection, keypair: Keypair, mint: string, amountRaw: bigint): Promise<LendOpResult>;
}

async function buildAndSend(
  connection: Connection,
  keypair: Keypair,
  path: "deposit" | "withdraw",
  mint: string,
  amountRaw: bigint,
): Promise<LendOpResult> {
  try {
    const res = await fetch(`${CONFIG.JUPITER_LEND_BASE_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: mint, amount: amountRaw.toString(), signer: keypair.publicKey.toBase58() }),
    });
    if (!res.ok) {
      return { ok: false, error: `lend ${path} build ${res.status}: ${await res.text()}` };
    }
    const { transaction } = (await res.json()) as { transaction?: string };
    if (!transaction) return { ok: false, error: `lend ${path}: no transaction in response` };

    const tx = VersionedTransaction.deserialize(Buffer.from(transaction, "base64"));
    tx.sign([keypair]);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    console.log(`[lending] ${path} sent: ${sig}`);

    const conf = await connection.confirmTransaction(sig, "confirmed");
    if (conf.value.err) {
      return { ok: false, sig, error: `lend ${path} failed on-chain: ${JSON.stringify(conf.value.err)}` };
    }
    console.log(`[lending] ${path} confirmed: ${sig}`);
    // Our position just changed — drop the cached /positions so the next read is fresh.
    cache.delete(`/positions?users=${keypair.publicKey.toBase58()}`);
    return { ok: true, sig };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const jupiterLend: LendingVenue = {
  async getTokenInfo(mint) {
    const vaults = await fetchVaults();
    const v = vaults.find((x) => x.assetAddress === mint);
    if (!v) return null;
    return {
      decimals: v.decimals,
      apyPct: (Number(v.totalRate) || 0) / 100, // bps → percent
      priceUsd: Number(v.asset?.price) || 0,
      vaultAddress: v.address,
    };
  },

  async getEarnings(owner, vaultAddress) {
    const rows = await lendGetCached<Array<{ address: string; earnings: number | string }>>(
      `/earnings?user=${owner.toBase58()}&positions=${vaultAddress}`,
      READ_TTL_MS,
    );
    const r = rows.find((x) => x.address === vaultAddress);
    return r ? BigInt(Math.round(Number(r.earnings))) : 0n;
  },

  async getPosition(owner, mint) {
    const positions = await lendGetCached<PositionEntry[]>(
      `/positions?users=${owner.toBase58()}`,
      READ_TTL_MS,
    );
    const p = positions.find((x) => x.token?.assetAddress === mint);
    if (!p) return { underlyingRaw: 0n, decimals: 6 };
    return { underlyingRaw: BigInt(p.underlyingAssets || "0"), decimals: p.token.decimals };
  },

  deposit(connection, keypair, mint, amountRaw) {
    return buildAndSend(connection, keypair, "deposit", mint, amountRaw);
  },

  withdraw(connection, keypair, mint, amountRaw) {
    return buildAndSend(connection, keypair, "withdraw", mint, amountRaw);
  },
};
