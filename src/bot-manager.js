const EventEmitter = require("events");
const dns = require("dns");
const { createBot } = require("./bot");
const util = require("minecraft-server-util");

/**
 * Attempt SRV record lookup for a Minecraft hostname.
 * Returns { host, port } from the SRV record, or null if none found.
 */
function resolveSrv(hostname) {
  return new Promise((resolve) => {
    dns.resolveSrv(`_minecraft._tcp.${hostname}`, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        return resolve(null);
      }
      // Pick the highest-priority (lowest number) record
      addresses.sort((a, b) => a.priority - b.priority);
      resolve({ host: addresses[0].name, port: addresses[0].port });
    });
  });
}

class BotManager extends EventEmitter {
  constructor(configManager) {
    super();
    this.configManager = configManager;
    this.bot = null;
    this.connected = false;
    this.connecting = false;
    this.chatLog = [];
    this.logs = [];
    this.statusInterval = null;
    this.reconnectTimeout = null;
    this.connectionTimeout = null;
    this.autoReconnectEnabled = true;
    this.startTime = null;
    this.maxLogs = 500;
    this.maxChatLog = 300;
    this._lastError = null; // Track the real error before 'end' fires
  }

  addLog(level, message, module = "System") {
    const entry = {
      level,
      message,
      module,
      timestamp: new Date().toISOString(),
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    this.emit("log", entry);
  }

  connect() {
    if (this.bot || this.connecting) {
      this.addLog("warn", "Bot is already connected or connecting.");
      return { success: false, error: "Already connected or connecting" };
    }

    this.connecting = true;
    this._lastError = null;
    this.autoReconnectEnabled = true;

    // Emit connecting status immediately so the UI updates
    this.emit("status", this.getStatus());

    // Kick off async connection (SRV resolution then bot creation)
    this._doConnect().catch((err) => {
      this.addLog("error", `Connection error: ${err.message}`, "System");
      this._cleanup();
      this.emit("disconnected", { reason: err.message });
      this.emit("status", this.getStatus());
    });

    return { success: true };
  }

  async _doConnect() {
    const config = this.configManager.get();
    const runtimeState = this.configManager.loadRuntimeState();

    let host = config.server.ip;
    let port = config.server.port;

    // Try SRV record lookup first — this is how Minecraft clients resolve
    // hostnames like "play.example.com" that use SRV DNS records to point
    // to the real server IP and port.
    const isIpAddress =
      /^[\d.]+$/.test(host) || host === "localhost" || host.startsWith("[");
    if (!isIpAddress) {
      this.addLog("info", `Resolving ${host}...`);
      try {
        const srv = await resolveSrv(host);
        if (srv) {
          this.addLog("info", `SRV record found: ${srv.host}:${srv.port}`);
          host = srv.host;
          port = srv.port;
        }
      } catch (e) {
        // SRV lookup failed, continue with original host — direct connect
      }
    }

    this.addLog(
      "info",
      `Connecting to ${host}:${port} (v${config.server.version || "auto"})...`,
    );

    // Build a modified config with the resolved host/port
    const resolvedConfig = {
      ...config,
      server: { ...config.server, ip: host, port: port },
    };

    try {
      this.bot = createBot(resolvedConfig, runtimeState);
    } catch (err) {
      this.connecting = false;
      this.bot = null;
      this.addLog("error", `Failed to create bot: ${err.message}`);
      this.emit("status", this.getStatus());
      throw err;
    }

    // Connection timeout — if we don't get 'spawn' within 30s, give up
    this.connectionTimeout = setTimeout(() => {
      if (this.connecting && !this.connected) {
        this._lastError =
          "Connection timed out after 30 seconds — check server IP, port, and version";
        this.addLog("error", this._lastError, "Bot");
        if (this.bot) {
          try {
            this.bot.removeAllListeners();
          } catch (e) {
            /* ignore */
          }
          try {
            this.bot.quit();
          } catch (e) {
            /* ignore */
          }
        }
        this._cleanup();
        this.emit("disconnected", { reason: this._lastError });
        this.emit("status", this.getStatus());
      }
    }, 30000);

    this._setupBotListeners(config);
  }

  disconnect() {
    this.autoReconnectEnabled = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.bot) {
      this.addLog("info", "Disconnecting bot...");
      try {
        this.bot.quit();
      } catch (err) {
        this.addLog("warn", `Error during disconnect: ${err.message}`);
      }
      this._cleanup();
      this.emit("disconnected", { reason: "Manual disconnect" });
      this.emit("status", this.getStatus());
    }
    return { success: true };
  }

  _cleanup() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    this.bot = null;
    this.connected = false;
    this.connecting = false;
    this.startTime = null;
  }

  _setupBotListeners(config) {
    const bot = this.bot;
    if (!bot) return;

    bot.once("spawn", () => {
      this.connected = true;
      this.connecting = false;
      this._lastError = null;
      this.startTime = Date.now();

      // Clear connection timeout — we made it
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      this.addLog(
        "info",
        `Bot spawned as "${bot.username}" in ${bot.game?.gameMode || "unknown"} mode.`,
        "Bot",
      );
      this.emit("connected");

      // Start periodic status/inventory updates
      this.statusInterval = setInterval(() => {
        if (this.bot && this.connected) {
          this.emit("status", this.getStatus());
          this.emit("inventory", this.getInventory());
        }
      }, 2000);

      // Emit initial status
      setTimeout(() => {
        if (this.bot && this.connected) {
          this.emit("status", this.getStatus());
          this.emit("inventory", this.getInventory());
        }
      }, 500);
    });

    bot.on("chat", (username, message) => {
      const entry = { username, message, timestamp: new Date().toISOString() };
      this.chatLog.push(entry);
      if (this.chatLog.length > this.maxChatLog) this.chatLog.shift();
      this.emit("chat", entry);
    });

    bot.on("health", () => {
      if (this.bot && this.connected) {
        this.emit("status", this.getStatus());
      }
    });

    bot.on("playerJoined", (player) => {
      if (player.username !== bot.username) {
        this.addLog(
          "info",
          `Player ${player.username} joined the server.`,
          "Server",
        );
      }
    });

    bot.on("playerLeft", (player) => {
      if (player.username !== bot.username) {
        this.addLog(
          "info",
          `Player ${player.username} left the server.`,
          "Server",
        );
      }
    });

    bot.on("death", () => {
      this.addLog("warn", "Bot died and respawned.", "Bot");
    });

    bot.on("kicked", (reason) => {
      let reasonText = reason;
      try {
        if (typeof reason === "object") reasonText = JSON.stringify(reason);
      } catch (e) {
        /* ignore */
      }
      // Store as last error so the 'end' handler can use it
      this._lastError = `Kicked: ${reasonText}`;
      this.addLog("error", `Bot was kicked: ${reasonText}`, "Server");
    });

    // The 'error' event fires BEFORE 'end' with the real reason
    // (ECONNREFUSED, ETIMEDOUT, version mismatch, etc.)
    // We capture it so we can show it instead of the useless "socketClosed"
    bot.on("error", (err) => {
      this._lastError = this._humanizeError(err);
      this.addLog("error", `Bot error: ${this._lastError}`, "Bot");
    });

    bot.on("end", (reason) => {
      const wasConnected = this.connected;
      const wasConnecting = this.connecting;
      this._cleanup();

      // Build a useful disconnect reason:
      // Priority: _lastError (real error) > reason > generic message
      let reasonStr;
      if (this._lastError) {
        reasonStr = this._lastError;
      } else if (reason && reason !== "socketClosed") {
        reasonStr = reason;
      } else if (!wasConnected && wasConnecting) {
        reasonStr =
          "Connection failed — server may be offline, wrong port, or incompatible version";
      } else {
        reasonStr = reason || "Disconnected";
      }

      if (wasConnected) {
        this.addLog("info", `Bot disconnected: ${reasonStr}`, "Bot");
      } else if (wasConnecting) {
        this.addLog("error", `Connection failed: ${reasonStr}`, "Bot");
      }

      this.emit("disconnected", { reason: reasonStr });
      this.emit("status", this.getStatus());

      // Reset last error
      this._lastError = null;

      // Auto-reconnect logic
      if (this.autoReconnectEnabled && config.utils["auto-reconnect"]) {
        const delay = (config.utils["auto-reconnect-delay"] || 10) * 1000;
        this.addLog(
          "info",
          `Auto-reconnecting in ${delay / 1000}s...`,
          "System",
        );
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          if (this.autoReconnectEnabled) {
            this.connect();
          }
        }, delay);
      }
    });

    // Listen for message events (system messages, not just chat)
    bot.on("message", (jsonMsg) => {
      try {
        const text = jsonMsg.toString();
        if (text && text.trim()) {
          const isPlayerChat = jsonMsg.translate === "chat.type.text";
          if (!isPlayerChat) {
            this.addLog("info", `[Server] ${text}`, "Server");
          }
        }
      } catch (e) {
        /* ignore parse errors */
      }
    });
  }

  /**
   * Translate raw Node/mineflayer errors into human-readable messages.
   */
  _humanizeError(err) {
    const msg = err.message || String(err);
    const code = err.code || "";

    if (code === "ECONNREFUSED" || msg.includes("ECONNREFUSED")) {
      return "Connection refused — server is not running or wrong port";
    }
    if (code === "ECONNRESET" || msg.includes("ECONNRESET")) {
      return "Connection reset by server — may be a version mismatch or server issue";
    }
    if (code === "ETIMEDOUT" || msg.includes("ETIMEDOUT")) {
      return "Connection timed out — server is unreachable";
    }
    if (
      code === "ENOTFOUND" ||
      msg.includes("ENOTFOUND") ||
      msg.includes("getaddrinfo")
    ) {
      return "Server address not found — check the IP/hostname";
    }
    if (code === "EHOSTUNREACH" || msg.includes("EHOSTUNREACH")) {
      return "Host unreachable — check your network connection";
    }
    if (msg.includes("Invalid protocol state") || msg.includes("protocol")) {
      return "Protocol error — likely a Minecraft version mismatch";
    }
    if (
      msg.includes("disconnect.loginFailedInfo") ||
      msg.includes("multiplayer is disabled")
    ) {
      return "Login failed — server requires online-mode authentication";
    }
    if (msg.includes("banned")) {
      return "Banned from server";
    }
    if (msg.includes("whitelist") || msg.includes("not whitelisted")) {
      return "Not whitelisted on this server";
    }
    if (msg.includes("full") || msg.includes("server is full")) {
      return "Server is full";
    }
    if (msg.includes("outdated") || msg.includes("version")) {
      return `Version mismatch — ${msg}`;
    }

    return msg;
  }

  getStatus() {
    if (!this.bot || !this.connected) {
      return {
        connected: false,
        connecting: this.connecting,
        username: null,
        health: null,
        food: null,
        position: null,
        ping: null,
        isMining: false,
        isMiningEnabled: false,
        gameMode: null,
        experience: null,
        uptime: null,
      };
    }

    const bot = this.bot;
    return {
      connected: true,
      connecting: false,
      username: bot.username || null,
      health: bot.health ?? null,
      food: bot.food ?? null,
      position: bot.entity?.position
        ? {
            x: Math.round(bot.entity.position.x * 10) / 10,
            y: Math.round(bot.entity.position.y * 10) / 10,
            z: Math.round(bot.entity.position.z * 10) / 10,
          }
        : null,
      ping: bot.player?.ping ?? null,
      isMining: bot.isMining || false,
      isMiningEnabled: bot.isMiningEnabled || false,
      gameMode: bot.game?.gameMode || null,
      experience: bot.experience
        ? {
            level: bot.experience.level,
            points: bot.experience.points,
            progress: bot.experience.progress,
          }
        : null,
      uptime: this.startTime
        ? Math.floor((Date.now() - this.startTime) / 1000)
        : null,
    };
  }

  getInventory() {
    if (!this.bot || !this.connected) return [];
    try {
      return this.bot.inventory.items().map((item) => ({
        name: item.name,
        count: item.count,
        slot: item.slot,
        displayName: item.displayName || item.name,
      }));
    } catch (err) {
      return [];
    }
  }

  getChatLog() {
    return this.chatLog;
  }

  getLogs() {
    return this.logs;
  }

  sendChat(message) {
    if (!this.bot || !this.connected) {
      return { success: false, error: "Bot is not connected" };
    }
    try {
      this.bot.chat(message);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  toggleMining() {
    if (!this.bot || !this.connected) {
      return { success: false, error: "Bot is not connected" };
    }
    this.bot.isMiningEnabled = !this.bot.isMiningEnabled;
    this.configManager.saveRuntimeState({
      isMiningEnabled: this.bot.isMiningEnabled,
    });

    if (!this.bot.isMiningEnabled && this.bot.isMining) {
      this.bot.isMining = false;
      try {
        this.bot.pathfinder.stop();
      } catch (e) {
        /* ignore */
      }
      this.bot.emit("mining_stopped");
    }

    this.addLog(
      "info",
      `Auto-mining ${this.bot.isMiningEnabled ? "ENABLED" : "DISABLED"}`,
      "Mining",
    );
    this.emit("status", this.getStatus());
    return { success: true, isMiningEnabled: this.bot.isMiningEnabled };
  }

  async pingServer(ip, port) {
    try {
      const result = await util.status(ip, parseInt(port), { timeout: 5000 });
      return {
        online: result.players.online,
        max: result.players.max,
        players: result.players.sample || [],
        motd: result.motd?.clean || result.motd?.toString() || "",
        version: result.version?.name || "Unknown",
        latency: result.roundTripLatency || 0,
      };
    } catch (err) {
      return {
        error: err.message,
        online: 0,
        max: 0,
        players: [],
        motd: "",
        version: "",
        latency: 0,
      };
    }
  }

  isConnected() {
    return this.connected;
  }

  getBot() {
    return this.bot;
  }
}

module.exports = { BotManager };
