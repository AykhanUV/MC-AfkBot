const { Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

/**
 * Sets up the mining module for the bot.
 * This module periodically attempts to find and mine nearby blocks specified in the configuration.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} config - The bot configuration object, expected to contain a 'mining' section.
 */
function setupMining(bot, config) {
    // Initialize the mining state flag for the bot instance.
    // bot.isMiningEnabled is initialized in bot.js from runtime_state.json
    bot.isMining = false;

    // Load Minecraft data for the bot's version.
    const mcData = require('minecraft-data')(bot.version);
    // Set up default movements for pathfinding.
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    console.log(`[Mining] Module enabled. Interval: ${config.mining.interval / 1000}s`);

    // Set up a repeating task to attempt mining at the configured interval.
    const miningInterval = setInterval(() => {
        // Only attempt to mine if mining is enabled, bot isn't already busy mining,
        // and no user command is active.
        if (bot.isMiningEnabled && !bot.isMining && !bot.isCommandActive) {
            mineRandomBlockNearby(bot, config, defaultMove);
        } else if (!bot.isMiningEnabled) {
            // console.log('[Mining] Interval: Automatic mining is disabled by toggle.'); // Can be spammy
        }
    }, config.mining.interval);

    /**
     * Attempts to find, dig, and move to a random nearby block based on the configuration.
     * This function orchestrates the mining process.
     *
     * @param {mineflayer.Bot} bot - The mineflayer bot instance.
     * @param {object} config - The bot configuration.
     * @param {Movements} defaultMove - The default movement settings for pathfinding.
     */
    async function mineRandomBlockNearby(bot, config, defaultMove) {
        // Prevent starting a new mining task if one is already in progress OR a user command is active.
        if (bot.isMining) {
            // console.log('[Mining] Skipping cycle: Already mining.'); // Already handled by setInterval condition
            return;
        }
        if (bot.isCommandActive) {
            console.log('[Mining] Skipping cycle: Bot is busy with a user command.');
            return;
        }

        // If we've reached here, no command is active, and we are not already mining.
        // Now it's safe to stop any residual pathfinder movement (e.g., from other bot activities)
        // before starting the mining sequence.
        bot.pathfinder.stop();

        console.log('[Mining] Setting isMining = true (Starting cycle)');
        bot.isMining = true; // Set the flag to indicate mining is active.
        bot.emit('mining_started'); // Signal that mining has started
        console.log('[Mining] Starting mining cycle...');

        try {
            // Double check command active status before proceeding with critical mining steps
            if (bot.isCommandActive) {
                console.log('[Mining] Aborting mining cycle: User command became active.');
                bot.isMining = false;
                bot.emit('mining_stopped');
                return;
            }

            // Step 0: Check if the bot's inventory has any empty slots.
            if (bot.inventory.emptySlotCount() === 0) {
                console.log('[Mining] Inventory is full. Skipping mining cycle.');
                console.log('[Mining] Setting isMining = false (Inventory full)');
                bot.isMining = false;
                bot.emit('mining_stopped'); // Signal that mining has stopped
                return;
            }

            // Step 1: Find a suitable block to mine.
            const targetBlock = await findTargetBlock(bot, config);

            if (targetBlock) {
                console.log(`[Mining] Found target block: ${targetBlock.name} at ${targetBlock.position}`);
                // Step 2: Dig the found block.
                await digBlock(bot, targetBlock);

                // Check if mining was interrupted during digBlock
                if (!bot.isMining || bot.isCommandActive) {
                    console.log('[Mining] Mining task interrupted after digging, before moving.');
                    if (bot.isCommandActive && bot.isMining) bot.isMining = false;
                    if (!bot.isMining) bot.emit('mining_stopped'); 
                    return;
                }

                // Step 3: Move towards the location of the mined block.
                await moveToBlock(bot, targetBlock, defaultMove);
            } else {
                console.log('[Mining] No suitable block found nearby.');
                console.log('[Mining] Setting isMining = false (No block found)');
                bot.isMining = false; 
                bot.emit('mining_stopped'); 
            }
        } catch (err) {
            console.error(`[Mining] Unexpected error during mining cycle: ${err.message}`);
            console.error(err.stack); 
            console.log('[Mining] Setting isMining = false (Unexpected error in cycle)');
            bot.isMining = false; 
            bot.emit('mining_stopped'); 
        }
    }

    /**
     * Searches for a random block within a defined radius that matches the configured block types.
     */
    async function findTargetBlock(bot, config) {
        const radius = config.mining.maxDistance || 5; 
        const yRange = 2; 
        let targetBlock = null;
        let attempts = 0;
        const maxAttempts = 10; 

        // console.log(`[Mining] Searching for blocks (${config.mining.blockTypes.join(', ')}) within ${radius} blocks.`); // Less verbose

        while (!targetBlock && attempts < maxAttempts) {
            const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
            const randomY = Math.floor(Math.random() * (yRange * 2 + 1)) - yRange; 
            const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

            const targetPos = bot.entity.position.offset(randomX, randomY, randomZ);
            const block = bot.blockAt(targetPos);

            if (block && block.type !== 0 && config.mining.blockTypes.includes(block.name)) {
                const blockBelow = bot.blockAt(targetPos.offset(0, -1, 0));
                if (blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'water' && blockBelow.name !== 'lava') {
                    targetBlock = block; 
                } else {
                    // console.log(`[Mining] Skipping ${block.name} due to hazard below: ${blockBelow ? blockBelow.name : 'air'}`); // Can be verbose
                }
            }
            attempts++;
        }
        return targetBlock; 
    }

    /**
     * Digs the specified target block using bot.dig().
     */
    async function digBlock(bot, targetBlock) {
        // console.log(`[Mining] Attempting to dig ${targetBlock.name} at ${targetBlock.position}`); // Less verbose
        try {
            await bot.dig(targetBlock);
            console.log(`[Mining] Successfully mined ${targetBlock.name}`);
        } catch (err) {
            console.error(`[Mining] Error digging block ${targetBlock.name}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Instructs the bot to move towards the position of the recently mined block.
     */
    async function moveToBlock(bot, targetBlock, defaultMove) {
        // console.log(`[Mining] Moving towards mined block location: ${targetBlock.position}`); // Less verbose
        const moveTimeout = 10000; 

        try {
            bot.pathfinder.setMovements(defaultMove);
            const goal = new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1);
            const gotoPromise = bot.pathfinder.goto(goal);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Movement timed out')), moveTimeout)
            );
            await Promise.race([gotoPromise, timeoutPromise]);
        } catch (err) {
            if (err.message === 'Movement timed out') {
                console.log(`[Mining] Movement to ${targetBlock.position} timed out after ${moveTimeout / 1000}s. Stopping pathfinding.`);
                bot.pathfinder.stop(); 
                console.log('[Mining] Setting isMining = false (Movement timed out)');
                bot.isMining = false; 
                bot.emit('mining_stopped'); 
            } else {
                console.error(`[Mining] Error moving to block location: ${err.message}`);
                // console.error(err.stack); // Stack trace can be too much for regular errors
                console.log('[Mining] Setting isMining = false (Movement error)');
                bot.isMining = false;
                bot.emit('mining_stopped'); 
            }
        }
    }

    bot.on('goal_reached', () => {
        if (bot.isMining) {
            // console.log(`[Mining] Reached goal after mining.`); // Less verbose
            console.log('[Mining] Setting isMining = false (Goal reached)');
            bot.isMining = false; 
            bot.emit('mining_stopped'); 
        }
    });

    bot.on('end', () => {
        if (miningInterval) {
            clearInterval(miningInterval);
            console.log('[Mining] Cleared mining interval on bot disconnect.');
        }
    });
}

// Helper function for !mine command
async function findSpecificBlockNearby(bot, blockName, mcData, searchRadius = 128, maxAttempts = 20) {
    const blockType = mcData.blocksByName[blockName];
    if (!blockType) {
        console.log(`[MiningCmd] Unknown block type: ${blockName}`); // Keep this important log
        return null;
    }

    // console.log(`[MiningCmd] [findSpecific] Searching for ${blockName} (ID: ${blockType.id}) within ${searchRadius} blocks around ${bot.entity.position}.`);
    let attempts = 0;
    while (attempts < maxAttempts) {
        if (!bot.isCommandActive || bot.currentPathTask !== 'mine_block_command') {
            // console.log(`[MiningCmd] [findSpecific] Mining command was cancelled during block search for ${blockName}.`);
            return null; 
        }

        // console.log(`[MiningCmd] [findSpecific] Attempt ${attempts + 1}/${maxAttempts} to find ${blockName}.`);
        
        const blockPositions = bot.findBlocks({ 
            matching: blockType.id,
            maxDistance: searchRadius,
            count: 10 
        });

        // console.log(`[MiningCmd] [findSpecific] bot.findBlocks found ${blockPositions.length} potential positions for ${blockName}.`);

        if (blockPositions.length > 0) {
            for (const pos of blockPositions) { 
                const actualBlock = bot.blockAt(pos); 
                if (!actualBlock) {
                    // console.log(`[MiningCmd] [findSpecific] Null block at position ${pos}, skipping.`);
                    continue;
                }
                if (actualBlock.name !== blockName) {
                    // console.log(`[MiningCmd] [findSpecific] Found ${actualBlock.name} instead of ${blockName} at ${pos}, skipping.`);
                    continue;
                }

                // console.log(`[MiningCmd] [findSpecific] Checking block ${actualBlock.name} at ${actualBlock.position}.`);
                const blockBelow = bot.blockAt(actualBlock.position.offset(0, -1, 0));
                
                if (blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'water' && blockBelow.name !== 'lava') {
                    // console.log(`[MiningCmd] [findSpecific] Found valid ${actualBlock.name} at ${actualBlock.position} with solid ground below (${blockBelow.name}).`);
                    return actualBlock; 
                } else {
                    // console.log(`[MiningCmd] [findSpecific] Skipping ${actualBlock.name} at ${actualBlock.position} due to hazard below: ${blockBelow ? blockBelow.name : 'null (likely air)'}.`);
                }
            }
            // console.log(`[MiningCmd] [findSpecific] All ${blockPositions.length} found blocks for ${blockName} had hazards or were invalid in this attempt.`);
        }
        attempts++;
        if (attempts < maxAttempts) {
            await bot.waitForTicks(10); 
        }
    }
    // console.log(`[MiningCmd] [findSpecific] No valid ${blockName} found after ${maxAttempts} attempts.`);
    return null; 
}

// New main function for the !mine command
async function executeCommandMine(bot, blockTypeName, config) { 
    const mcData = require('minecraft-data')(bot.version); 
    // const defaultMove = new Movements(bot, mcData); // Not strictly needed if using direct goto

    console.log(`[MiningCmd] Attempting to mine ${blockTypeName} until inventory full or stopped.`);
    bot.chat(`Starting to mine ${blockTypeName}. Use !stopMine to cancel.`);

    let minedCount = 0;

    try {
        while (true) {
            if (!bot.isCommandActive || bot.currentPathTask !== 'mine_block_command') {
                console.log('[MiningCmd] Mining command was cancelled or superseded.');
                break;
            }

            if (bot.inventory.emptySlotCount() === 0) {
                console.log('[MiningCmd] Inventory is full.');
                bot.chat('Inventory full. Stopping mining operation.');
                break;
            }

            const targetBlock = await findSpecificBlockNearby(bot, blockTypeName, mcData);

            if (!targetBlock) {
                console.log(`[MiningCmd] No more ${blockTypeName} found nearby.`);
                bot.chat(`No more ${blockTypeName} found nearby. Stopping mining.`);
                break;
            }
            // console.log(`[MiningCmd] Found ${blockTypeName} at ${targetBlock.position}.`); // Less verbose

            try {
                const goal = new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1);
                const GOTO_TIMEOUT_MS_MINING_CMD = 15000;
                let miningCmdGotoTimeoutHandle = null;
                const miningCmdTimeoutPromise = new Promise((resolve) => {
                    miningCmdGotoTimeoutHandle = setTimeout(() => resolve('timeout'), GOTO_TIMEOUT_MS_MINING_CMD);
                });
                
                const gotoResult = await Promise.race([bot.pathfinder.goto(goal), miningCmdTimeoutPromise]);
                
                if (miningCmdGotoTimeoutHandle) clearTimeout(miningCmdGotoTimeoutHandle);

                if (gotoResult === 'timeout') {
                    console.log(`[MiningCmd] Timeout reaching ${targetBlock.position} for ${blockTypeName}. Skipping this block.`);
                    bot.chat(`Timeout reaching block, trying next one.`);
                    await bot.waitForTicks(20);
                    continue;
                }
            } catch (err) {
                console.log(`[MiningCmd] Error pathfinding to ${targetBlock.name} for ${blockTypeName}: ${err.message}. Skipping this block.`);
                bot.chat(`Error moving to block: ${err.message}. Trying next one.`);
                await bot.waitForTicks(20);
                continue;
            }
            
            if (!bot.isCommandActive || bot.currentPathTask !== 'mine_block_command') {
                console.log('[MiningCmd] Mining command was cancelled during pathfinding.');
                break;
            }
            if (bot.inventory.emptySlotCount() === 0) {
                console.log('[MiningCmd] Inventory full after pathfinding.');
                bot.chat('Inventory full. Stopping mining operation.');
                break;
            }

            try {
                const bestTool = bot.pathfinder.bestHarvestTool(targetBlock);

                if (bestTool) {
                    // console.log(`[MiningCmd] [ToolSelect] Best tool identified by pathfinder: ${bestTool.name} for ${targetBlock.name}`); // Less verbose
                    if (bot.heldItem?.type !== bestTool.type) {
                        // console.log(`[MiningCmd] Equipping ${bestTool.name}.`); // Less verbose
                        await bot.equip(bestTool, 'hand');
                    } else {
                        // console.log(`[MiningCmd] Already holding ${bestTool.name}.`); // Less verbose
                    }
                } else {
                    // console.log(`[MiningCmd] [ToolSelect] No suitable tool found by pathfinder for ${targetBlock.name}. Mining by hand.`); // Less verbose
                }
                
                await bot.dig(targetBlock);
                minedCount++;
                // console.log(`[MiningCmd] Successfully dug ${blockTypeName}. Mined count: ${minedCount}. Waiting for item drop.`); // Less verbose
                await bot.waitForTicks(15); 
            } catch (err) {
                console.log(`[MiningCmd] Error digging ${targetBlock.name} for ${blockTypeName}: ${err.message}.`);
                bot.chat(`Error digging ${blockTypeName}: ${err.message}.`);
                await bot.waitForTicks(20);
                continue;
            }
            await bot.waitForTicks(5);
        }
    } catch (err) {
        console.error(`[MiningCmd] Unexpected error during executeCommandMine: ${err.message}\n${err.stack}`);
        bot.chat('An unexpected error occurred during !mine command.');
    } finally {
        console.log(`[MiningCmd] executeCommandMine finished. Mined ${minedCount} ${blockTypeName}.`);
    }
}

module.exports = { setupMining, executeCommandMine };
