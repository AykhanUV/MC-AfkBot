const { GoalFollow, GoalBlock } = require('mineflayer-pathfinder').goals;

/**
 * Sets up the command handling module for the bot.
 * Listens for chat messages starting with '!' and processes them as commands.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} _config - The bot configuration (currently unused in this module).
 */
function setupCommands(bot, _config) { // Mark config as unused
    console.log('[Commands] Module enabled. Listening for chat commands starting with "!"');

    bot.isFollowing = false;
    bot.followTargetName = null;
    bot.followIntervalId = null;
    bot.currentPathTask = 'none'; // 'none', 'follow', 'goto'
    bot.isCommandActive = false; // NEW: Flag to indicate a user command is active

    function cancelCurrentTask(botInstance, newCommandTakesOver = false) {
        // Stop pathfinding
        botInstance.pathfinder.stop();

        // Clear follow state
        if (botInstance.isFollowing) {
            if (botInstance.followIntervalId) {
                clearInterval(botInstance.followIntervalId);
                botInstance.followIntervalId = null;
            }
            botInstance.isFollowing = false;
            // const oldTarget = botInstance.followTargetName; // No need to announce here if another command takes over
            botInstance.followTargetName = null;
        }
        botInstance.currentPathTask = 'none';

        // Stop mining if it was active
        if (botInstance.isMining) {
            botInstance.isMining = false;
            botInstance.emit('mining_stopped'); // Notify other modules if necessary
            console.log('[Commands] Mining stopped due to command override.');
            // botInstance.chat('Mining has been stopped by a new command.'); // Optional chat message
        }

        // If no new command is immediately taking over, mark command as inactive
        if (!newCommandTakesOver) {
            botInstance.isCommandActive = false;
        }
        // If a new command *is* taking over, it will set isCommandActive = true itself.
    }

    // Listen for chat messages from any user.
    bot.on('chat', (username, message) => {
        // Ignore messages sent by the bot itself.
        if (username === bot.username) return;

        // Check if the message starts with the command prefix '!'.
        if (message.startsWith('!')) {
            // Remove the prefix and split the message into command and arguments.
            const args = message.substring(1).split(' ');
            const command = args.shift().toLowerCase(); // Get the command (lowercase) and remove it from args.

            console.log(`[Commands] Received command from ${username}: ${command} with args: ${args.join(' ')}`);

            // Process the command using a switch statement.
            switch (command) {
                case 'status':
                    // Responds with a simple online message.
                    bot.chat(`I'm online and running!`);
                    break;
                case 'help':
                    // Lists available commands.
                    bot.chat(`Available commands: !status, !help, !uptime, !inventory, !follow <player>, !stopFollow, !goto <x> <y> <z | player>, !dropitems`);
                    break;
                case 'uptime':
                    // Calculates and displays the bot's process uptime.
                    const uptimeSeconds = process.uptime();
                    const uptimeString = formatUptime(uptimeSeconds);
                    bot.chat(`Bot uptime: ${uptimeString}`);
                    break;
                case 'inventory':
                    // Lists the items in the bot's inventory.
                    const inventory = bot.inventory.items();
                    if (inventory.length === 0) {
                        bot.chat('My inventory is empty.');
                    } else {
                        // Format the inventory list into a readable string.
                        const inventoryList = inventory.map(item => `${item.count} ${item.name}`).join(', ');
                        bot.chat(`I have: ${inventoryList}`);
                    }
                    break;
                case 'follow':
                    cancelCurrentTask(bot, true); // New command takes over
                    if (args.length < 1) {
                        bot.chat('Usage: !follow <player_name>');
                        bot.isCommandActive = false; // Command failed to start
                        break;
                    }
                    const targetPlayerName = args[0];
                    const targetEntityToFollow = bot.players[targetPlayerName]?.entity;

                    if (targetEntityToFollow) {
                        bot.isCommandActive = true; // Command is now active
                        bot.isFollowing = true;
                        bot.followTargetName = targetPlayerName;
                        bot.currentPathTask = 'follow';
                        bot.chat(`Now following ${targetPlayerName}.`);

                        if (bot.followIntervalId) clearInterval(bot.followIntervalId); // Ensure old one is gone

                        bot.followIntervalId = setInterval(() => {
                            if (!bot.isFollowing || !bot.players[targetPlayerName]?.entity?.isValid) {
                                bot.chat(`Lost target ${targetPlayerName} or follow stopped.`);
                                cancelCurrentTask(bot, false); // Follow ended, no new command
                                return;
                            }
                            const currentTargetEntity = bot.players[targetPlayerName].entity;
                            bot.pathfinder.setGoal(new GoalFollow(currentTargetEntity, 3), true);
                        }, 1000);
                    } else {
                        bot.chat(`Player ${targetPlayerName} not found.`);
                        bot.isCommandActive = false; // Command failed to start
                    }
                    break;
                case 'stopfollow':
                    if (bot.isFollowing) {
                        const oldTarget = bot.followTargetName;
                        cancelCurrentTask(bot, false); // Command ends here
                        bot.chat(`Stopped following ${oldTarget}.`);
                    } else {
                        bot.chat('Not currently following anyone.');
                        // bot.isCommandActive remains false if it was already false
                    }
                    break;
                case 'goto':
                    cancelCurrentTask(bot, true); // New command takes over
                    if (args.length === 3) {
                        const x = parseInt(args[0], 10);
                        const y = parseInt(args[1], 10);
                        const z = parseInt(args[2], 10);
                        if (isNaN(x) || isNaN(y) || isNaN(z)) {
                            bot.chat('Invalid coordinates. Usage: !goto <x> <y> <z>');
                            bot.isCommandActive = false; // Command failed
                            break;
                        }
                        bot.isCommandActive = true; // Command is now active
                        bot.currentPathTask = 'goto';
                        bot.pathfinder.setGoal(new GoalBlock(x, y, z));
                        bot.chat(`Navigating to coordinates: ${x}, ${y}, ${z}.`);
                    } else if (args.length === 1) {
                        const playerName = args[0];
                        const targetPlayerEntity = bot.players[playerName]?.entity;
                        if (targetPlayerEntity) {
                            bot.isCommandActive = true; // Command is now active
                            bot.currentPathTask = 'goto';
                            const pos = targetPlayerEntity.position;
                            bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
                            bot.chat(`Navigating to ${playerName}'s current location.`);
                        } else {
                            bot.chat(`Player ${playerName} not found.`);
                            bot.isCommandActive = false; // Command failed
                        }
                    } else {
                        bot.chat('Usage: !goto <x> <y> <z> OR !goto <player_name>');
                        bot.isCommandActive = false; // Command failed due to wrong args
                    }
                    break;
                case 'dropitems':
                    cancelCurrentTask(bot, true); // Stop other movement, new command takes over (briefly)
                    bot.isCommandActive = true; // Command is now active

                    const items = bot.inventory.items();
                    if (items.length === 0) {
                        bot.chat('My inventory is empty.');
                        bot.isCommandActive = false; // Command finished (nothing to do)
                    } else {
                        bot.chat('Dropping all items...');
                        (async () => {
                            for (const item of items) {
                                try {
                                    await bot.tossStack(item);
                                } catch (err) {
                                    console.log(`[Commands] Error dropping ${item.name}: ${err.message}`);
                                }
                            }
                            bot.chat('Finished dropping items.');
                            bot.isCommandActive = false; // Command finished
                        })();
                    }
                    break;
                default:
                    // Handles unrecognized commands.
                    bot.chat(`Unknown command: ${command}. Try !help for a list of commands.`);
            }
        }
    });

    bot.pathfinder.on('goal_reached', () => {
        if (bot.currentPathTask === 'goto') {
            bot.chat('Reached destination.');
            bot.currentPathTask = 'none';
            bot.isCommandActive = false; // GOTO command finished
        }
    });

    bot.pathfinder.on('path_update', (results) => {
        if (bot.currentPathTask === 'goto') {
            if (results.status === 'noPath') {
                bot.chat('Cannot reach destination (no path found).');
                bot.currentPathTask = 'none';
                bot.isCommandActive = false; // GOTO command finished
            } else if (results.status === 'timeout') {
                bot.chat('Cannot reach destination (pathfinding timed out).');
                bot.currentPathTask = 'none';
                bot.isCommandActive = false; // GOTO command finished
            }
        }
    });

    // It's good practice to also handle path_reset or other pathfinder events if needed,
    // for example, if the bot gets stuck or pathfinding is cancelled externally.
    // For now, explicit command cancellation and goal_reached/noPath/timeout cover main cases.

    /**
     * Formats a duration given in seconds into a human-readable string (Xd Yh Zm Ws).
     *
     * @param {number} totalSeconds - The total duration in seconds.
     * @returns {string} - A formatted string representing the duration.
     */
    function formatUptime(totalSeconds) {
        // Ensure input is a non-negative number.
        if (isNaN(totalSeconds) || totalSeconds < 0) {
            return 'Invalid duration';
        }

        let seconds = Math.floor(totalSeconds); // Work with whole seconds.

        // Calculate days, hours, minutes, and remaining seconds.
        const days = Math.floor(seconds / (3600 * 24));
        seconds %= (3600 * 24); // Get remainder seconds after removing days.
        const hrs = Math.floor(seconds / 3600);
        seconds %= 3600; // Get remainder seconds after removing hours.
        const mnts = Math.floor(seconds / 60);
        seconds %= 60; // Remaining seconds.

        // Build the formatted string, only including non-zero units.
        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hrs > 0) parts.push(`${hrs}h`);
        if (mnts > 0) parts.push(`${mnts}m`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`); // Always show seconds if other parts are zero or if total time is < 1 min.

        return parts.join(' '); // Join parts with spaces.
    }
}

// Export the setup function for use in bot.js
module.exports = { setupCommands };
