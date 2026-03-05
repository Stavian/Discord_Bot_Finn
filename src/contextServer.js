const http = require("http");
const fs = require("fs");
const path = require("path");
const { BASE_DIR } = require("./config");

const CONTEXT_FILE = path.join(BASE_DIR, "world_context.json");
const PORT = parseInt(process.env.CONTEXT_PORT) || 3001;

function startContextServer() {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/context") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          data.timestamp = new Date().toISOString();
          fs.writeFileSync(CONTEXT_FILE, JSON.stringify(data, null, 2), "utf8");
          console.log("[context] world_context.json aktualisiert:", data.context_summary || "(kein summary)");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error("[context] Fehler beim Schreiben:", err.message);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[context] Context-Server läuft auf 0.0.0.0:${PORT}`);
  });

  server.on("error", err => {
    console.error("[context] Server-Fehler:", err.message);
  });
}

module.exports = { startContextServer };
