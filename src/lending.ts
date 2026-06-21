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
  apyPct: number;     // annualized supply+rewards rate, percent (e.g. 6.93)
  priceUsd: number;   // underlying asset USD price per whole token
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
  assetAddress: string;
  decimals: number;
  totalRate: string; // bps as string, e.g. "693"
  asset?: { price?: string };
}

interface PositionEntry {
  token: { assetAddress: string; decimals: number };
  underlyingAssets: string;
}

// /tokens changes slowly (rates, price) — cache briefly so a refresh + reconcile in
// the same cycle don't double-fetch.
let tokensCache: { at: number; vaults: VaultEntry[] } | null = null;
const TOKENS_TTL_MS = 60_000;

async function fetchVaults(): Promise<VaultEntry[]> {
  if (tokensCache && Date.now() - tokensCache.at < TOKENS_TTL_MS) return tokensCache.vaults;
  const res = await fetch(`${CONFIG.JUPITER_LEND_BASE_URL}/tokens`);
  if (!res.ok) throw new Error(`lend /tokens ${res.status}`);
  const vaults = (await res.json()) as VaultEntry[];
  tokensCache = { at: Date.now(), vaults };
  return vaults;
}

export interface LendingVenue {
  /** Token economics for an underlying mint, or null if no vault exists for it. */
  getTokenInfo(mint: string): Promise<LendTokenInfo | null>;
  /** Current lent position for owner in an underlying mint (zero if none). */
  getPosition(owner: PublicKey, mint: string): Promise<LendPosition>;
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
    };
  },

  async getPosition(owner, mint) {
    const res = await fetch(`${CONFIG.JUPITER_LEND_BASE_URL}/positions?users=${owner.toBase58()}`);
    if (!res.ok) throw new Error(`lend /positions ${res.status}`);
    const positions = (await res.json()) as PositionEntry[];
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
