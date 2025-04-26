const mineflayer = require('mineflayer');
const config = require('../settings.json');
const { createBot } = require('./bot');
const util = require('minecraft-server-util'); // Require the minecraft-server-util library

let bot = null; // Store the bot instance

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
        console.error(err.stack); // Add stack trace for debugging
        return null; // Indicate an error occurred
    }
}

/**
 * Starts the Minecraft bot.
 * Creates a new bot instance and sets up its event listeners.
 * Handles the 'end' event differently based on config.
 */
function startBot() {
    if (bot) return; // Prevent creating multiple bots

    console.log('[index.js] Starting bot...');
    bot = createBot(config); // Create the bot instance

    // Handle bot disconnection
    bot.once('end', () => {
        console.log('[index.js] Bot instance disconnected.');
        // const currentBotInstance = bot; // This variable is unused
        bot = null; // Clear the global bot instance reference

        // Reconnect logic is handled either by the manageBotActivity interval (if player-activity enabled)
        // OR by the bot's internal 'end' handler in bot.js (if player-activity disabled)
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
    bot = null; // Clear the bot instance
}

/**
 * The main function that controls the bot's activity based on player count.
 * This is only called if player-activity is enabled.
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
        if (playerSample[0].name === config['bot-account'].username) {
            otherPlayerCount = 0;
        }
    } else if (bot && playerCount > 1) {
         otherPlayerCount = playerCount;
    } else if (!bot) {
        otherPlayerCount = playerCount;
    }

    const leaveWhenPlayerJoins = config.utils['player-activity']?.leaveWhenPlayerJoins === true;

    // Logic when player-activity is enabled
    if (otherPlayerCount === 0 && !bot) {
        console.log('[index.js] Server empty, starting bot.');
        startBot();
    } else if (otherPlayerCount > 0 && bot && leaveWhenPlayerJoins) {
        console.log('[index.js] Other player(s) detected, stopping bot.');
        stopBot();
    } else if (otherPlayerCount === 0 && bot) {
        console.log('[index.js] Server empty, bot is running (as expected).');
    } else if (otherPlayerCount > 0 && !bot && leaveWhenPlayerJoins) { // Only log this if bot *should* be offline
        console.log('[index.js] Other player(s) detected, bot remains offline (as expected).');
    } else if (otherPlayerCount > 0 && !bot && !leaveWhenPlayerJoins) {
        // If leaveWhenPlayerJoins is false, the bot *should* be running, but isn't. Start it.
        console.log('[index.js] Other player(s) detected, but bot should be running (leaveWhenPlayerJoins=false). Starting bot.');
        startBot();
    }
}

// --- Main Program ---

const playerActivityEnabled = config.utils['player-activity']?.enabled === true;

if (playerActivityEnabled) {
    // Player Activity Mode: Start the periodic check
    const checkIntervalSeconds = config.utils['player-activity'].checkIntervalSeconds || 30;
    const checkInterval = checkIntervalSeconds * 1000;

    console.log(`[index.js] Player activity control enabled. Setting up check interval: ${checkIntervalSeconds}s`);
    setInterval(manageBotActivity, checkInterval);

    // Perform the first check immediately
    manageBotActivity();
} else {
    // Standard Mode: Just start the bot and let bot.js handle reconnects
    console.log('[index.js] Player activity control disabled. Starting bot directly.');
    startBot(); // Call startBot only once if the feature is disabled
}
