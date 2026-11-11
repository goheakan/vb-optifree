import http from "node:http";
import fs from "node:fs";

const keys = {
  groq: process.env.GROQ_API_KEY || "",
  gemini: process.env.GEMINI_API_KEY || "",
  deepseek: process.env.DEEPSEEK_API_KEY || "",
};

const modes = new Set(["groq-ok", "groq-down-gemini-ok", "all-cloud-down"]);
let currentMode = "groq-ok";

function mode() {
  return currentMode;
}

function hop(url) {
  if (url.includes("/groq/")) return "groq";
  if (url.includes("/gemini/")) return "gemini";
  if (url.includes("/deepseek/")) return "deepseek";
  return "";
}

function isDown(name, current) {
  if (current === "groq-down-gemini-ok") return name === "groq";
  if (current === "all-cloud-down") return name === "groq" || name === "gemini" || name === "deepseek";
  return false;
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    if (req.method === "POST" && req.url === "/mode") {
      const next = Buffer.concat(chunks).toString("utf8").trim();
      if (!modes.has(next)) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end('{"error":{"message":"bad mode"}}');
        return;
      }
      currentMode = next;
      fs.writeSync(1, `mode ${currentMode}\n`);
      res.writeHead(204);
      res.end();
      return;
    }
    const name = hop(req.url || "");
    if (!name) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end('{"error":{"message":"unknown hop"}}');
      return;
    }
    const expected = keys[name];
    const auth = req.headers.authorization || "";
    const current = mode();
    const authed = Boolean(expected) && auth === `Bearer ${expected}`;
    const down = isDown(name, current);
    fs.writeSync(1, `hit ${name} ${authed ? "auth-ok" : "auth-bad"} ${current} ${down ? "down" : "up"}\n`);
    if (!authed) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":{"message":"unauthorized"}}');
      return;
    }
    if (down) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"error":{"message":"down","type":"server_error"}}');
      return;
    }
    const content = `FROM-${name.toUpperCase()}`;
    let stream = false;
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      stream = Boolean(parsed && parsed.stream === true);
    } catch {
      stream = false;
    }
    if (stream) {
      const chunk = JSON.stringify({
        id: "mock",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: { content }, finish_reason: null }],
      });
      const done = JSON.stringify({
        id: "mock",
        object: "chat.completion.chunk",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`data: ${chunk}\n\ndata: ${done}\n\ndata: [DONE]\n\n`);
      return;
    }
    const body = JSON.stringify({
      id: "mock",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
});

server.listen(8080, "0.0.0.0");
