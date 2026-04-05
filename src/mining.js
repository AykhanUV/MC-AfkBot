const {
  Movements,
  goals: { GoalNear },
} = require("mineflayer-pathfinder");

function setupMining(bot, config) {
  try {
    bot.isMining = false;

    const mcData = require("minecraft-data")(bot.version);
    if (!mcData) {
      console.error("[Mining] Failed to load minecraft-data. Mining disabled.");
      return;
    }

    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    console.log(
      `[Mining] Module enabled. Interval: ${config.mining.interval / 1000}s`,
    );

    const miningInterval = setInterval(() => {
      try {
        if (bot.isMiningEnabled && !bot.isMining && !bot.isCommandActive) {
          mineRandomBlockNearby(bot, config, defaultMove);
        }
      } catch (err) {
        console.error("[Mining] Error in mining interval:", err.message);
      }
    }, config.mining.interval);

    async function mineRandomBlockNearby(bot, config, defaultMove) {
      if (bot.isMining || bot.isCommandActive) return;
      if (!bot.entity) {
        console.log("[Mining] Bot entity not available. Skipping cycle.");
        return;
      }

      try {
        bot.pathfinder.stop();
      } catch (e) {}

      bot.isMining = true;
      bot.emit("mining_started");

      try {
        if (bot.isCommandActive) {
          bot.isMining = false;
          bot.emit("mining_stopped");
          return;
        }

        if (!bot.inventory || bot.inventory.emptySlotCount() === 0) {
          console.log("[Mining] Inventory full. Skipping.");
          bot.isMining = false;
          bot.emit("mining_stopped");
          return;
        }

        const targetBlock = await findTargetBlock(bot, config);

        if (targetBlock) {
          console.log(
            `[Mining] Found: ${targetBlock.name} at ${targetBlock.position}`,
          );
          await digBlock(bot, targetBlock);

          if (!bot.isMining || bot.isCommandActive) {
            if (bot.isMining) bot.isMining = false;
            bot.emit("mining_stopped");
            return;
          }

          await moveToBlock(bot, targetBlock, defaultMove);
        } else {
          bot.isMining = false;
          bot.emit("mining_stopped");
        }
      } catch (err) {
        console.error(`[Mining] Error during mining cycle: ${err.message}`);
        bot.isMining = false;
        bot.emit("mining_stopped");
      }
    }

    async function findTargetBlock(bot, config) {
      const radius = config.mining.maxDistance || 5;
      const yRange = 2;
      let targetBlock = null;
      let attempts = 0;
      const maxAttempts = 10;

      while (!targetBlock && attempts < maxAttempts) {
        try {
          if (!bot.entity) return null;
          const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
          const randomY = Math.floor(Math.random() * (yRange * 2 + 1)) - yRange;
          const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

          const targetPos = bot.entity.position.offset(
            randomX,
            randomY,
            randomZ,
          );
          const block = bot.blockAt(targetPos);

          if (
            block &&
            block.type !== 0 &&
            config.mining.blockTypes.includes(block.name)
          ) {
            const blockBelow = bot.blockAt(targetPos.offset(0, -1, 0));
            if (
              blockBelow &&
              blockBelow.name !== "air" &&
              blockBelow.name !== "water" &&
              blockBelow.name !== "lava"
            ) {
              targetBlock = block;
            }
          }
        } catch (err) {
          console.error("[Mining] Error finding block:", err.message);
        }
        attempts++;
      }
      return targetBlock;
    }

    async function digBlock(bot, targetBlock) {
      try {
        await bot.dig(targetBlock);
        console.log(`[Mining] Mined ${targetBlock.name}`);
      } catch (err) {
        console.error(
          `[Mining] Error digging ${targetBlock.name}: ${err.message}`,
        );
      }
    }

    async function moveToBlock(bot, targetBlock, defaultMove) {
      const moveTimeout = 10000;
      try {
        bot.pathfinder.setMovements(defaultMove);
        const goal = new GoalNear(
          targetBlock.position.x,
          targetBlock.position.y,
          targetBlock.position.z,
          1,
        );
        const gotoPromise = bot.pathfinder.goto(goal);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Movement timed out")),
            moveTimeout,
          ),
        );
        await Promise.race([gotoPromise, timeoutPromise]);
      } catch (err) {
        if (err.message === "Movement timed out") {
          try {
            bot.pathfinder.stop();
          } catch (e) {}
        }
        bot.isMining = false;
        bot.emit("mining_stopped");
      }
    }

    bot.on("goal_reached", () => {
      try {
        if (bot.isMining) {
          bot.isMining = false;
          bot.emit("mining_stopped");
        }
      } catch (err) {
        console.error("[Mining] Error in goal_reached:", err.message);
      }
    });

    bot.on("end", () => {
      try {
        if (miningInterval) clearInterval(miningInterval);
      } catch (err) {
        console.error("[Mining] Error cleaning up:", err.message);
      }
    });
  } catch (err) {
    console.error(
      "[Mining] Fatal error setting up mining module:",
      err.message,
    );
    console.error(err.stack);
  }
}

async function findSpecificBlockNearby(
  bot,
  blockName,
  mcData,
  searchRadius = 128,
  maxAttempts = 20,
) {
  try {
    const blockType = mcData.blocksByName[blockName];
    if (!blockType) {
      console.log(`[MiningCmd] Unknown block type: ${blockName}`);
      return null;
    }

    let attempts = 0;
    while (attempts < maxAttempts) {
      if (!bot.isCommandActive || bot.currentPathTask !== "mine_block_command")
        return null;
      if (!bot.entity) return null;

      try {
        const blockPositions = bot.findBlocks({
          matching: blockType.id,
          maxDistance: searchRadius,
          count: 10,
        });

        if (blockPositions.length > 0) {
          for (const pos of blockPositions) {
            try {
              const actualBlock = bot.blockAt(pos);
              if (!actualBlock || actualBlock.name !== blockName) continue;

              const blockBelow = bot.blockAt(
                actualBlock.position.offset(0, -1, 0),
              );
              if (
                blockBelow &&
                blockBelow.name !== "air" &&
                blockBelow.name !== "water" &&
                blockBelow.name !== "lava"
              ) {
                return actualBlock;
              }
            } catch (e) {
              continue;
            }
          }
        }
      } catch (err) {
        console.error("[MiningCmd] Error in findSpecific:", err.message);
      }

      attempts++;
      if (attempts < maxAttempts) {
        try {
          await bot.waitForTicks(10);
        } catch (e) {
          return null;
        }
      }
    }
  } catch (err) {
    console.error("[MiningCmd] Error in findSpecificBlockNearby:", err.message);
  }
  return null;
}

async function executeCommandMine(bot, blockTypeName, config) {
  let mcData;
  try {
    mcData = require("minecraft-data")(bot.version);
  } catch (err) {
    bot.chat("Error: Could not load game data.");
    return;
  }

  console.log(`[MiningCmd] Mining ${blockTypeName} until full or stopped.`);
  bot.chat(`Starting to mine ${blockTypeName}. Use !stopMine to cancel.`);

  let minedCount = 0;

  try {
    while (true) {
      if (!bot.isCommandActive || bot.currentPathTask !== "mine_block_command")
        break;
      if (!bot.entity) {
        bot.chat("Lost connection. Stopping.");
        break;
      }
      if (!bot.inventory || bot.inventory.emptySlotCount() === 0) {
        bot.chat("Inventory full. Stopping mining.");
        break;
      }

      const targetBlock = await findSpecificBlockNearby(
        bot,
        blockTypeName,
        mcData,
      );
      if (!targetBlock) {
        bot.chat(`No more ${blockTypeName} found nearby. Stopping.`);
        break;
      }

      try {
        const goal = new GoalNear(
          targetBlock.position.x,
          targetBlock.position.y,
          targetBlock.position.z,
          1,
        );
        const GOTO_TIMEOUT_MS_MINING_CMD = 15000;
        let miningCmdGotoTimeoutHandle = null;
        const miningCmdTimeoutPromise = new Promise((resolve) => {
          miningCmdGotoTimeoutHandle = setTimeout(
            () => resolve("timeout"),
            GOTO_TIMEOUT_MS_MINING_CMD,
          );
        });

        const gotoResult = await Promise.race([
          bot.pathfinder.goto(goal),
          miningCmdTimeoutPromise,
        ]);
        if (miningCmdGotoTimeoutHandle)
          clearTimeout(miningCmdGotoTimeoutHandle);

        if (gotoResult === "timeout") {
          bot.chat("Timeout reaching block, trying next.");
          try {
            await bot.waitForTicks(20);
          } catch (e) {
            break;
          }
          continue;
        }
      } catch (err) {
        bot.chat(`Error moving to block. Trying next.`);
        try {
          await bot.waitForTicks(20);
        } catch (e) {
          break;
        }
        continue;
      }

      if (!bot.isCommandActive || bot.currentPathTask !== "mine_block_command")
        break;
      if (!bot.inventory || bot.inventory.emptySlotCount() === 0) {
        bot.chat("Inventory full. Stopping.");
        break;
      }

      try {
        try {
          const bestTool = bot.pathfinder.bestHarvestTool(targetBlock);
          if (bestTool && bot.heldItem?.type !== bestTool.type) {
            await bot.equip(bestTool, "hand");
          }
        } catch (e) {
          /* mine by hand */
        }

        await bot.dig(targetBlock);
        minedCount++;
        try {
          await bot.waitForTicks(15);
        } catch (e) {
          break;
        }
      } catch (err) {
        console.log(`[MiningCmd] Error digging: ${err.message}`);
        try {
          await bot.waitForTicks(20);
        } catch (e) {
          break;
        }
        continue;
      }
      try {
        await bot.waitForTicks(5);
      } catch (e) {
        break;
      }
    }
  } catch (err) {
    console.error(`[MiningCmd] Unexpected error: ${err.message}`);
    try {
      bot.chat("An unexpected error occurred during !mine.");
    } catch (e) {}
  } finally {
    console.log(`[MiningCmd] Finished. Mined ${minedCount} ${blockTypeName}.`);
  }
}

module.exports = { setupMining, executeCommandMine };
