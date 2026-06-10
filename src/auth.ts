import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { CONFIG } from "./config.js";

const COOKIE_NAME = "arb_auth";
const COOKIE_MAX_AGE_S = 30 * 24 * 3600;

function tokenMatches(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(CONFIG.API_TOKEN);
  // length check first — timingSafeEqual throws on mismatched lengths
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookieToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const candidate = bearer ?? cookieToken(req);
  if (candidate && tokenMatches(candidate)) { next(); return; }
  res.status(401).json({ error: "unauthorized" });
}

export function loginHandler(req: Request, res: Response) {
  const { token } = req.body as { token?: string };
  if (typeof token !== "string" || !tokenMatches(token.trim())) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token.trim())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE_S}`,
  );
  res.json({ ok: true });
}

export function logoutHandler(_req: Request, res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
}
