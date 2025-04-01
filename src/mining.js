const { Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');

function setupMining(bot, config) {
    if (!config.mining.enabled) return;

    bot.isMining = false;
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.pathfinder.setMovements(defaultMove);

    setInterval(() => {
        mineRandomBlockNearby(bot, config, defaultMove);
    }, config.mining.interval);

    async function mineRandomBlockNearby(bot, config, defaultMove) {
        if (bot.isMining) return;
        bot.isMining = true;

        const radius = 4;
        const yRange = 2;

        let targetBlock = null;
        let attempts = 0;

        while (!targetBlock && attempts < 10) {
            const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
            const randomY = Math.floor(Math.random() * (yRange * 2 + 1)) - yRange;
            const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

            const targetPos = bot.entity.position.offset(randomX, randomY, randomZ);
            const block = bot.blockAt(targetPos);

            if (block && block.type !== 0 && config.mining.blockTypes.includes(block.name)) {
                targetBlock = block;
            }

            attempts++;
        }

        if (targetBlock) {
            try {
                const digTime = targetBlock.digTime(bot.heldItem);
                await new Promise((resolve) => setTimeout(resolve, digTime));

                await bot.dig(targetBlock);
                console.log(`[Mining] Mined ${targetBlock.name}`);

                bot.pathfinder.setMovements(defaultMove);
                bot.pathfinder.setGoal(new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1));

            } catch (err) {
                console.log(`[Mining] Error: ${err}`);
                bot.isMining = false;
            }
        } else {
            console.log('[Mining] No suitable block found.');
            bot.isMining = false;
        }
    }
     bot.on('goal_reached', () => {
        console.log(`[Mining] Reached goal after mining.`);
        bot.isMining = false;
    });
}

module.exports = { setupMining };
