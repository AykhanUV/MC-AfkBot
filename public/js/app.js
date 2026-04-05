// State
let socket;
let botConnected = false;
let currentConfig = {};

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  socket = io();
  setupSocketListeners();
  setupUI();
});

// ============ Socket Listeners ============

function setupSocketListeners() {
  socket.on("connect", () => {
    console.log("Socket connected");
    socket.emit("config:get");
    socket.emit("server:ping");
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected");
  });

  socket.on("bot:status", (status) => {
    updateBotStatus(status);
  });

  socket.on("bot:chat", (entry) => {
    appendChatMessage(entry);
  });

  socket.on("bot:inventory", (items) => {
    updateInventory(items);
  });

  socket.on("bot:log", (entry) => {
    appendConsoleLog(entry);
  });

  socket.on("server:status", (status) => {
    updateServerStatus(status);
  });

  socket.on("config:current", (config) => {
    currentConfig = config;
    populateSettingsForm(config);
  });

  socket.on("bot:connected", () => {
    botConnected = true;
    updateConnectionUI(true);
    showToast("Bot connected!", "success");
  });

  socket.on("bot:disconnected", (data) => {
    botConnected = false;
    updateConnectionUI(false);
    showToast("Bot disconnected: " + (data.reason || "Unknown"), "error");
  });

  socket.on("config:update:result", (result) => {
    const saveStatus = document.getElementById("saveStatus");
    if (result.success) {
      saveStatus.textContent = "\u2713 Settings saved!";
      saveStatus.classList.add("show");
      showToast("Settings saved!", "success");
    } else {
      saveStatus.textContent = "\u2717 Error saving";
      saveStatus.classList.add("show");
      showToast("Error saving: " + (result.error || "Unknown error"), "error");
    }
    setTimeout(() => saveStatus.classList.remove("show"), 3000);
  });
}

// ============ UI Setup ============

function setupUI() {
  // Tab switching
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".nav-tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    });
  });

  // Connect/Disconnect
  document.getElementById("btnConnect").addEventListener("click", () => {
    socket.emit("bot:connect");
    updateConnectionUI(false, true);
    showToast("Connecting...", "info");
  });

  document.getElementById("btnDisconnect").addEventListener("click", () => {
    socket.emit("bot:disconnect");
  });

  // Toggle Mining
  document.getElementById("btnToggleMining").addEventListener("click", () => {
    socket.emit("bot:toggle-mining");
  });

  // Send Chat
  const chatInput = document.getElementById("chatInput");
  const btnSendChat = document.getElementById("btnSendChat");

  btnSendChat.addEventListener("click", () => {
    sendChatMessage();
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChatMessage();
  });

  // Settings form
  document.getElementById("settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings();
  });

  // Add message button
  document.getElementById("btnAddMessage").addEventListener("click", () => {
    addChatMessageInput("");
  });

  // Clear console
  document.getElementById("btnClearLogs").addEventListener("click", () => {
    document.getElementById("consoleLog").innerHTML = "";
  });
}

function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (msg) {
    socket.emit("bot:send-chat", { message: msg });
    input.value = "";
  }
}

// ============ Status Updates ============

function updateBotStatus(status) {
  botConnected = status.connected;
  updateConnectionUI(status.connected, status.connecting);

  document.getElementById("botUsername").textContent = status.username || "-";
  document.getElementById("botGameMode").textContent = status.gameMode || "-";
  document.getElementById("botPing").textContent =
    status.ping != null ? status.ping + " ms" : "-";

  if (status.position) {
    var x = Math.round(status.position.x * 10) / 10;
    var y = Math.round(status.position.y * 10) / 10;
    var z = Math.round(status.position.z * 10) / 10;
    document.getElementById("botPosition").textContent =
      x + ", " + y + ", " + z;
  } else {
    document.getElementById("botPosition").textContent = "-";
  }

  if (status.uptime != null) {
    document.getElementById("botUptime").textContent = formatUptime(
      status.uptime,
    );
  } else {
    document.getElementById("botUptime").textContent = "-";
  }

  if (status.experience) {
    document.getElementById("botExperience").textContent =
      "Level " + (status.experience.level || 0);
  } else {
    document.getElementById("botExperience").textContent = "-";
  }

  // Health bar
  var health = status.health != null ? status.health : 0;
  var healthPct = Math.max(0, Math.min(100, (health / 20) * 100));
  document.getElementById("healthBar").style.width = healthPct + "%";
  document.getElementById("healthText").textContent =
    status.health != null ? Math.round(health) + "/20" : "-";

  // Food bar
  var food = status.food != null ? status.food : 0;
  var foodPct = Math.max(0, Math.min(100, (food / 20) * 100));
  document.getElementById("foodBar").style.width = foodPct + "%";
  document.getElementById("foodText").textContent =
    status.food != null ? Math.round(food) + "/20" : "-";

  // Mining status
  var miningEl = document.getElementById("miningStatus");
  if (status.connected) {
    var autoStr = status.isMiningEnabled
      ? "\u2705 Auto-Mining ON"
      : "\u274C Auto-Mining OFF";
    var activeStr = status.isMining ? " (\u26CF\uFE0F Active)" : "";
    miningEl.textContent = autoStr + activeStr;
  } else {
    miningEl.textContent = "-";
  }
}

function updateConnectionUI(connected, connecting) {
  var dot = document.getElementById("statusDot");
  var text = document.getElementById("statusText");
  var btnConnect = document.getElementById("btnConnect");
  var btnDisconnect = document.getElementById("btnDisconnect");
  var btnToggleMining = document.getElementById("btnToggleMining");
  var chatInput = document.getElementById("chatInput");
  var btnSendChat = document.getElementById("btnSendChat");

  // Clear all state classes first
  dot.classList.remove("connected", "connecting");

  if (connected) {
    dot.classList.add("connected");
    text.textContent = "Connected";
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnToggleMining.disabled = false;
    chatInput.disabled = false;
    btnSendChat.disabled = false;
  } else if (connecting) {
    dot.classList.add("connecting");
    text.textContent = "Connecting...";
    btnConnect.disabled = true;
    btnDisconnect.disabled = false;
    btnToggleMining.disabled = true;
    chatInput.disabled = true;
    btnSendChat.disabled = true;
  } else {
    text.textContent = "Disconnected";
    btnConnect.disabled = false;
    btnDisconnect.disabled = true;
    btnToggleMining.disabled = true;
    chatInput.disabled = true;
    btnSendChat.disabled = true;
  }

  // Lock/unlock username and server fields when connected
  var usernameInput = document.getElementById("cfg-username");
  var serverIp = document.getElementById("cfg-server-ip");
  var serverPort = document.getElementById("cfg-server-port");

  if (usernameInput) {
    usernameInput.disabled = connected;
    document.getElementById("usernameHint").style.display = connected
      ? "block"
      : "none";
  }
  if (serverIp) {
    serverIp.disabled = connected;
    document.getElementById("serverIpHint").style.display = connected
      ? "block"
      : "none";
  }
  if (serverPort) {
    serverPort.disabled = connected;
    document.getElementById("serverPortHint").style.display = connected
      ? "block"
      : "none";
  }
}

function updateServerStatus(status) {
  var config = currentConfig;
  document.getElementById("serverAddress").textContent = config.server
    ? config.server.ip + ":" + config.server.port
    : "-";
  document.getElementById("serverVersion").textContent = status.version || "-";
  document.getElementById("serverPlayers").textContent = status.error
    ? "Offline"
    : status.online + "/" + status.max;
  document.getElementById("serverMotd").textContent = status.motd || "-";
  document.getElementById("serverLatency").textContent = status.latency
    ? status.latency + " ms"
    : "-";

  // Player list
  var playerList = document.getElementById("playerList");
  playerList.innerHTML = "";
  if (status.players && status.players.length > 0) {
    status.players.forEach(function (p) {
      var tag = document.createElement("span");
      tag.className = "player-tag";
      tag.textContent = p.name || p.nameRaw || "Unknown";
      playerList.appendChild(tag);
    });
  }
}

function updateInventory(items) {
  var grid = document.getElementById("inventoryGrid");
  if (!items || items.length === 0) {
    grid.innerHTML = '<div class="inventory-empty">No items</div>';
    return;
  }
  grid.innerHTML = "";
  items.forEach(function (item) {
    var el = document.createElement("div");
    el.className = "inventory-item";
    var countSpan = document.createElement("span");
    countSpan.className = "item-count";
    countSpan.textContent = item.count + "x";
    el.appendChild(countSpan);
    el.appendChild(
      document.createTextNode(" " + (item.displayName || item.name)),
    );
    grid.appendChild(el);
  });
}

// ============ Chat Log ============

function appendChatMessage(entry) {
  var container = document.getElementById("chatLog");
  // Remove empty message placeholder
  var empty = container.querySelector(".log-empty");
  if (empty) empty.remove();

  var el = document.createElement("div");
  el.className = "log-entry";

  var time = new Date(entry.timestamp).toLocaleTimeString();

  var timeSpan = document.createElement("span");
  timeSpan.className = "timestamp";
  timeSpan.textContent = time;

  var userSpan = document.createElement("span");
  userSpan.className = "chat-username";
  userSpan.textContent = "<" + entry.username + ">";

  el.appendChild(timeSpan);
  el.appendChild(userSpan);
  el.appendChild(document.createTextNode(" " + entry.message));

  container.appendChild(el);

  // Auto scroll
  container.scrollTop = container.scrollHeight;

  // Limit entries
  while (container.children.length > 200) {
    container.removeChild(container.firstChild);
  }
}

// ============ Console Log ============

function appendConsoleLog(entry) {
  var container = document.getElementById("consoleLog");

  var el = document.createElement("div");
  el.className = "console-entry " + (entry.level || "info");

  var time = new Date(entry.timestamp).toLocaleTimeString();
  var levelTag = "[" + (entry.level || "INFO").toUpperCase() + "]";
  var moduleTag = entry.module ? "[" + entry.module + "]" : "";

  var timeSpan = document.createElement("span");
  timeSpan.className = "time";
  timeSpan.textContent = time;

  var moduleSpan = document.createElement("span");
  moduleSpan.className = "module";
  moduleSpan.textContent = levelTag + " " + moduleTag;

  el.appendChild(timeSpan);
  el.appendChild(document.createTextNode(" "));
  el.appendChild(moduleSpan);
  el.appendChild(document.createTextNode(" " + entry.message));

  container.appendChild(el);

  // Auto scroll
  container.scrollTop = container.scrollHeight;

  // Limit
  while (container.children.length > 500) {
    container.removeChild(container.firstChild);
  }
}

// ============ Settings ============

function populateSettingsForm(config) {
  // Bot Account
  setValue(
    "cfg-username",
    config["bot-account"] ? config["bot-account"].username || "" : "",
  );
  setValue(
    "cfg-password",
    config["bot-account"] ? config["bot-account"].password || "" : "",
  );
  setSelect(
    "cfg-authtype",
    config["bot-account"] ? config["bot-account"].type || "offline" : "offline",
  );

  // Server
  setValue("cfg-server-ip", config.server ? config.server.ip || "" : "");
  setValue(
    "cfg-server-port",
    config.server ? config.server.port || 25565 : 25565,
  );
  setValue(
    "cfg-server-version",
    config.server ? config.server.version || "" : "",
  );

  // Auto Auth
  var utils = config.utils || {};
  var autoAuth = utils["auto-auth"] || {};
  setChecked("cfg-autoauth-enabled", autoAuth.enabled || false);
  setValue("cfg-autoauth-password", autoAuth.password || "");

  // Chat Messages
  var chatMessages = utils["chat-messages"] || {};
  setChecked("cfg-chat-enabled", chatMessages.enabled || false);
  setChecked("cfg-chat-repeat", chatMessages.repeat || false);
  setValue("cfg-chat-delay", chatMessages["repeat-delay"] || 60);

  // Populate chat messages list
  var container = document.getElementById("chatMessagesContainer");
  container.innerHTML = "";
  var messages = chatMessages.messages || [];
  messages.forEach(function (msg) {
    addChatMessageInput(msg);
  });

  // Auto Reconnect
  setChecked("cfg-autoreconnect", utils["auto-reconnect"] || false);
  setValue("cfg-autoreconnect-delay", utils["auto-reconnect-delay"] || 10);

  // Player Activity
  var playerActivity = utils["player-activity"] || {};
  setChecked("cfg-playeractivity-enabled", playerActivity.enabled || false);
  setValue(
    "cfg-playeractivity-interval",
    playerActivity.checkIntervalSeconds || 30,
  );
  setChecked(
    "cfg-playeractivity-leave",
    playerActivity.leaveWhenPlayerJoins || false,
  );

  // Mining
  var mining = config.mining || {};
  setValue("cfg-mining-blocks", (mining.blockTypes || []).join(", "));
  setValue("cfg-mining-interval", mining.interval || 10000);
  setValue("cfg-mining-distance", mining.maxDistance || 5);

  // Update locked fields based on connection state
  updateConnectionUI(botConnected);

  // Update server address display
  document.getElementById("serverAddress").textContent = config.server
    ? config.server.ip + ":" + config.server.port
    : "-";
}

function addChatMessageInput(value) {
  var container = document.getElementById("chatMessagesContainer");
  var div = document.createElement("div");
  div.className = "message-item";

  var input = document.createElement("input");
  input.type = "text";
  input.className = "chat-msg-input";
  input.value = value;
  input.placeholder = "Chat message...";

  var removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-small btn-remove btn-danger";
  removeBtn.textContent = "\u2715";
  removeBtn.addEventListener("click", function () {
    div.remove();
  });

  div.appendChild(input);
  div.appendChild(removeBtn);
  container.appendChild(div);
}

function saveSettings() {
  // Collect chat messages
  var chatMsgInputs = document.querySelectorAll(".chat-msg-input");
  var chatMessages = Array.from(chatMsgInputs)
    .map(function (el) {
      return el.value.trim();
    })
    .filter(function (v) {
      return v.length > 0;
    });

  // Parse block types
  var blockTypesStr = document.getElementById("cfg-mining-blocks").value;
  var blockTypes = blockTypesStr
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });

  var config = {
    "bot-account": {
      username: document.getElementById("cfg-username").value || "AfkBot",
      password: document.getElementById("cfg-password").value || "",
      type: document.getElementById("cfg-authtype").value || "offline",
    },
    server: {
      ip: document.getElementById("cfg-server-ip").value || "localhost",
      port: parseInt(document.getElementById("cfg-server-port").value) || 25565,
      version: document.getElementById("cfg-server-version").value || "1.21.4",
    },
    utils: {
      "auto-auth": {
        enabled: document.getElementById("cfg-autoauth-enabled").checked,
        password: document.getElementById("cfg-autoauth-password").value || "",
      },
      "chat-messages": {
        enabled: document.getElementById("cfg-chat-enabled").checked,
        repeat: document.getElementById("cfg-chat-repeat").checked,
        "repeat-delay":
          parseInt(document.getElementById("cfg-chat-delay").value) || 60,
        messages: chatMessages,
      },
      "auto-reconnect": document.getElementById("cfg-autoreconnect").checked,
      "auto-reconnect-delay":
        parseInt(document.getElementById("cfg-autoreconnect-delay").value) ||
        10,
      "player-activity": {
        enabled: document.getElementById("cfg-playeractivity-enabled").checked,
        checkIntervalSeconds:
          parseInt(
            document.getElementById("cfg-playeractivity-interval").value,
          ) || 30,
        leaveWhenPlayerJoins: document.getElementById(
          "cfg-playeractivity-leave",
        ).checked,
      },
    },
    mining: {
      blockTypes: blockTypes.length > 0 ? blockTypes : ["dirt", "cobblestone"],
      interval:
        parseInt(document.getElementById("cfg-mining-interval").value) || 10000,
      maxDistance:
        parseInt(document.getElementById("cfg-mining-distance").value) || 5,
    },
    webserver: currentConfig.webserver || { port: 5050 },
  };

  socket.emit("config:update", { config: config });
}

// ============ Helpers ============

function setValue(id, value) {
  var el = document.getElementById(id);
  if (el) el.value = value;
}

function setSelect(id, value) {
  var el = document.getElementById(id);
  if (el) el.value = value;
}

function setChecked(id, value) {
  var el = document.getElementById(id);
  if (el) el.checked = value;
}

function formatUptime(totalSeconds) {
  if (totalSeconds == null || totalSeconds < 0) return "-";
  var seconds = Math.floor(totalSeconds);
  var days = Math.floor(seconds / 86400);
  seconds %= 86400;
  var hrs = Math.floor(seconds / 3600);
  seconds %= 3600;
  var mins = Math.floor(seconds / 60);
  seconds %= 60;
  var parts = [];
  if (days > 0) parts.push(days + "d");
  if (hrs > 0) parts.push(hrs + "h");
  if (mins > 0) parts.push(mins + "m");
  parts.push(seconds + "s");
  return parts.join(" ");
}

function showToast(message, type) {
  type = type || "info";
  var container = document.getElementById("toastContainer");
  var toast = document.createElement("div");
  toast.className = "toast " + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function () {
    if (toast.parentNode) {
      toast.remove();
    }
  }, 3000);
}

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
