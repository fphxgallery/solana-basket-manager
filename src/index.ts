import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.js";
import { router } from "./api.js";
import { requireAuth, loginHandler, logoutHandler } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// No CORS middleware: UI is served same-origin by this server; cross-origin requests stay blocked.
app.use(express.json());

// Auth — login is the only unauthenticated API route
app.post("/api/auth/login", loginHandler);
app.post("/api/auth/logout", logoutHandler);
app.get("/api/auth/check", requireAuth, (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api", requireAuth, router);

// Serve built React client
const clientDist = path.join(__dirname, "../client/dist");
app.use(express.static(clientDist));
app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(CONFIG.PORT, () => {
  console.log("┌─────────────────────────────────────┐");
  console.log(`│  ARB AGENT running                  │`);
  console.log(`│  http://localhost:${CONFIG.PORT}            │`);
  console.log("└─────────────────────────────────────┘");
});
