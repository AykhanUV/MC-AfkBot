const mineflayer = require('mineflayer');
const config = require('../settings.json');
const { createBot } = require('./bot');
const util = require('minecraft-server-util'); // Require the minecraft-server-util library

let bot = null; // Store the bot instance
let shouldBeActive = true; // Track whether the bot *should* be running

/**
 * Checks the player status on the Minecraft server.
 * Uses minecraft-server-util to avoid creating a bot instance for just checking.
 *
 * @returns {Promise<{online: number, sample: Array<{id: string, name: string}>|null}|null>}
 *          - An object with online count and player sample list, or null on error.
 */
async function getPlayerStatus() {
    try {
        const status = await util.status(config.server.ip, config.server.port, { timeout: 5000 }); // Shorter timeout
        return {
            online: status.players.online,
            sample: status.players.sample || [] // Ensure sample is an array, even if null/undefined
        };
    } catch (err) {
        console.error(`[index.js] Error getting server status: ${err.message}`);
        return null; // Indicate an error occurred
    }
}

/**
 * Starts the Minecraft bot.
 * Creates a new bot instance and sets up its event listeners.
 */
function startBot() {
    if (bot) return; // Prevent creating multiple bots

    console.log('[index.js] Starting bot...');
    bot = createBot(config); // Create the bot instance

    bot.once('end', () => {
        console.log('[index.js] Bot disconnected.');
        bot = null; // Clear the bot instance
        // The checkInterval will handle the reconnect (if needed)
    });
}

/**
 * Stops the Minecraft bot.
 * Quits the current bot instance and clears the reference.
 */
function stopBot() {
    if (!bot) return; // No bot to stop

    console.log('[index.js] Stopping bot...');
    bot.quit(); // Tell the bot to disconnect
    bot = null; // Clear the bot instance (already done in 'end' event, but double-check)
}

/**
 * The main function that controls the bot's activity based on player count.
 */
async function manageBotActivity() {
    const status = await getPlayerStatus();

    if (status === null) {
        console.log('[index.js] Could not retrieve player status. Retrying later.');
        return; // Try again later
    }

    const playerCount = status.online;
    const playerSample = status.sample;

    // Determine the actual number of *other* players online
    let otherPlayerCount = playerCount;
    if (bot && playerCount === 1 && playerSample.length === 1) {
        // If only one player is online, check if it's the bot itself
        if (playerSample[0].name === config['bot-account'].username) {
            otherPlayerCount = 0; // It's just the bot
        }
    } else if (bot && playerCount > 1) {
         // If the bot is online and there are multiple players, assume at least one is not the bot
         // (We could refine this by filtering the sample list, but this is simpler)
         otherPlayerCount = playerCount; // Treat as > 0 other players
    } else if (!bot) {
        // If bot is offline, playerCount is the otherPlayerCount
        otherPlayerCount = playerCount;
    }


    const playerActivityEnabled = config.utils['player-activity']?.enabled === true;
    const leaveWhenPlayerJoins = config.utils['player-activity']?.leaveWhenPlayerJoins === true;

    if (playerActivityEnabled) {
        // Player-activity is enabled
        if (otherPlayerCount === 0 && !bot && shouldBeActive) {
            console.log('[index.js] Server empty, starting bot.');
            startBot(); // Start the bot if server is empty and it should be active
        } else if (otherPlayerCount > 0 && bot && leaveWhenPlayerJoins) {
            console.log('[index.js] Other player(s) detected, stopping bot.');
            stopBot(); // Stop the bot if another player is present and setting is enabled
        } else if (otherPlayerCount === 0 && bot) {
             console.log('[index.js] Server empty, bot is running (as expected).');
        } else if (otherPlayerCount > 0 && !bot) {
             console.log('[index.js] Other player(s) detected, bot remains offline (as expected).');
        }
    } else {
        // Player-activity is disabled, use the old auto-reconnect logic (based on total player count)
        if (playerCount === 0 && !bot && shouldBeActive) {
             console.log('[index.js] Server empty (player activity disabled), starting bot.');
            startBot();
        } else if (playerCount > 0 && bot) {
             console.log('[index.js] Player(s) detected (player activity disabled), stopping bot.');
            stopBot();
        }
    }
}

// --- Main Program ---

// Set the initial state based on configuration
if (config.utils['player-activity']?.enabled === true) {
    shouldBeActive = true; // Bot should be active initially
} else {
    shouldBeActive = config.utils['auto-reconnect'] === true; // Use old setting
}

// Start the periodic check
const checkIntervalSeconds = (config.utils['player-activity']?.checkIntervalSeconds || config.utils['auto-reconnect-delay'] || 30);
const checkInterval = checkIntervalSeconds * 1000; // Convert to milliseconds

console.log(`[index.js] Setting up activity check. Interval: ${checkIntervalSeconds}s`);
setInterval(manageBotActivity, checkInterval);

// Perform the first check immediately
manageBotActivity();
