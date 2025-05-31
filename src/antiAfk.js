const { Movements, goals: { GoalNear, GoalGetToBlock, GoalBlock } } = require('mineflayer-pathfinder');

// Store interval IDs globally within the module scope, associated with the bot instance
const botTimers = new Map(); // Use a Map to store timers per bot instance if needed, though unlikely here

function setupAntiAfk(bot, config) {
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    if (!config.utils['anti-afk'].enabled) {
        console.log('[Anti-AFK] Module disabled in settings.json.');
        return;
    }
    console.log('[Anti-AFK] Module enabled.');

    const antiAFK = config.utils['anti-afk'];
    const currentTimers = { // Object to hold timers for *this* bot instance
        jumping: null,
        rotation: null,
    };
    botTimers.set(bot.username, currentTimers); // Store timers associated with this bot



    // --- Jumping ---
    if (antiAFK.jumping.enabled) {
        console.log(`[Anti-AFK] Jumping enabled. Interval: ${antiAFK.jumping.interval / 1000}s, Probability: ${antiAFK.jumping.probability}`);
        currentTimers.jumping = setInterval(() => {
            if (!bot || !bot.entity) return;
            if (!bot.isMining) {
                if (Math.random() < antiAFK.jumping.probability) {
                    console.log('[Anti-AFK] Performing jump.');
                    bot.setControlState('jump', true);
                    setTimeout(() => {
                        // Check bot still exists before setting control state
                        if (bot && bot.setControlState) {
                            bot.setControlState('jump', false);
                        }
                    }, 500); // Short delay to ensure jump happens
                }
            } else {
            }
        }, antiAFK.jumping.interval);
    }

    // --- Rotation ---
    if (antiAFK.rotation.enabled) {
        console.log(`[Anti-AFK] Rotation enabled. Interval: ${antiAFK.rotation.interval / 1000}s`);
        currentTimers.rotation = setInterval(() => {
            if (!bot || !bot.entity) return;
            if (!bot.isMining) {
                rotateRandomly(bot);
            } else {
            }
        }, antiAFK.rotation.interval);
    }



    // --- Cleanup on Bot End ---
    const cleanupListener = () => {
        console.log(`[Anti-AFK] Cleaning up timers for bot ${bot.username || 'instance'}.`);
        const timersToClear = botTimers.get(bot.username);
        if (timersToClear) {
            // Clear other intervals
            if (timersToClear.jumping) clearInterval(timersToClear.jumping);
            if (timersToClear.rotation) clearInterval(timersToClear.rotation);

            console.log('[Anti-AFK] All timers cleared.');
            botTimers.delete(bot.username); // Remove entry for this bot
        }
    };
    bot.once('end', cleanupListener); // Use once to ensure it only runs once per bot instance end
}

// --- Action Functions ---
// (Keep the internal !bot.isMining checks as a secondary safeguard)




function rotateRandomly(bot) {
     if (!bot || !bot.entity || bot.isMining) return;

    console.log('[Anti-AFK] Performing random rotation.');
    const yaw = Math.random() * Math.PI * 2 - Math.PI;
    const pitch = Math.random() * Math.PI - Math.PI / 2;
    bot.look(yaw, pitch, true);
}

module.exports = { setupAntiAfk };
