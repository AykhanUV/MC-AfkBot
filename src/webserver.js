const express = require('express');

function setupWebserver(bot, config) {
    const app = express();
    const port = config.webserver.port || 3000;

    app.get('/', (req, res) => {
        res.send('Bot is running!');
    });

    app.listen(port, () => {
        console.log(`[Webserver] Listening at http://localhost:${port}`);
    });
}

module.exports = { setupWebserver };
