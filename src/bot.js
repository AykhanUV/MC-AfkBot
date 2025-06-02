const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { setupAuth } = require('./auth');
const { setupChat } = require('./chat');
const { setupCommands } = require('./commands');
const { setupWebserver } = require('./webserver');
const { setupMining } = require('./mining');

/**
 * Creates and configures the Minecraft bot.
 * This is the main function that initializes the bot, loads plugins, and sets up event listeners.
 *
 * @param {object} config - The bot configuration object, loaded from settings.json.
 * @param {object} initialRuntimeState - The initial runtime state (e.g., from runtime_state.json).
 * @returns {mineflayer.Bot} - The created and configured mineflayer bot instance.
 */
function createBot(config, initialRuntimeState) {
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

    // Initialize runtime states on the bot object
    bot.isMiningEnabled = initialRuntimeState.isMiningEnabled;
    // Add other runtime states here if needed in the future

    console.log('[Bot] Bot instance created. Setting up event listeners...');

    // This event is triggered once the bot has spawned into the Minecraft world.
    bot.once('spawn', () => {
        console.log('[Bot] Bot spawned. Loading plugins and setting up modules...');

        // Load the pathfinder plugin for navigation.
        bot.loadPlugin(pathfinder);
        // Disable colors in chat to simplify logging.
        bot.settings.colorsEnabled = false;

        console.log('[Bot] Plugins loaded. Setting up modules...');

        // Set up the various bot modules (authentication, chat, commands, webserver, mining).
        setupAuth(bot, config);
        setupChat(bot, config);
        setupCommands(bot, config);
        setupWebserver(bot, config);
        setupMining(bot, config);

        console.log('[Bot] Modules setup complete.');
    });

    // Event listener for when a player joins the server.
    bot.on('playerJoined', (player) => {
        if (player.username === bot.username) return; // Ignore the bot's own join event

        console.log(`[Bot] Player ${player.username} joined the server.`);

        const playerActivityEnabled = config.utils['player-activity']?.enabled === true;
        const leaveWhenPlayerJoins = config.utils['player-activity']?.leaveWhenPlayerJoins === true;

        if (playerActivityEnabled && leaveWhenPlayerJoins) {
            console.log('[Bot] Player activity enabled and leaveWhenPlayerJoins is true. Quitting...');
            bot.quit(); // Quit the bot
        }
    });

    // Event listener for when the bot gets kicked from the server.
    bot.on('kicked', (reason) => {
        console.log(`[Bot] Kicked for reason: ${reason}`);
        // Note: The 'end' event will also fire after being kicked.
    });

    // Event listener for handling errors.
    bot.on('error', (err) => {
        console.error('[Bot] Error occurred:');
        console.error(err.stack || err); // Log stack trace if available
        // Note: The 'end' event might fire after certain errors.
    });

    // Event listener for when the bot dies.
    bot.on('death', () => {
        console.log('\x1b[33m[Bot] Bot died and respawned.\x1b[0m'); // Yellow color
        // Reset the mining state if the bot dies while mining.
        if (bot.isMining) {
            console.log('[Bot] Setting isMining = false (Bot died)');
            bot.isMining = false;
            bot.emit('mining_stopped'); // Ensure mining stopped event is emitted
        }
    });

    // Event listener for when the bot disconnects from the server.
    bot.on('end', (reason) => { // reason might be available depending on version/cause
        console.log(`[Bot] Disconnected from server. Reason: ${reason || 'N/A'}`);

        const playerActivityEnabled = config.utils['player-activity']?.enabled === true;

        // If player activity control is DISABLED, handle reconnect internally using old logic.
        if (!playerActivityEnabled) {
            if (config.utils['auto-reconnect']) {
                const delay = (config.utils['auto-reconnect-delay'] || 10) * 1000;
                console.log(`[Bot] Auto-reconnect enabled (player activity disabled). Reconnecting in ${delay / 1000}s...`);
                setTimeout(() => {
                    // We need to call the *global* startBot from index.js, not createBot directly
                    // This is tricky because bot.js doesn't know about index.js's startBot.
                    // For simplicity here, we'll just log that index.js *should* handle it
                    // if it was started in the non-player-activity mode.
                    // A more robust solution might involve passing a restart callback.
                    console.log('[Bot] Reconnect attempt should be handled by index.js if started in standard mode.');
                    // If index.js *only* called startBot once, this bot instance is gone,
                    // and nothing will restart it unless the whole process is managed externally.
                    // --> Let's revert to the original simple reconnect for this mode:
                    // setTimeout(() => createBot(config), delay); // This creates a *new* independent bot process on end
                    // --> Correction: The original logic called createBot, let's keep that for now.
                     setTimeout(() => createBot(config), delay);

                }, delay);
            } else {
                console.log('[Bot] Auto-reconnect disabled. Not attempting to reconnect.');
            }
        } else {
             console.log('[Bot] Player activity enabled. Reconnect logic handled by index.js.');
        }
    });

    console.log('[Bot] Event listeners setup complete. Returning bot instance.');
    return bot; // Return the created bot instance.
}

// Export the createBot function for use in index.js
module.exports = { createBot };
