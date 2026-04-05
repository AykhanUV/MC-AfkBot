const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

function createWebServer(port, botManager, configManager) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" },
  });

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  // ========================
  // REST API Routes
  // ========================

  app.get("/api/status", (req, res) => {
    res.json(botManager.getStatus());
  });

  app.get("/api/config", (req, res) => {
    res.json(configManager.get());
  });

  app.put("/api/config", (req, res) => {
    const result = configManager.update(req.body);
    if (result.success) {
      io.emit("config:current", configManager.get());
    }
    res.json(result);
  });

  app.post("/api/connect", (req, res) => {
    const result = botManager.connect();
    res.json(result);
  });

  app.post("/api/disconnect", (req, res) => {
    const result = botManager.disconnect();
    res.json(result);
  });

  app.get("/api/inventory", (req, res) => {
    res.json(botManager.getInventory());
  });

  app.post("/api/chat", (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    const result = botManager.sendChat(message);
    res.json(result);
  });

  app.post("/api/toggle-mining", (req, res) => {
    const result = botManager.toggleMining();
    res.json(result);
  });

  app.get("/api/server-status", async (req, res) => {
    const config = configManager.get();
    const result = await botManager.pingServer(
      config.server.ip,
      config.server.port,
    );
    res.json(result);
  });

  app.get("/api/logs", (req, res) => {
    res.json(botManager.getLogs());
  });

  app.get("/api/chat-log", (req, res) => {
    res.json(botManager.getChatLog());
  });

  // Fallback - serve index.html for SPA (Express 5 compatible)
  app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) {
      res.sendFile(path.join(__dirname, "..", "public", "index.html"));
    } else {
      next();
    }
  });

  // ========================
  // Socket.IO
  // ========================

  io.on("connection", (socket) => {
    console.log(`[WebServer] Client connected: ${socket.id}`);

    // Send current state immediately
    socket.emit("config:current", configManager.get());
    socket.emit("bot:status", botManager.getStatus());
    socket.emit("bot:inventory", botManager.getInventory());

    // Ping server status on connect
    const config = configManager.get();
    botManager
      .pingServer(config.server.ip, config.server.port)
      .then((status) => {
        socket.emit("server:status", status);
      });

    // Client events
    socket.on("bot:connect", () => {
      const result = botManager.connect();
      if (!result.success) {
        socket.emit("bot:log", {
          level: "error",
          message: result.error,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on("bot:disconnect", () => {
      botManager.disconnect();
    });

    socket.on("config:get", () => {
      socket.emit("config:current", configManager.get());
    });

    socket.on("config:update", (data) => {
      const result = configManager.update(data.config || data);
      if (result.success) {
        io.emit("config:current", configManager.get());
      }
      socket.emit("config:update:result", result);
    });

    socket.on("bot:send-chat", (data) => {
      const result = botManager.sendChat(data.message);
      if (!result.success) {
        socket.emit("bot:log", {
          level: "error",
          message: `Failed to send chat: ${result.error}`,
          timestamp: new Date().toISOString(),
        });
      }
    });

    socket.on("bot:toggle-mining", () => {
      const result = botManager.toggleMining();
      if (result.success) {
        io.emit("bot:status", botManager.getStatus());
      }
    });

    socket.on("server:ping", async () => {
      const config = configManager.get();
      const status = await botManager.pingServer(
        config.server.ip,
        config.server.port,
      );
      socket.emit("server:status", status);
    });

    socket.on("disconnect", () => {
      console.log(`[WebServer] Client disconnected: ${socket.id}`);
    });
  });

  // ========================
  // Relay BotManager events to all Socket.IO clients
  // ========================

  botManager.on("status", (status) => {
    io.emit("bot:status", status);
  });

  botManager.on("chat", (entry) => {
    io.emit("bot:chat", entry);
  });

  botManager.on("inventory", (items) => {
    io.emit("bot:inventory", items);
  });

  botManager.on("log", (entry) => {
    io.emit("bot:log", entry);
  });

  botManager.on("connected", () => {
    io.emit("bot:connected", {});
    io.emit("bot:status", botManager.getStatus());
  });

  botManager.on("disconnected", (data) => {
    io.emit("bot:disconnected", data);
    io.emit("bot:status", botManager.getStatus());
    io.emit("bot:inventory", []);
  });

  // Periodic server status ping (every 30s)
  setInterval(async () => {
    try {
      const config = configManager.get();
      const status = await botManager.pingServer(
        config.server.ip,
        config.server.port,
      );
      io.emit("server:status", status);
    } catch (e) {
      /* ignore */
    }
  }, 30000);

  // Start server
  server.listen(port, "0.0.0.0", () => {
    console.log(
      `[WebServer] Control panel running at http://localhost:${port}`,
    );
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[WebServer] Port ${port} is already in use!`);
    } else {
      console.error(`[WebServer] Server error: ${err.message}`);
    }
  });

  return { app, server, io };
}

module.exports = { createWebServer };
