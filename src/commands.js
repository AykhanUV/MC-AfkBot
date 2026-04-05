const { GoalFollow, GoalBlock } = require("mineflayer-pathfinder").goals;
const fs = require("fs");
const path = require("path");
const { executeCommandMine } = require("./mining");

function setupCommands(bot, _config) {
  console.log('[Commands] Module enabled. Listening for "!" commands.');

  bot.isFollowing = bot.isFollowing || false;
  bot.followTargetName = bot.followTargetName || null;
  bot.followIntervalId = bot.followIntervalId || null;
  bot.currentPathTask = bot.currentPathTask || "none";
  bot.isCommandActive = bot.isCommandActive || false;
  bot.miningCommandTargetBlockType = bot.miningCommandTargetBlockType || null;

  function findTargetPlayerEntity(botInstance, name) {
    try {
      const lowerName = name.toLowerCase();
      for (const playerName in botInstance.players) {
        if (playerName.toLowerCase() === lowerName) {
          return botInstance.players[playerName]?.entity;
        }
      }
    } catch (err) {
      console.error("[Commands] Error finding player:", err.message);
    }
    return null;
  }

  function cancelCurrentTask(botInstance, newCommandTakesOver = false) {
    try {
      if (!newCommandTakesOver || botInstance.isFollowing) {
        try {
          botInstance.pathfinder.stop();
        } catch (e) {
          /* pathfinder may not be loaded */
        }
      }

      if (botInstance.isFollowing) {
        if (botInstance.followIntervalId) {
          clearInterval(botInstance.followIntervalId);
          botInstance.followIntervalId = null;
        }
        botInstance.isFollowing = false;
        botInstance.followTargetName = null;
      }
      botInstance.currentPathTask = "none";
      botInstance.miningCommandTargetBlockType = null;

      if (botInstance.gotoTimeoutId) {
        clearTimeout(botInstance.gotoTimeoutId);
        botInstance.gotoTimeoutId = null;
      }

      if (botInstance.isMining) {
        botInstance.isMining = false;
        botInstance.emit("mining_stopped");
        console.log("[Commands] Mining stopped due to command override.");
      }

      if (!newCommandTakesOver) {
        botInstance.isCommandActive = false;
      }
    } catch (err) {
      console.error("[Commands] Error in cancelCurrentTask:", err.message);
      botInstance.isCommandActive = false;
    }
  }

  bot.on("chat", (username, message) => {
    try {
      if (username === bot.username) return;
      if (!message.startsWith("!")) return;

      const args = message.substring(1).split(" ");
      const command = args.shift().toLowerCase();

      console.log(
        `[Commands] Command from ${username}: ${command} args: ${args.join(" ")}`,
      );

      switch (command) {
        case "status":
          bot.chat(`I'm online and running!`);
          break;

        case "help":
          bot.chat(
            `Commands: !status, !help, !uptime, !inventory, !follow <player>, !stopFollow, !goto <x> <y> <z | player>, !dropitems, !mine <block>, !stopMine, !toggleMining, !miningStatus, !ping`,
          );
          break;

        case "uptime": {
          try {
            const uptimeSeconds = process.uptime();
            bot.chat(`Bot uptime: ${formatUptime(uptimeSeconds)}`);
          } catch (e) {
            bot.chat("Error getting uptime.");
          }
          break;
        }

        case "inventory": {
          try {
            const inventory = bot.inventory?.items() || [];
            if (inventory.length === 0) {
              bot.chat("My inventory is empty.");
            } else {
              const inventoryList = inventory
                .map((item) => `${item.count} ${item.name}`)
                .join(", ");
              bot.chat(`I have: ${inventoryList}`);
            }
          } catch (e) {
            bot.chat("Error reading inventory.");
          }
          break;
        }

        case "follow": {
          try {
            cancelCurrentTask(bot, true);
            if (args.length < 1) {
              bot.chat("Usage: !follow <player_name>");
              bot.isCommandActive = false;
              break;
            }
            const targetPlayerNameArgFollow = args[0];
            const targetEntityToFollow = findTargetPlayerEntity(
              bot,
              targetPlayerNameArgFollow,
            );

            if (targetEntityToFollow) {
              const actualPlayerName =
                targetEntityToFollow.username || targetPlayerNameArgFollow;
              bot.isCommandActive = true;
              bot.isFollowing = true;
              bot.followTargetName = actualPlayerName;
              bot.currentPathTask = "follow";
              bot.chat(`Now following ${actualPlayerName}.`);

              if (bot.followIntervalId) clearInterval(bot.followIntervalId);
              bot.followIntervalId = setInterval(() => {
                try {
                  const currentTargetEntityInstance =
                    bot.players[bot.followTargetName]?.entity;
                  if (
                    !bot.isFollowing ||
                    !currentTargetEntityInstance ||
                    !currentTargetEntityInstance.isValid
                  ) {
                    bot.chat(
                      `Lost target ${bot.followTargetName || "player"} or follow stopped.`,
                    );
                    cancelCurrentTask(bot, false);
                    return;
                  }
                  bot.pathfinder.setGoal(
                    new GoalFollow(currentTargetEntityInstance, 3),
                    true,
                  );
                } catch (err) {
                  console.error(
                    "[Commands] Error in follow interval:",
                    err.message,
                  );
                  cancelCurrentTask(bot, false);
                }
              }, 1000);
            } else {
              bot.chat(`Player ${targetPlayerNameArgFollow} not found.`);
              bot.isCommandActive = false;
            }
          } catch (e) {
            console.error("[Commands] Error in follow:", e.message);
            bot.isCommandActive = false;
          }
          break;
        }

        case "stopfollow": {
          if (bot.isFollowing) {
            const oldTarget = bot.followTargetName;
            cancelCurrentTask(bot, false);
            bot.chat(`Stopped following ${oldTarget}.`);
          } else {
            bot.chat("Not currently following anyone.");
          }
          break;
        }

        case "goto": {
          try {
            cancelCurrentTask(bot, true);
            let gotoTimeoutHandle = null;
            const GOTO_TIMEOUT_MS = 30000;

            const executeGoto = async (goal, type) => {
              bot.isCommandActive = true;
              bot.currentPathTask = "goto";
              let timedOut = false;

              const timeoutPromise = new Promise((resolve) => {
                gotoTimeoutHandle = setTimeout(() => {
                  timedOut = true;
                  resolve("timeout");
                }, GOTO_TIMEOUT_MS);
              });

              try {
                const result = await Promise.race([
                  bot.pathfinder.goto(goal),
                  timeoutPromise,
                ]);
                if (gotoTimeoutHandle) {
                  clearTimeout(gotoTimeoutHandle);
                  gotoTimeoutHandle = null;
                }
                if (result === "timeout") {
                  try {
                    bot.pathfinder.stop();
                  } catch (e) {}
                  bot.chat(`!goto to ${type} timed out.`);
                } else {
                  bot.chat("Reached destination.");
                }
              } catch (err) {
                if (gotoTimeoutHandle) {
                  clearTimeout(gotoTimeoutHandle);
                  gotoTimeoutHandle = null;
                }
                bot.chat(`!goto to ${type} failed: ${err.message}`);
              } finally {
                if (bot.currentPathTask === "goto" && bot.isCommandActive) {
                  cancelCurrentTask(bot, false);
                }
              }
            };

            if (args.length === 3) {
              const x = parseInt(args[0], 10);
              const y = parseInt(args[1], 10);
              const z = parseInt(args[2], 10);
              if (isNaN(x) || isNaN(y) || isNaN(z)) {
                bot.chat("Invalid coordinates. Usage: !goto <x> <y> <z>");
                bot.isCommandActive = false;
                break;
              }
              bot.chat(`Navigating to: ${x}, ${y}, ${z}.`);
              executeGoto(new GoalBlock(x, y, z), "coords");
            } else if (args.length === 1) {
              const playerNameArgGoto = args[0];
              const targetPlayerEntityForGoto = findTargetPlayerEntity(
                bot,
                playerNameArgGoto,
              );
              if (targetPlayerEntityForGoto) {
                const pos = targetPlayerEntityForGoto.position;
                bot.chat(
                  `Navigating to ${targetPlayerEntityForGoto.username || playerNameArgGoto}'s location.`,
                );
                executeGoto(new GoalBlock(pos.x, pos.y, pos.z), "player");
              } else {
                bot.chat(`Player ${playerNameArgGoto} not found.`);
                bot.isCommandActive = false;
              }
            } else {
              bot.chat("Usage: !goto <x> <y> <z> OR !goto <player_name>");
              bot.isCommandActive = false;
            }
          } catch (e) {
            console.error("[Commands] Error in goto:", e.message);
            bot.isCommandActive = false;
          }
          break;
        }

        case "dropitems": {
          try {
            cancelCurrentTask(bot, true);
            bot.isCommandActive = true;

            const items = bot.inventory?.items() || [];
            if (items.length === 0) {
              bot.chat("My inventory is empty.");
              bot.isCommandActive = false;
            } else {
              bot.chat("Dropping all items...");
              (async () => {
                try {
                  for (const item of items) {
                    try {
                      await bot.tossStack(item);
                    } catch (err) {
                      console.log(
                        `[Commands] Error dropping ${item.name}: ${err.message}`,
                      );
                    }
                  }
                  bot.chat("Finished dropping items.");
                } catch (err) {
                  console.error(
                    "[Commands] Error dropping items:",
                    err.message,
                  );
                } finally {
                  bot.isCommandActive = false;
                }
              })();
            }
          } catch (e) {
            console.error("[Commands] Error in dropitems:", e.message);
            bot.isCommandActive = false;
          }
          break;
        }

        case "mine": {
          try {
            cancelCurrentTask(bot, true);
            if (args.length < 1) {
              bot.chat("Usage: !mine <block_type>");
              bot.isCommandActive = false;
              break;
            }
            const blockTypeNameToMine = args[0];
            bot.isCommandActive = true;
            bot.currentPathTask = "mine_block_command";
            bot.miningCommandTargetBlockType = blockTypeNameToMine;

            executeCommandMine(bot, blockTypeNameToMine, _config)
              .catch((err) => {
                console.error(
                  `[Commands] Error from executeCommandMine: ${err.message}`,
                );
                try {
                  bot.chat(
                    "The !mine command encountered an unexpected error.",
                  );
                } catch (e) {}
              })
              .finally(() => {
                if (bot.currentPathTask === "mine_block_command") {
                  cancelCurrentTask(bot, false);
                }
              });
          } catch (e) {
            console.error("[Commands] Error in mine:", e.message);
            bot.isCommandActive = false;
          }
          break;
        }

        case "stopmine": {
          if (
            bot.isCommandActive &&
            bot.currentPathTask === "mine_block_command"
          ) {
            bot.chat("Stopping mining operation...");
            cancelCurrentTask(bot, false);
          } else {
            bot.chat("Not currently mining with !mine command.");
          }
          break;
        }

        case "togglemining": {
          try {
            bot.isMiningEnabled = !bot.isMiningEnabled;
            const runtimeStatePathCommands = path.join(
              __dirname,
              "..",
              "runtime_state.json",
            );
            try {
              fs.writeFileSync(
                runtimeStatePathCommands,
                JSON.stringify(
                  { isMiningEnabled: bot.isMiningEnabled },
                  null,
                  2,
                ),
              );
            } catch (writeErr) {
              console.error(
                "[Commands] Error writing runtime state:",
                writeErr.message,
              );
            }
            bot.chat(
              `Automatic mining is now ${bot.isMiningEnabled ? "ENABLED" : "DISABLED"}.`,
            );
            if (!bot.isMiningEnabled && bot.isMining) {
              bot.isMining = false;
              try {
                bot.pathfinder.stop();
              } catch (e) {}
              bot.emit("mining_stopped");
            }
          } catch (e) {
            console.error("[Commands] Error in togglemining:", e.message);
          }
          break;
        }

        case "miningstatus":
          bot.chat(
            `Automatic mining is currently ${bot.isMiningEnabled ? "ENABLED" : "DISABLED"}.`,
          );
          break;

        case "ping": {
          try {
            const ping = bot.player?.ping;
            bot.chat(`Bot ping: ${ping != null ? ping + " ms" : "unknown"}`);
          } catch (e) {
            bot.chat("Error getting ping.");
          }
          break;
        }

        default:
          bot.chat(`Unknown command: ${command}. Try !help`);
      }
    } catch (err) {
      console.error(
        "[Commands] Unhandled error in command handler:",
        err.message,
      );
      console.error(err.stack);
      try {
        bot.chat("An error occurred processing that command.");
      } catch (e) {}
    }
  });

  bot.on("goal_reached", () => {});
  bot.on("path_update", () => {});
  bot.on("path_reset", () => {});

  function formatUptime(totalSeconds) {
    if (isNaN(totalSeconds) || totalSeconds < 0) return "Invalid";
    let seconds = Math.floor(totalSeconds);
    const days = Math.floor(seconds / (3600 * 24));
    seconds %= 3600 * 24;
    const hrs = Math.floor(seconds / 3600);
    seconds %= 3600;
    const mnts = Math.floor(seconds / 60);
    seconds %= 60;
    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mnts > 0) parts.push(`${mnts}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
  }
}

module.exports = { setupCommands };
