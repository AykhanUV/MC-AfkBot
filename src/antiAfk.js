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
        // movement: null, // Removed movement timer
        interaction: null,
        jumping: null,
        rotation: null,
        fishing: null
    };
    botTimers.set(bot.username, currentTimers); // Store timers associated with this bot

    // --- Movement --- (Removed)

    // --- Interaction ---
    if (antiAFK.interaction.enabled) {
        console.log(`[Anti-AFK] Interaction enabled. Interval: ${antiAFK.interaction.interval / 1000}s`);
        currentTimers.interaction = setInterval(() => {
            if (!bot || !bot.entity) return;
            if (!bot.isMining) {
                interactWithNearbyBlock(bot, antiAFK.interaction.nearbyBlockTypes);
            } else {
                // console.log('[Anti-AFK] Skipping interaction: Bot is mining.'); // Optional: Add if verbose logging is desired
            }
        }, antiAFK.interaction.interval);
    }

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
                 // console.log('[Anti-AFK] Skipping jump check: Bot is mining.'); // Optional: Add if verbose logging is desired
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
                // console.log('[Anti-AFK] Skipping rotation: Bot is mining.'); // Optional: Add if verbose logging is desired
            }
        }, antiAFK.rotation.interval);
    }

    // --- Fishing ---
    if (antiAFK.fishing.enabled) {
        console.log(`[Anti-AFK] Fishing enabled. Interval: ${antiAFK.fishing.interval / 1000}s`);
        currentTimers.fishing = setInterval(() => {
            if (!bot || !bot.entity) return;
            if (!bot.isMining) {
                fish(bot, mcData);
            } else {
                // console.log('[Anti-AFK] Skipping fishing: Bot is mining.'); // Optional: Add if verbose logging is desired
            }
        }, antiAFK.fishing.interval);
    }

    // --- Initial Position ---
    const pos = config.position;
    if (pos.enabled) {
        bot.once('spawn', () => {
            if (!bot || !bot.entity) return;
            if (!bot.isMining) {
                console.log(`[Anti-AFK] Moving to initial position: (${pos.x}, ${pos.y}, ${pos.z})`);
                bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
            } else {
                console.log(`[Anti-AFK] Skipping move to initial position because bot is mining.`);
            }
        });
    }

    // --- Cleanup on Bot End ---
    const cleanupListener = () => {
        console.log(`[Anti-AFK] Cleaning up timers for bot ${bot.username || 'instance'}.`);
        const timersToClear = botTimers.get(bot.username);
        if (timersToClear) {
            // Clear movement interval specifically using the function (Removed)
            // clearMovementInterval();
            // Clear other intervals
            if (timersToClear.interaction) clearInterval(timersToClear.interaction);
            if (timersToClear.jumping) clearInterval(timersToClear.jumping);
            if (timersToClear.rotation) clearInterval(timersToClear.rotation);
            if (timersToClear.fishing) clearInterval(timersToClear.fishing);

            console.log('[Anti-AFK] All timers cleared.');
            botTimers.delete(bot.username); // Remove entry for this bot
        }
        // Remove mining listeners to prevent memory leaks if bot object persists temporarily (Removed movement listeners)
        // bot.removeListener('mining_started', clearMovementInterval);
        // bot.removeListener('mining_stopped', createMovementInterval);
    };
    bot.once('end', cleanupListener); // Use once to ensure it only runs once per bot instance end
}

// --- Action Functions ---
// (Keep the internal !bot.isMining checks as a secondary safeguard)

// Removed moveToRandomNearbyPosition function

function interactWithNearbyBlock(bot, blockTypes) {
     if (!bot || !bot.entity || bot.isMining) return;

    const nearbyBlock = bot.findBlock({
        matching: (block) => blockTypes.includes(block.name),
        maxDistance: 3,
    });
    if (nearbyBlock) {
        console.log(`[Anti-AFK] Interacting with nearby block: ${nearbyBlock.name}`);
        bot.activateBlock(nearbyBlock).catch(err => {
            console.error(`[Anti-AFK] Error interacting with block ${nearbyBlock.name}: ${err.message}`);
            console.error(err.stack); // Add stack trace
        });
    }
}

async function fish(bot, mcData) {
     if (!bot || !bot.entity || bot.isMining) return;

    console.log('[Anti-AFK] Attempting to fish...');
    try {
        const fishingRod = mcData.itemsByName.fishing_rod;
        if (!fishingRod) {
            console.error('[Anti-AFK] Fishing rod item data not found for this Minecraft version.');
            return;
        }
        await bot.equip(fishingRod.id, 'hand');
        await bot.fish();
        console.log('[Anti-AFK] Fishing action complete.');
    } catch (err) {
        console.error(`[Anti-AFK] Fishing error: ${err.message}`);
        console.error(err.stack); // Add stack trace
    }
}

function rotateRandomly(bot) {
     if (!bot || !bot.entity || bot.isMining) return;

    console.log('[Anti-AFK] Performing random rotation.');
    const yaw = Math.random() * Math.PI * 2 - Math.PI;
    const pitch = Math.random() * Math.PI - Math.PI / 2;
    bot.look(yaw, pitch, true);
}

module.exports = { setupAntiAfk };
