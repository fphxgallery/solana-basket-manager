import { useEffect, useState } from "react";

// Token logos come from Jupiter's token search API, keyed by mint. Results are
// cached at module scope (and in-flight requests deduped) so the table can
// render the same mint many times without re-fetching. A cyan duotone overlay
// (grayscale + mix-blend cyan + inset ring) keeps every logo on-theme.

const iconCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchIcon(mint: string): Promise<string | null> {
  const cached = iconCache.get(mint);
  if (cached !== undefined) return cached;
  const pending = inflight.get(mint);
  if (pending) return pending;

  const p = (async () => {
    try {
      const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
      if (!res.ok) throw new Error(`jup ${res.status}`);
      const arr = (await res.json()) as Array<{ id: string; icon?: string }>;
      const hit = arr.find((t) => t.id === mint) ?? arr[0];
      const url = hit?.icon ?? null;
      iconCache.set(mint, url);
      return url;
    } catch {
      iconCache.set(mint, null);
      return null;
    } finally {
      inflight.delete(mint);
    }
  })();
  inflight.set(mint, p);
  return p;
}

export function TokenIcon({ mint, symbol, size = 20 }: { mint: string; symbol: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(() => iconCache.get(mint) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetchIcon(mint).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [mint]);

  const showImg = !!url && !failed;
  return (
    <span
      className="relative inline-flex items-center justify-center flex-none overflow-hidden rounded-full"
      style={{ width: size, height: size, background: "#0e1c28" }}
      title={symbol}
    >
      {showImg ? (
        <>
          <img
            src={url!}
            alt=""
            onError={() => setFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(1) contrast(1.05) brightness(1.05)" }}
          />
          <span className="absolute inset-0" style={{ background: "#22d3ee", mixBlendMode: "color" }} />
          <span className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(34,211,238,0.55)" }} />
        </>
      ) : (
        <span className="font-bold text-cyan leading-none" style={{ fontSize: size * 0.42 }}>
          {symbol.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
