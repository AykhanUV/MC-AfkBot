const mineflayer = require("mineflayer");
const { pathfinder } = require("mineflayer-pathfinder");
const { setupAuth } = require("./auth");
const { setupChat } = require("./chat");
const { setupCommands } = require("./commands");
const { setupMining } = require("./mining");

function createBot(config, initialRuntimeState) {
  console.log("[Bot] Creating bot instance...");

  const bot = mineflayer.createBot({
    username: config["bot-account"]["username"],
    password: config["bot-account"]["password"] || undefined,
    auth: config["bot-account"]["type"],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version || false,
    hideErrors: false,
  });

  bot.isMiningEnabled = initialRuntimeState?.isMiningEnabled ?? true;
  let antiAfkInterval = null;

  console.log("[Bot] Bot instance created. Setting up event listeners...");

  bot.once("spawn", () => {
    try {
      console.log(
        "[Bot] Bot spawned. Loading plugins and setting up modules...",
      );
      bot.loadPlugin(pathfinder);
      bot.settings.colorsEnabled = false;

      setupAuth(bot, config);
      setupChat(bot, config);
      setupCommands(bot, config);
      setupMining(bot, config);

      // Anti-AFK: periodically sneak to avoid kick
      antiAfkInterval = setInterval(() => {
        try {
          if (bot && bot.entity) {
            bot.setControlState("sneak", true);
            setTimeout(() => {
              try {
                bot.setControlState("sneak", false);
              } catch (e) {
                /* bot may have disconnected */
              }
            }, 100);
          }
        } catch (e) {
          /* ignore */
        }
      }, 30000);

      console.log("[Bot] Modules setup complete.");
    } catch (err) {
      console.error("[Bot] Error during spawn setup:", err.message);
      console.error(err.stack);
    }
  });

  bot.on("playerJoined", (player) => {
    try {
      if (player.username === bot.username) return;
      console.log(`[Bot] Player ${player.username} joined the server.`);

      const playerActivityEnabled =
        config.utils["player-activity"]?.enabled === true;
      const leaveWhenPlayerJoins =
        config.utils["player-activity"]?.leaveWhenPlayerJoins === true;

      if (playerActivityEnabled && leaveWhenPlayerJoins) {
        console.log(
          "[Bot] Player activity enabled and leaveWhenPlayerJoins is true. Quitting...",
        );
        bot.quit();
      }
    } catch (err) {
      console.error("[Bot] Error in playerJoined handler:", err.message);
    }
  });

  bot.on("kicked", (reason) => {
    try {
      let reasonText = reason;
      if (typeof reason === "object") {
        try {
          reasonText = JSON.stringify(reason);
        } catch (e) {
          reasonText = String(reason);
        }
      }
      console.log(`[Bot] Kicked: ${reasonText}`);
    } catch (err) {
      console.error("[Bot] Error in kicked handler:", err.message);
    }
  });

  bot.on("error", (err) => {
    try {
      console.error("[Bot] Error occurred:", err.message);
      if (err.stack) console.error(err.stack);
    } catch (e) {
      console.error("[Bot] Error in error handler");
    }
  });

  bot.on("death", () => {
    try {
      console.log("[Bot] Bot died and respawned.");
      if (bot.isMining) {
        bot.isMining = false;
        bot.emit("mining_stopped");
      }
    } catch (err) {
      console.error("[Bot] Error in death handler:", err.message);
    }
  });

  bot.on("end", (reason) => {
    try {
      console.log(`[Bot] Disconnected from server. Reason: ${reason || "N/A"}`);
      // Clear anti-AFK interval
      if (antiAfkInterval) {
        clearInterval(antiAfkInterval);
        antiAfkInterval = null;
      }
      // No auto-reconnect here - handled by BotManager
    } catch (err) {
      console.error("[Bot] Error in end handler:", err.message);
    }
  });

  console.log("[Bot] Event listeners setup complete.");
  return bot;
}

module.exports = { createBot };
