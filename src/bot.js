const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { setupAuth } = require('./auth');
const { setupAntiAfk } = require('./antiAfk');
const { setupChat } = require('./chat');
const { setupCommands } = require('./commands');
const { setupWebserver } = require('./webserver');
const { setupMining } = require('./mining');

function createBot(config) {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.once('spawn', () => {
    bot.loadPlugin(pathfinder);
    bot.settings.colorsEnabled = false;

    console.log('[DEBUG] Bot spawned. Setting up modules...');

    setupAuth(bot, config);
    setupAntiAfk(bot, config);
    setupChat(bot, config);
    setupCommands(bot, config);
    setupWebserver(bot, config);
    setupMining(bot, config);

    console.log('[DEBUG] Modules setup complete.');


    bot.on('kicked', (reason) =>
      console.log(`[Bot] Kicked for reason: ${reason}`)
    );

    bot.on('error', (err) => {
      console.error('[Bot] Error:', err);
    });
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[Bot] Bot died and respawned.\x1b[0m`);
    if (bot.isMining) {
      console.log('[Bot] Resetting mining state due to death.');
      bot.isMining = false;
    }
  });

    bot.on('end', () => {
        if (config.utils['auto-reconnect']) {
            console.log('[Bot] Disconnected, attempting to reconnect...');
            setTimeout(() => {
                createBot(config);
            }, config.utils['auto-reconnect-delay'] * 1000);
        }
    });

  return bot;
}

module.exports = { createBot };
