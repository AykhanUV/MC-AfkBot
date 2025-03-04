const { Movements, goals: { GoalNear, GoalGetToBlock } } = require('mineflayer-pathfinder');

function setupAntiAfk(bot, config) {
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    if (!config.utils['anti-afk'].enabled) return;

    const antiAFK = config.utils['anti-afk'];

    if (antiAFK.movement.enabled) {
        setInterval(() => {
            moveToRandomNearbyPosition(bot, antiAFK.movement.radius, defaultMove);
        }, antiAFK.movement.interval);
    }

    if (antiAFK.interaction.enabled) {
        setInterval(() => {
            interactWithNearbyBlock(bot, antiAFK.interaction.nearbyBlockTypes);
        }, antiAFK.interaction.interval);
    }

    if (antiAFK.jumping.enabled) {
        setInterval(() => {
            if (Math.random() < antiAFK.jumping.probability) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
            }
        }, antiAFK.jumping.interval);
    }

    if (antiAFK.rotation.enabled) {
        setInterval(() => {
            rotateRandomly(bot);
        }, antiAFK.rotation.interval);
    }

    if (antiAFK.fishing.enabled) {
        setInterval(() => {
            fish(bot, mcData);
        }, antiAFK.fishing.interval);
    }
}

function moveToRandomNearbyPosition(bot, radius, defaultMove) {
    const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

    const targetX = bot.entity.position.x + randomX;
    const targetZ = bot.entity.position.z + randomZ;
    const targetY = bot.entity.position.y;

    console.log(`[Anti-AFK] Moving to: ${targetX}, ${targetY}, ${targetZ}`);

    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.goto(new GoalGetToBlock(targetX, targetY, targetZ))
        .catch(() => {  });
}

function interactWithNearbyBlock(bot, blockTypes) {
    const nearbyBlock = bot.findBlock({
        matching: (block) => blockTypes.includes(block.name),
        maxDistance: 3,
    });

    if (nearbyBlock) {
        bot.activateBlock(nearbyBlock);
    }
}

async function fish(bot, mcData) {
    try {
        await bot.equip(mcData.itemsByName.fishing_rod.id, 'hand');
        await bot.activateItem();
        const waitTime = Math.random() * (20000 - 5000) + 5000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        await bot.activateItem();
    } catch (err) {
        console.error("[Fishing] Error:", err);
    }
}

function rotateRandomly(bot) {
    const yaw = Math.random() * Math.PI * 2 - Math.PI;
    const pitch = Math.random() * Math.PI - Math.PI / 2;
    bot.look(yaw, pitch, true);
}

module.exports = { setupAntiAfk };
