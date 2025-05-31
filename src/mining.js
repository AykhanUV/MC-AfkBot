const { Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

/**
 * Sets up the mining module for the bot.
 * This module periodically attempts to find and mine nearby blocks specified in the configuration.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} config - The bot configuration object, expected to contain a 'mining' section.
 */
function setupMining(bot, config) {
    // Exit if mining is not enabled in the configuration.
    if (!config.mining.enabled) {
        console.log('[Mining] Module disabled in settings.json.');
        return;
    }

    // Initialize the mining state flag for the bot instance.
    bot.isMining = false;

    // Load Minecraft data for the bot's version.
    const mcData = require('minecraft-data')(bot.version);
    // Set up default movements for pathfinding.
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    console.log(`[Mining] Module enabled. Interval: ${config.mining.interval / 1000}s`);

    // Set up a repeating task to attempt mining at the configured interval.
    const miningInterval = setInterval(() => {
        // Only attempt to mine if the bot isn't already busy mining.
        if (!bot.isMining) {
            mineRandomBlockNearby(bot, config, defaultMove);
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
        // Prevent starting a new mining task if one is already in progress.
        if (bot.isMining) {
            return;
        }
        // Stop any existing pathfinder movement (likely from anti-AFK)
        bot.pathfinder.stop();
        console.log('[Mining] Setting isMining = true (Starting cycle)');
        bot.isMining = true; // Set the flag to indicate mining is active.
        bot.emit('mining_started'); // Signal that mining has started
        console.log('[Mining] Starting mining cycle...');

        try {
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
                // Step 3: Move towards the location of the mined block.
                await moveToBlock(bot, targetBlock, defaultMove);
                // Note: The 'goal_reached' event or timeout in moveToBlock will handle setting bot.isMining = false
            } else {
                console.log('[Mining] No suitable block found nearby.');
                console.log('[Mining] Setting isMining = false (No block found)');
                bot.isMining = false; // Reset flag if no block was found.
                bot.emit('mining_stopped'); // Signal that mining has stopped
            }
        } catch (err) {
            // Catch any unexpected errors during the mining cycle.
            console.error(`[Mining] Unexpected error during mining cycle: ${err.message}`);
            console.error(err.stack); // Log stack trace for debugging
            console.log('[Mining] Setting isMining = false (Unexpected error in cycle)');
            bot.isMining = false; // Ensure the flag is reset on error.
            bot.emit('mining_stopped'); // Signal that mining has stopped
        }
    }

    /**
     * Searches for a random block within a defined radius that matches the configured block types.
     *
     * @param {mineflayer.Bot} bot - The mineflayer bot instance.
     * @param {object} config - The bot configuration, containing 'mining.blockTypes'.
     * @returns {Promise<Block|null>} - A Promise that resolves with the found block object, or null if no suitable block is found within the attempts limit.
     */
    async function findTargetBlock(bot, config) {
        const radius = config.mining.maxDistance || 5; // Use configured maxDistance or default to 5
        const yRange = 2; // Vertical range to search relative to the bot's feet.
        let targetBlock = null;
        let attempts = 0;
        const maxAttempts = 10; // Limit the number of random positions to check.

        console.log(`[Mining] Searching for blocks (${config.mining.blockTypes.join(', ')}) within ${radius} blocks.`);

        while (!targetBlock && attempts < maxAttempts) {
            // Generate random offsets within the search area.
            const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
            const randomY = Math.floor(Math.random() * (yRange * 2 + 1)) - yRange; // Search slightly above/below bot
            const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

            // Calculate the potential target position.
            const targetPos = bot.entity.position.offset(randomX, randomY, randomZ);
            // Get the block at the calculated position.
            const block = bot.blockAt(targetPos);

            // Check if the block is valid, not air, and is in the allowed block types list.
            if (block && block.type !== 0 && config.mining.blockTypes.includes(block.name)) {
                // Basic hazard detection: Check the block below.
                const blockBelow = bot.blockAt(targetPos.offset(0, -1, 0));
                if (blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'water' && blockBelow.name !== 'lava') {
                    targetBlock = block; // Found a suitable and safe block.
                } else {
                    console.log(`[Mining] Skipping ${block.name} due to hazard below: ${blockBelow ? blockBelow.name : 'air'}`);
                }
            }

            attempts++;
        }

        return targetBlock; // Return the found block or null.
    }

    /**
     * Digs the specified target block using bot.dig().
     * Handles potential errors during the digging process.
     *
     * @param {mineflayer.Bot} bot - The mineflayer bot instance.
     * @param {Block} targetBlock - The block object to be dug.
     */
    async function digBlock(bot, targetBlock) {
        console.log(`[Mining] Attempting to dig ${targetBlock.name} at ${targetBlock.position}`);
        try {
            // Use the built-in bot.dig function, which handles timing and tool selection.
            await bot.dig(targetBlock);
            console.log(`[Mining] Successfully mined ${targetBlock.name}`);
        } catch (err) {
            console.error(`[Mining] Error digging block ${targetBlock.name}: ${err.message}`);
            // Rethrow the error to be caught by the main mining cycle, which resets the flag.
            throw err;
        }
    }

    /**
     * Instructs the bot to move towards the position of the recently mined block.
     * Uses mineflayer-pathfinder to navigate, with a timeout.
     *
     * @param {mineflayer.Bot} bot - The mineflayer bot instance.
     * @param {Block} targetBlock - The block that was just mined (used for its position).
     * @param {Movements} defaultMove - The default movement settings for pathfinding.
     */
    async function moveToBlock(bot, targetBlock, defaultMove) {
        console.log(`[Mining] Moving towards mined block location: ${targetBlock.position}`);
        const moveTimeout = 10000; // Timeout in milliseconds (e.g., 10 seconds)

        try {
            // Set the pathfinder's movement configuration.
            bot.pathfinder.setMovements(defaultMove);
            // Set the goal to be near the mined block's position (within 1 block).
            const goal = new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1);

            // Create a promise for the pathfinding operation.
            const gotoPromise = bot.pathfinder.goto(goal);

            // Create a timeout promise.
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Movement timed out')), moveTimeout)
            );

            // Race the pathfinding against the timeout.
            await Promise.race([gotoPromise, timeoutPromise]);
            // If gotoPromise resolves first, this line is reached.
            // The 'goal_reached' event will handle resetting the isMining flag.

        } catch (err) {
            if (err.message === 'Movement timed out') {
                console.log(`[Mining] Movement to ${targetBlock.position} timed out after ${moveTimeout / 1000}s. Stopping pathfinding.`);
                bot.pathfinder.stop(); // Stop the pathfinder
                console.log('[Mining] Setting isMining = false (Movement timed out)');
                bot.isMining = false; // Reset mining state manually
                bot.emit('mining_stopped'); // Signal that mining has stopped
            } else {
                console.error(`[Mining] Error moving to block location: ${err.message}`);
                console.error(err.stack); // Log stack trace for debugging movement errors
                // If movement fails for other reasons, reset the mining flag immediately.
                console.log('[Mining] Setting isMining = false (Movement error)');
                bot.isMining = false;
                bot.emit('mining_stopped'); // Signal that mining has stopped
            }
        }
    }

    // Listen for the event indicating the bot has reached its pathfinding goal.
    bot.on('goal_reached', () => {
        // Check if the bot was actually mining before resetting the flag.
        // This prevents resetting if a non-mining goal was reached.
        if (bot.isMining) {
            console.log(`[Mining] Reached goal after mining.`);
            console.log('[Mining] Setting isMining = false (Goal reached)');
            bot.isMining = false; // Reset the mining flag.
            bot.emit('mining_stopped'); // Signal that mining has stopped
        } else {
        }
    });

    // Optional: Add cleanup if the bot disconnects
    bot.on('end', () => {
        if (miningInterval) {
            clearInterval(miningInterval);
            console.log('[Mining] Cleared mining interval on bot disconnect.');
        }
    });
}

// Export the setup function for use in bot.js
module.exports = { setupMining };
