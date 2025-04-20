const { Movements, goals: { GoalNear, GoalGetToBlock, GoalBlock } } = require('mineflayer-pathfinder');

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

    // --- Movement ---
    if (antiAFK.movement.enabled) {
        console.log(`[Anti-AFK] Movement enabled. Interval: ${antiAFK.movement.interval / 1000}s, Radius: ${antiAFK.movement.radius}`);
        setInterval(() => {
            // Initial check before calling the function
            if (!bot.isMining) {
                moveToRandomNearbyPosition(bot, antiAFK.movement.radius, defaultMove);
            }
        }, antiAFK.movement.interval);
    }

    // --- Interaction ---
    if (antiAFK.interaction.enabled) {
        console.log(`[Anti-AFK] Interaction enabled. Interval: ${antiAFK.interaction.interval / 1000}s`);
        setInterval(() => {
            // Check before interacting
            if (!bot.isMining) {
                interactWithNearbyBlock(bot, antiAFK.interaction.nearbyBlockTypes);
            }
        }, antiAFK.interaction.interval);
    }

    // --- Jumping ---
    if (antiAFK.jumping.enabled) {
        console.log(`[Anti-AFK] Jumping enabled. Interval: ${antiAFK.jumping.interval / 1000}s, Probability: ${antiAFK.jumping.probability}`);
        setInterval(() => {
            // Check before jumping
            if (!bot.isMining && Math.random() < antiAFK.jumping.probability) {
                console.log('[Anti-AFK] Performing jump.');
                bot.setControlState('jump', true);
                // Release jump after a short delay
                setTimeout(() => bot.setControlState('jump', false), 500);
            }
        }, antiAFK.jumping.interval);
    }

    // --- Rotation ---
    if (antiAFK.rotation.enabled) {
        console.log(`[Anti-AFK] Rotation enabled. Interval: ${antiAFK.rotation.interval / 1000}s`);
        setInterval(() => {
            // Check before rotating
            if (!bot.isMining) {
                rotateRandomly(bot);
            }
        }, antiAFK.rotation.interval);
    }

    // --- Fishing ---
    if (antiAFK.fishing.enabled) {
        console.log(`[Anti-AFK] Fishing enabled. Interval: ${antiAFK.fishing.interval / 1000}s`);
        setInterval(() => {
            // Check before fishing
            if (!bot.isMining) {
                fish(bot, mcData);
            }
        }, antiAFK.fishing.interval);
    }

    // --- Initial Position ---
    const pos = config.position;
    if (pos.enabled) {
        // Move to initial position once after spawning
        bot.once('spawn', () => {
            // Check if mining is active *before* trying to move to initial position
            if (!bot.isMining) {
                console.log(`[Anti-AFK] Moving to initial position: (${pos.x}, ${pos.y}, ${pos.z})`);
                bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
            } else {
                console.log(`[Anti-AFK] Skipping move to initial position because bot is mining.`);
            }
        });
    }
}

/**
 * Moves the bot to a random nearby position.
 * Includes an additional check for bot.isMining before setting the goal.
 */
function moveToRandomNearbyPosition(bot, radius, defaultMove) {
    // Double-check if the bot started mining since the interval check
    if (bot.isMining) {
        console.log('[Anti-AFK] Skipping random move because bot started mining.');
        return;
    }

    const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

    const targetX = bot.entity.position.x + randomX;
    const targetZ = bot.entity.position.z + randomZ;
    const targetY = bot.entity.position.y; // Keep Y level the same for simplicity

    console.log(`[Anti-AFK] Attempting random move to: ${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${targetZ.toFixed(1)}`);

    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.goto(new GoalGetToBlock(targetX, targetY, targetZ))
        .catch(err => {
            // Ignore GoalChanged errors as they are expected if mining starts
            if (err.name !== 'GoalChanged') {
                console.error('[Anti-AFK] Pathfinding error during random move:', err);
            } else {
                 console.log('[Anti-AFK] Random move goal changed (likely due to mining starting).');
            }
        });
}

/**
 * Interacts with a nearby block of specified types.
 */
function interactWithNearbyBlock(bot, blockTypes) {
    // No check needed here as interaction is less likely to conflict critically
    const nearbyBlock = bot.findBlock({
        matching: (block) => blockTypes.includes(block.name),
        maxDistance: 3,
    });

    if (nearbyBlock) {
        console.log(`[Anti-AFK] Interacting with nearby block: ${nearbyBlock.name}`);
        bot.activateBlock(nearbyBlock)
           .catch(err => console.error(`[Anti-AFK] Error interacting with block: ${err.message}`));
    }
}

/**
 * Performs a fishing action.
 * Includes an additional check for bot.isMining before starting.
 */
async function fish(bot, mcData) {
    // Double-check if the bot started mining
    if (bot.isMining) {
         console.log('[Anti-AFK] Skipping fishing because bot started mining.');
        return;
    }
    console.log('[Anti-AFK] Attempting to fish...');
    try {
        const fishingRod = mcData.itemsByName.fishing_rod;
        if (!fishingRod) {
            console.error('[Anti-AFK] Fishing rod item data not found for this Minecraft version.');
            return;
        }
        await bot.equip(fishingRod.id, 'hand');
        await bot.activateItem();
        console.log('[Anti-AFK] Fishing action complete.');
    } catch (err) {
        console.error("[Anti-AFK] Fishing error:", err.message);
    }
}

/**
 * Rotates the bot's view randomly.
 * Includes an additional check for bot.isMining before rotating.
 */
function rotateRandomly(bot) {
    // Double-check if the bot started mining
    if (bot.isMining) {
        console.log('[Anti-AFK] Skipping random rotation because bot started mining.');
        return;
    }
    console.log('[Anti-AFK] Performing random rotation.');
    const yaw = Math.random() * Math.PI * 2 - Math.PI; // Full horizontal circle
    const pitch = Math.random() * Math.PI - Math.PI / 2; // Full vertical range
    bot.look(yaw, pitch, true); // Force head turn
}

module.exports = { setupAntiAfk };
