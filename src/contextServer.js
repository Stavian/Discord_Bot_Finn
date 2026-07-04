"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { BASE_DIR } = require("./config");

// world_context.json is written atomically (temp + rename) so a crash mid-write
// never leaves a half-written file that ai.js would fail to parse.
const CONTEXT_FILE = path.join(BASE_DIR, "world_context.json");
const TMP_FILE = CONTEXT_FILE + ".tmp";

const PORT = parseInt(process.env.CONTEXT_PORT) || 3001;
const TOKEN = process.env.CONTEXT_TOKEN || "";      // shared secret; if set, POST requires it
const MAX_BODY = 64 * 1024;                          // 64 KB request cap
const MIN_SUMMARY_LEN = 5;

function readContext() {
  try { return JSON.parse(fs.readFileSync(CONTEXT_FILE, "utf8")); }
  catch { return null; }
}

function writeContextAtomic(obj) {
  fs.writeFileSync(TMP_FILE, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(TMP_FILE, CONTEXT_FILE);
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(body);
}

function ageSeconds(ctx) {
  if (!ctx || !ctx.timestamp) return null;
  return Math.round((Date.now() - new Date(ctx.timestamp).getTime()) / 1000);
}

function startContextServer() {
  const startedAt = Date.now();

  const server = http.createServer((req, res) => {
    // Every handler runs inside try/catch so a bad request can never crash the bot.
    try {
      // ---- GET /health ----
      if (req.method === "GET" && req.url === "/health") {
        const ctx = readContext();
        return send(res, 200, {
          ok: true,
          uptime_s: Math.round((Date.now() - startedAt) / 1000),
          has_context: !!ctx,
          last_update: ctx ? ctx.timestamp : null,
          age_s: ageSeconds(ctx),
        });
      }

      // ---- GET /context (inspect) ----
      if (req.method === "GET" && req.url === "/context") {
        const ctx = readContext();
        if (!ctx) return send(res, 404, { ok: false, error: "no context yet" });
        return send(res, 200, { ok: true, age_s: ageSeconds(ctx), context: ctx });
      }

      // ---- POST /context (n8n pushes here) ----
      if (req.method === "POST" && req.url === "/context") {
        if (TOKEN && req.headers["x-context-token"] !== TOKEN) {
          console.warn("[context] 401 ungueltiger/fehlender Token von", req.socket.remoteAddress);
          return send(res, 401, { ok: false, error: "unauthorized" });
        }
        const ct = (req.headers["content-type"] || "").toLowerCase();
        if (!ct.includes("application/json")) {
          return send(res, 415, { ok: false, error: "content-type must be application/json" });
        }

        let body = "";
        let tooBig = false;
        req.on("data", chunk => {
          body += chunk;
          if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
        });
        req.on("error", err => {
          console.error("[context] request error:", err.message);
        });
        req.on("end", () => {
          if (tooBig) { try { send(res, 413, { ok: false, error: "body too large" }); } catch {} return; }
          let data;
          try { data = JSON.parse(body); }
          catch { return send(res, 400, { ok: false, error: "invalid JSON" }); }

          const summary = typeof data.context_summary === "string" ? data.context_summary.trim() : "";
          if (summary.length < MIN_SUMMARY_LEN) {
            // keep last good context instead of overwriting with junk
            console.warn("[context] 422 context_summary fehlt/zu kurz, behalte letzten Stand");
            return send(res, 422, { ok: false, error: "context_summary missing or too short (kept previous)" });
          }

          const record = {
            context_summary: summary,
            weather: data.weather != null ? data.weather : null,
            day: data.day != null ? data.day : null,
            headlines: Array.isArray(data.headlines) ? data.headlines.slice(0, 5) : [],
            source: data.source != null ? data.source : "n8n",
            timestamp: new Date().toISOString(),
          };
          try {
            writeContextAtomic(record);
            console.log("[context] aktualisiert:", summary.slice(0, 120));
            return send(res, 200, { ok: true });
          } catch (err) {
            console.error("[context] Schreibfehler:", err.message);
            return send(res, 500, { ok: false, error: "write failed" });
          }
        });
        return;
      }

      return send(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      console.error("[context] handler crash abgefangen:", err.message);
      try { send(res, 500, { ok: false, error: "internal" }); } catch {}
    }
  });

  server.on("error", err => console.error("[context] Server-Fehler:", err.message));
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[context] Context-Server v2 laeuft auf 0.0.0.0:${PORT} (auth: ${TOKEN ? "an" : "aus"})`);
  });
}

module.exports = { startContextServer };
