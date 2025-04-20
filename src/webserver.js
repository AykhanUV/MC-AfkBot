const express = require('express');

/**
 * Sets up a basic web server to provide information about the bot.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} config - The bot configuration, expected to contain a 'webserver' section with a 'port' option.
 */
function setupWebserver(bot, config) {
    // Create an Express application.
    const app = express();
    // Use the port specified in the config, or default to 3000 if not provided.
    const port = config.webserver.port || 3000;

    console.log(`[Webserver] Module enabled. Starting web server on port ${port}`);

    // Middleware to enable JSON responses.
    app.use(express.json());

    // Define a route for the root path ('/').
    app.get('/', (req, res) => {
        // Send a simple message indicating the bot is running.
        res.send('Minecraft bot is running!');
    });

    // Define a route for the bot's status ('/status').
    app.get('/status', (req, res) => {
        // Create a status object with relevant bot information.
        const status = {
            username: bot.username,
            health: bot.health,
            food: bot.food,
            position: bot.entity.position,
            isMining: bot.isMining,
        };
        // Send the status object as a JSON response.
        res.json(status);
    });

    // Define a route for the bot's inventory ('/inventory').
    app.get('/inventory', (req, res) => {
        // Get the bot's inventory items.
        const inventory = bot.inventory.items();
        // Transform the inventory items into a simpler format for the response.
        const inventoryList = inventory.map(item => ({
            name: item.name,
            count: item.count,
        }));
        // Send the inventory list as a JSON response.
        res.json(inventoryList);
    });

    // Start the web server and listen for incoming connections.
    app.listen(port, () => {
        console.log(`[Webserver] Listening at http://localhost:${port}`);
    });
}

// Export the setup function for use in bot.js
module.exports = { setupWebserver };
