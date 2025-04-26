function setupChat(bot, config) {
    if (!config.utils['chat-messages'].enabled) {
        console.log('[Chat] Module disabled in settings.json.');
        return;
    }
    console.log('[Chat] Module enabled.');

    const chatConfig = config.utils['chat-messages'];
    const messages = chatConfig.messages;
    let chatInterval = null; // Variable to store the interval ID

    if (chatConfig.repeat) {
        const delay = (chatConfig['repeat-delay'] || 60) * 1000; // Default to 60s if not set
        let i = 0;
        console.log(`[Chat] Repeating messages enabled. Interval: ${delay / 1000}s`);

        // Store the interval ID
        chatInterval = setInterval(() => {
            if (!bot || !bot.chat) return; // Ensure bot and chat function exist
            const messageToSend = messages[i];
            console.log(`[Chat] Sending repeating message: ${messageToSend}`);
            bot.chat(messageToSend);
            i = (i + 1) % messages.length; // Cycle through messages
        }, delay);

    } else {
        // Send messages once on spawn if repeat is disabled
        bot.once('spawn', () => {
            console.log('[Chat] Sending one-time messages.');
            messages.forEach((msg) => {
                 if (bot && bot.chat) bot.chat(msg);
            });
        });
    }

    // Log incoming chat messages
    bot.on('chat', (username, message) => {
        // Basic formatting to remove common color codes for cleaner logs
        const cleanMessage = message.replace(/§[0-9a-fk-or]/g, '');
        console.log(`[Chat] <${username}> ${cleanMessage}`);
    });

    // Cleanup interval on bot disconnect
    bot.once('end', () => {
        if (chatInterval) {
            clearInterval(chatInterval);
            console.log('[Chat] Cleared repeating message interval.');
            chatInterval = null; // Clear the reference
        }
    });
}

module.exports = { setupChat };
