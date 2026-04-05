const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "settings.json");
const RUNTIME_STATE_PATH = path.join(__dirname, "..", "runtime_state.json");

const DEFAULT_CONFIG = {
  "bot-account": {
    username: "AfkBot",
    password: "",
    type: "offline",
  },
  server: {
    ip: "localhost",
    port: 25565,
    version: "1.21.4",
  },
  utils: {
    "auto-auth": {
      enabled: false,
      password: "",
    },
    "chat-messages": {
      enabled: false,
      repeat: true,
      "repeat-delay": 45,
      messages: [
        "anyone on?",
        "brb getting water",
        "this server is so chill",
        "just vibing",
        "lag check",
        "back",
        "hello?",
        "man im bored lol",
        "gg",
        "nice",
        "yo",
        "anyone wanna play?",
        "afk for a sec",
        "kk back",
        "whats everyone up to",
      ],
    },
    "auto-reconnect": true,
    "auto-reconnect-delay": 10,
    "player-activity": {
      enabled: false,
      checkIntervalSeconds: 30,
      leaveWhenPlayerJoins: true,
    },
  },
  mining: {
    blockTypes: ["dirt", "cobblestone", "coal_ore", "sand", "oak_log"],
    interval: 10000,
    maxDistance: 5,
  },
  webserver: {
    port: 5050,
  },
};

class ConfigManager {
  constructor() {
    this.config = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
        this.config = JSON.parse(raw);
        // Merge with defaults to fill any missing fields
        this.config = this._deepMerge(DEFAULT_CONFIG, this.config);
        console.log("[Config] Loaded settings.json");
      } else {
        console.log(
          "[Config] settings.json not found, creating with defaults.",
        );
        this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        this.save();
      }
    } catch (err) {
      console.error("[Config] Error loading settings.json:", err.message);
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
    return this.config;
  }

  get() {
    return this.config;
  }

  update(newConfig) {
    try {
      // Deep merge new config with existing
      this.config = this._deepMerge(this.config, newConfig);
      this.save();
      console.log("[Config] Configuration updated and saved.");
      return { success: true };
    } catch (err) {
      console.error("[Config] Error updating config:", err.message);
      return { success: false, error: err.message };
    }
  }

  save() {
    try {
      fs.writeFileSync(
        SETTINGS_PATH,
        JSON.stringify(this.config, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error("[Config] Error writing settings.json:", err.message);
      throw err;
    }
  }

  loadRuntimeState() {
    const defaultState = { isMiningEnabled: true };
    try {
      if (fs.existsSync(RUNTIME_STATE_PATH)) {
        const raw = fs.readFileSync(RUNTIME_STATE_PATH, "utf-8");
        const state = JSON.parse(raw);
        return {
          isMiningEnabled:
            typeof state.isMiningEnabled === "boolean"
              ? state.isMiningEnabled
              : true,
        };
      }
    } catch (err) {
      console.error("[Config] Error loading runtime state:", err.message);
    }
    // Write default
    try {
      fs.writeFileSync(
        RUNTIME_STATE_PATH,
        JSON.stringify(defaultState, null, 2),
      );
    } catch (e) {
      /* ignore */
    }
    return defaultState;
  }

  saveRuntimeState(state) {
    try {
      fs.writeFileSync(RUNTIME_STATE_PATH, JSON.stringify(state, null, 2));
    } catch (err) {
      console.error("[Config] Error saving runtime state:", err.message);
    }
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

module.exports = { ConfigManager };
