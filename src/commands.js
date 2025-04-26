/**
 * Sets up the command handling module for the bot.
 * Listens for chat messages starting with '!' and processes them as commands.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} _config - The bot configuration (currently unused in this module).
 */
function setupCommands(bot, _config) { // Mark config as unused
    console.log('[Commands] Module enabled. Listening for chat commands starting with "!"');

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
                    bot.chat(`Available commands: !status, !help, !uptime, !inventory`);
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
                default:
                    // Handles unrecognized commands.
                    bot.chat(`Unknown command: ${command}. Try !help for a list of commands.`);
            }
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
