const express = require('express');

/**
 * Sets up a basic web server to provide information about the bot.
 *
 * @param {mineflayer.Bot} bot - The mineflayer bot instance.
 * @param {object} config - The bot configuration, expected to contain a 'webserver' section with a 'port' option.
 */
function setupWebserver(bot, config) {
    // Check if webserver config exists and is enabled (assuming no explicit enable flag, just check existence)
    if (!config.webserver || !config.webserver.port) {
        console.log('[Webserver] Module disabled or port not configured in settings.json.');
        return;
    }

    // Create an Express application.
    const app = express();
    // Use the port specified in the config.
    const port = config.webserver.port;

    console.log(`[Webserver] Module enabled. Attempting to start web server on port ${port}...`);

    // Middleware to enable JSON responses.
    app.use(express.json());

    // Define a route for the root path ('/').
    app.get('/', (req, res) => {
        // Send a simple message indicating the bot is running.
        res.send('Minecraft bot is running!');
    });

    // Define a route for the bot's status ('/status').
    app.get('/status', (req, res) => {
        try {
            // Create a status object with relevant bot information.
            // Add checks for potentially null/undefined properties if bot disconnects mid-request
            const status = {
                username: bot?.username || 'N/A',
                health: bot?.health ?? 'N/A', // Use nullish coalescing
                food: bot?.food ?? 'N/A',
                position: bot?.entity?.position || null,
                isMining: bot?.isMining ?? false, // Default to false if bot is undefined
            };
            // Send the status object as a JSON response.
            res.json(status);
        } catch (error) {
            console.error('[Webserver] Error getting /status:', error);
            res.status(500).json({ error: 'Internal server error retrieving bot status.' });
        }
    });

    // Define a route for the bot's inventory ('/inventory').
    app.get('/inventory', (req, res) => {
        try {
            // Get the bot's inventory items. Check if bot and inventory exist.
            const inventory = bot?.inventory?.items() || [];
            // Transform the inventory items into a simpler format for the response.
            const inventoryList = inventory.map(item => ({
                name: item.name,
                count: item.count,
            }));
            // Send the inventory list as a JSON response.
            res.json(inventoryList);
        } catch (error) {
            console.error('[Webserver] Error getting /inventory:', error);
            res.status(500).json({ error: 'Internal server error retrieving bot inventory.' });
        }
    });

    // Start the web server and listen for incoming connections.
    const server = app.listen(port, () => {
        console.log(`[Webserver] Successfully listening at http://localhost:${port}`);
    });

    // Add basic error handling for the server itself
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[Webserver] Error: Port ${port} is already in use. Webserver not started.`);
        } else {
            console.error(`[Webserver] Failed to start server: ${err.message}`);
        }
        // Optionally, attempt cleanup or notify further up the chain if needed
    });

    // Optional: Add cleanup if the bot disconnects to stop the server
    bot.once('end', () => {
        console.log('[Webserver] Bot disconnected, stopping web server...');
        server.close(() => {
            console.log('[Webserver] Web server stopped.');
        });
    });
}

// Export the setup function for use in bot.js
module.exports = { setupWebserver };
