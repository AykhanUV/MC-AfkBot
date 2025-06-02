const { GoalFollow, GoalBlock } = require('mineflayer-pathfinder').goals;
const fs = require('fs');
const path = require('path');
const { executeCommandMine } = require('./mining'); // Import the new function

/**
 * Sets up the command handling module for the bot.
 * Listens for chat messages starting with '!' and processes them as commands.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} _config - The bot configuration (currently unused in this module).
 */
function setupCommands(bot, _config) { // Mark config as unused
    console.log('[Commands] Module enabled. Listening for chat commands starting with "!"');

    // Initialize bot state properties if they don't exist
    bot.isFollowing = bot.isFollowing || false;
    bot.followTargetName = bot.followTargetName || null;
    bot.followIntervalId = bot.followIntervalId || null;
    bot.currentPathTask = bot.currentPathTask || 'none'; // 'none', 'follow', 'goto'
    bot.isCommandActive = bot.isCommandActive || false;
    // bot.gotoTimeoutId is managed locally in !goto
    bot.miningCommandTargetBlockType = bot.miningCommandTargetBlockType || null; // For !mine command

    // Helper function to find a player by name, case-insensitively
    function findTargetPlayerEntity(botInstance, name) {
        const lowerName = name.toLowerCase();
        for (const playerName in botInstance.players) {
            if (playerName.toLowerCase() === lowerName) {
                return botInstance.players[playerName]?.entity;
            }
        }
        return null; // Player not found
    }

    function cancelCurrentTask(botInstance, newCommandTakesOver = false) {
        // Stop pathfinding only if no new command is immediately taking over
        // or if we are explicitly stopping a follow task.
        // The new command's setGoal/goto will handle stopping the previous path.
        if (!newCommandTakesOver || botInstance.isFollowing) {
            // console.log(`[cancelCurrentTask] Stopping pathfinder. newCommandTakesOver: ${newCommandTakesOver}, isFollowing: ${botInstance.isFollowing}`); // Debug log
            botInstance.pathfinder.stop();
        }

        // Clear follow state
        if (botInstance.isFollowing) {
            if (botInstance.followIntervalId) {
                clearInterval(botInstance.followIntervalId);
                botInstance.followIntervalId = null;
            }
            botInstance.isFollowing = false;
            botInstance.followTargetName = null;
        }
        botInstance.currentPathTask = 'none';
        botInstance.miningCommandTargetBlockType = null; // Reset mining command target

        // Clear goto timeout if it exists (this was for an older !goto implementation)
        if (botInstance.gotoTimeoutId) {
            clearTimeout(botInstance.gotoTimeoutId);
            botInstance.gotoTimeoutId = null;
        }

        // Stop mining if it was active
        if (botInstance.isMining) {
            botInstance.isMining = false;
            botInstance.emit('mining_stopped'); // Notify other modules if necessary
            console.log('[Commands] Mining stopped due to command override.');
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
                    bot.chat(`I'm online and running!`);
                    break;
                case 'help':
                    bot.chat(`Available commands: !status, !help, !uptime, !inventory, !follow <player>, !stopFollow, !goto <x> <y> <z | player>, !dropitems, !mine <block_type>, !stopMine, !toggleMining, !miningStatus, !ping`);
                    break;
                case 'uptime':
                    const uptimeSeconds = process.uptime();
                    const uptimeString = formatUptime(uptimeSeconds);
                    bot.chat(`Bot uptime: ${uptimeString}`);
                    break;
                case 'inventory':
                    const inventory = bot.inventory.items();
                    if (inventory.length === 0) {
                        bot.chat('My inventory is empty.');
                    } else {
                        const inventoryList = inventory.map(item => `${item.count} ${item.name}`).join(', ');
                        bot.chat(`I have: ${inventoryList}`);
                    }
                    break;
                case 'follow':
                    cancelCurrentTask(bot, true); 
                    if (args.length < 1) {
                        bot.chat('Usage: !follow <player_name>');
                        bot.isCommandActive = false; 
                        break;
                    }
                    const targetPlayerNameArgFollow = args[0]; 
                    const targetEntityToFollow = findTargetPlayerEntity(bot, targetPlayerNameArgFollow);

                    if (targetEntityToFollow) {
                        const actualPlayerName = targetEntityToFollow.username || targetPlayerNameArgFollow; 

                        bot.isCommandActive = true; 
                        bot.isFollowing = true;
                        bot.followTargetName = actualPlayerName; 
                        bot.currentPathTask = 'follow';
                        bot.chat(`Now following ${actualPlayerName}.`);

                        if (bot.followIntervalId) clearInterval(bot.followIntervalId); 

                        bot.followIntervalId = setInterval(() => {
                            const currentTargetEntityInstance = bot.players[bot.followTargetName]?.entity;

                            if (!bot.isFollowing || !currentTargetEntityInstance || !currentTargetEntityInstance.isValid) {
                                bot.chat(`Lost target ${bot.followTargetName || 'player'} or follow stopped.`);
                                cancelCurrentTask(bot, false); 
                                return;
                            }
                            bot.pathfinder.setGoal(new GoalFollow(currentTargetEntityInstance, 3), true);
                        }, 1000);
                    } else {
                        bot.chat(`Player ${targetPlayerNameArgFollow} not found.`);
                        bot.isCommandActive = false; 
                    }
                    break;
                case 'stopfollow':
                    if (bot.isFollowing) {
                        const oldTarget = bot.followTargetName;
                        cancelCurrentTask(bot, false); 
                        bot.chat(`Stopped following ${oldTarget}.`);
                    } else {
                        bot.chat('Not currently following anyone.');
                    }
                    break;
                case 'goto':
                    cancelCurrentTask(bot, true); 
                    let gotoTimeoutHandle = null; 
                    const GOTO_TIMEOUT_MS = 30000;

                    const executeGoto = async (goal, type) => {
                        bot.isCommandActive = true;
                        bot.currentPathTask = 'goto';
                        let timedOut = false;

                        const timeoutPromise = new Promise((resolve) => {
                            gotoTimeoutHandle = setTimeout(() => {
                                timedOut = true;
                                resolve('timeout'); 
                            }, GOTO_TIMEOUT_MS);
                        });

                        try {
                            const result = await Promise.race([bot.pathfinder.goto(goal), timeoutPromise]);
                            
                            if (gotoTimeoutHandle) { 
                                clearTimeout(gotoTimeoutHandle);
                                gotoTimeoutHandle = null;
                            }

                            if (result === 'timeout') {
                                bot.pathfinder.stop(); 
                                bot.chat(`!goto to ${type} timed out.`);
                            } else {
                                bot.chat('Reached destination.');
                            }
                        } catch (err) {
                            if (gotoTimeoutHandle) { 
                                clearTimeout(gotoTimeoutHandle);
                                gotoTimeoutHandle = null;
                            }
                            bot.chat(`!goto to ${type} failed: ${err.message}`);
                        } finally {
                            if (bot.currentPathTask === 'goto' && bot.isCommandActive) {
                                cancelCurrentTask(bot, false);
                            }
                        }
                    };

                    if (args.length === 3) {
                        const x = parseInt(args[0], 10);
                        const y = parseInt(args[1], 10);
                        const z = parseInt(args[2], 10);
                        if (isNaN(x) || isNaN(y) || isNaN(z)) {
                            bot.chat('Invalid coordinates. Usage: !goto <x> <y> <z>');
                            bot.isCommandActive = false; 
                            break;
                        }
                        bot.chat(`Navigating to coordinates: ${x}, ${y}, ${z}.`);
                        executeGoto(new GoalBlock(x, y, z), 'coords');
                    } else if (args.length === 1) {
                        const playerNameArgGoto = args[0];
                        const targetPlayerEntityForGoto = findTargetPlayerEntity(bot, playerNameArgGoto);
                        if (targetPlayerEntityForGoto) {
                            const pos = targetPlayerEntityForGoto.position;
                            bot.chat(`Navigating to ${targetPlayerEntityForGoto.username || playerNameArgGoto}'s current location.`);
                            executeGoto(new GoalBlock(pos.x, pos.y, pos.z), 'player');
                        } else {
                            bot.chat(`Player ${playerNameArgGoto} not found.`);
                            bot.isCommandActive = false; 
                        }
                    } else {
                        bot.chat('Usage: !goto <x> <y> <z> OR !goto <player_name>');
                        bot.isCommandActive = false; 
                    }
                    break;
                case 'dropitems':
                    cancelCurrentTask(bot, true); 
                    bot.isCommandActive = true; 

                    const items = bot.inventory.items();
                    if (items.length === 0) {
                        bot.chat('My inventory is empty.');
                        bot.isCommandActive = false; 
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
                            bot.isCommandActive = false; 
                        })();
                    }
                    break;
                case 'mine':
                    cancelCurrentTask(bot, true); // New command takes over
                    if (args.length < 1) {
                        bot.chat('Usage: !mine <block_type>');
                        bot.isCommandActive = false; // Command failed to start
                        break;
                    }
                    const blockTypeNameToMine = args[0];
                    
                    bot.isCommandActive = true;
                    bot.currentPathTask = 'mine_block_command';
                    bot.miningCommandTargetBlockType = blockTypeNameToMine;

                    // Call the mining task. It runs asynchronously.
                    // Its internal loop will check bot.isCommandActive.
                    // It should handle its own chat messages for starting/stopping/errors.
                    executeCommandMine(bot, blockTypeNameToMine, _config) // Pass bot, blockType, and full config
                        .catch(err => {
                            console.error(`[Commands] Error from executeCommandMine: ${err.message}`);
                            bot.chat('The !mine command encountered an unexpected error.');
                        })
                        .finally(() => {
                            // This finally block runs after executeCommandMine promise resolves/rejects.
                            // Ensure state is cleaned up if executeCommandMine didn't (e.g., due to an unhandled exception).
                            if (bot.currentPathTask === 'mine_block_command') {
                                 console.log("[Commands] !mine command's async wrapper finished. Ensuring state cleanup.");
                                 cancelCurrentTask(bot, false);
                            }
                        });
                    break;
                case 'stopmine':
                    if (bot.isCommandActive && bot.currentPathTask === 'mine_block_command') {
                        bot.chat('Stopping mining operation...');
                        // cancelCurrentTask will set isCommandActive = false,
                        // which the loop in executeCommandMine will detect and break.
                        cancelCurrentTask(bot, false);
                    } else {
                        bot.chat('Not currently mining with !mine command.');
                    }
                    break;
                case 'togglemining':
                    bot.isMiningEnabled = !bot.isMiningEnabled;
                    // Correct path to runtime_state.json, same as in index.js
                    const runtimeStatePathCommands = path.join(__dirname, '..', 'runtime_state.json');
                    try {
                        fs.writeFileSync(runtimeStatePathCommands, JSON.stringify({ isMiningEnabled: bot.isMiningEnabled }, null, 2));
                        bot.chat(`Automatic mining is now ${bot.isMiningEnabled ? 'ENABLED' : 'DISABLED'}.`);
                        if (!bot.isMiningEnabled && bot.isMining) { // If disabling AND a mining cycle is active
                            console.log('[Commands] !toggleMining: Disabling active mining cycle.');
                            // We need to stop the current random mining cycle.
                            // Setting bot.isMining = false should be caught by mineRandomBlockNearby's checks.
                            // If it's in a pathfinding part of mineRandomBlockNearby, pathfinder.stop() is also needed.
                            bot.isMining = false;
                            bot.pathfinder.stop(); // Stop any pathfinding part of the mining cycle
                            bot.emit('mining_stopped'); // Ensure other parts know mining stopped
                        }
                    } catch (error) {
                        console.error('[Commands] Error writing runtime_state.json for !toggleMining:', error);
                        bot.chat('Error saving mining state. Change may not persist.');
                    }
                    break;
                case 'miningstatus':
                    bot.chat(`Automatic mining is currently ${bot.isMiningEnabled ? 'ENABLED' : 'DISABLED'}.`);
                    break;
                case 'ping':
                    bot.chat(`Bot ping: ${bot.player.ping} ms`);
                    break;
                default:
                    bot.chat(`Unknown command: ${command}. Try !help for a list of commands.`);
            }
        }
    });

    // Global pathfinder event listeners - primarily for other modules or minimal logging.
    // !goto and !follow manage their own primary pathfinding lifecycle.
    bot.on('goal_reached', () => {
        if (!bot.isCommandActive) { 
            // console.log('[Commands] Global: goal_reached event (bot was not command-active).');
        }
    });

    bot.on('path_update', (results) => {
        if (!bot.isCommandActive) {
            // console.log(`[Commands] Global: path_update event (bot was not command-active): status ${results.status}`);
        }
    });
    
    bot.on('path_reset', (reason) => {
        const reasonMsg = (reason && typeof reason === 'object' && reason.message) ? reason.message : String(reason);
        if (!bot.isCommandActive) {
            // console.log(`[Commands] Global: path_reset event (bot was not command-active). Reason: ${reasonMsg}`);
        }
    });

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
