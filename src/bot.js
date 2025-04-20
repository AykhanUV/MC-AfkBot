const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { setupAuth } = require('./auth');
const { setupAntiAfk } = require('./antiAfk');
const { setupChat } = require('./chat');
const { setupCommands } = require('./commands');
const { setupWebserver } = require('./webserver');
const { setupMining } = require('./mining');

/**
 * Creates and configures the Minecraft bot.
 * This is the main function that initializes the bot, loads plugins, and sets up event listeners.
 *
 * @param {object} config - The bot configuration object, loaded from settings.json.
 * @returns {mineflayer.Bot} - The created and configured mineflayer bot instance.
 */
function createBot(config) {
    console.log('[Bot] Creating bot instance...');

    // Create the Minecraft bot instance using options from the config file.
    const bot = mineflayer.createBot({
        username: config['bot-account']['username'], // Bot username from config
        password: config['bot-account']['password'], // Bot password from config (if needed)
        auth: config['bot-account']['type'],       // Authentication type (e.g., 'mojang', 'microsoft')
        host: config.server.ip,                  // Server IP address from config
        port: config.server.port,                // Server port from config
        version: config.server.version,          // Minecraft version from config
    });

    console.log('[Bot] Bot instance created. Setting up event listeners...');

    // This event is triggered once the bot has spawned into the Minecraft world.
    bot.once('spawn', () => {
        console.log('[Bot] Bot spawned. Loading plugins and setting up modules...');

        // Load the pathfinder plugin for navigation.
        bot.loadPlugin(pathfinder);
        // Disable colors in chat to simplify logging.
        bot.settings.colorsEnabled = false;

        console.log('[Bot] Plugins loaded. Setting up modules...');

        // Set up the various bot modules (authentication, anti-AFK, chat, commands, webserver, mining).
        setupAuth(bot, config);
        setupAntiAfk(bot, config);
        setupChat(bot, config);
        setupCommands(bot, config);
        setupWebserver(bot, config);
        setupMining(bot, config);

        console.log('[Bot] Modules setup complete.');
    });

    // Event listener for when the bot gets kicked from the server.
    bot.on('kicked', (reason) => {
        console.log(`[Bot] Kicked for reason: ${reason}`);
    });

    // Event listener for handling errors.
    bot.on('error', (err) => {
        console.error('[Bot] Error:', err);
    });

    // Event listener for when the bot dies.
    bot.on('death', () => {
        console.log('\x1b[33m[Bot] Bot died and respawned.\x1b[0m'); // Yellow color
        // Reset the mining state if the bot dies while mining.
        if (bot.isMining) {
            console.log('[Bot] Resetting mining state due to death.');
            bot.isMining = false;
        }
    });

    // Event listener for when the bot disconnects from the server.
    bot.on('end', () => {
        console.log('[Bot] Disconnected from server.');
        // Attempt to reconnect if auto-reconnect is enabled in the config.
        if (config.utils['auto-reconnect']) {
            console.log('[Bot] Auto-reconnect enabled. Attempting to reconnect...');
            setTimeout(() => {
                createBot(config); // Re-create the bot instance.
            }, config.utils['auto-reconnect-delay'] * 1000); // Use the configured delay.
        } else {
            console.log('[Bot] Auto-reconnect disabled. Not attempting to reconnect.');
        }
    });

    console.log('[Bot] Event listeners setup complete. Returning bot instance.');
    return bot; // Return the created bot instance.
}

// Export the createBot function for use in index.js
module.exports = { createBot };
