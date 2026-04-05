const { ConfigManager } = require("./config");
const { BotManager } = require("./bot-manager");
const { createWebServer } = require("./webserver");

console.log("============================================");
console.log("   MC-AfkBot v2.0 - Web Control Panel");
console.log("============================================");

// Initialize managers
const configManager = new ConfigManager();
const botManager = new BotManager(configManager);

// Get web server port
const config = configManager.get();
const port = parseInt(process.env.PORT) || config.webserver?.port || 5050;

// Start web server
createWebServer(port, botManager, configManager);

console.log(
  "[Main] Application started. Open the control panel in your browser.",
);
console.log(`[Main] URL: http://localhost:${port}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Main] Shutting down...");
  botManager.disconnect();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Main] Shutting down...");
  botManager.disconnect();
  process.exit(0);
});

// Prevent crashes from unhandled errors
process.on("uncaughtException", (err) => {
  console.error("[Main] Uncaught exception:", err.message);
  console.error(err.stack);
  botManager.addLog("error", `Uncaught exception: ${err.message}`, "System");
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("[Main] Unhandled rejection:", msg);
  botManager.addLog("error", `Unhandled rejection: ${msg}`, "System");
});
