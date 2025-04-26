function setupAuth(bot, config) {
    const authConfig = config.utils['auto-auth'];

    if (!authConfig || !authConfig.enabled) {
        console.log('[Auth] Module disabled in settings.json.');
        return;
    }

    const password = authConfig.password;

    if (!password) {
        console.warn('[Auth] Module enabled but no password provided in settings.json. Cannot authenticate.');
        return;
    }

    console.log('[Auth] Module enabled.');

    // Listen for specific chat messages related to auth success/status
    bot.on('chat', (_username, message) => { // Mark username as unused
        const lowerMessage = message.toLowerCase(); // Case-insensitive check
        if (lowerMessage.includes('successfully registered')) {
            console.log('[Auth] Registration successful.');
        } else if (lowerMessage.includes('already registered')) {
            console.log('[Auth] Bot is already registered.');
        } else if (lowerMessage.includes('successfully logged in')) {
            console.log('[Auth] Login successful.');
        }
        // Add more checks here if needed for other auth plugin messages
    });

    // Attempt registration and login once the bot spawns
    bot.once('spawn', () => {
        console.log('[Auth] Attempting registration and login...');
        // Use setTimeout to slightly delay commands, giving server plugins time to load
        setTimeout(() => {
            if (bot && bot.chat) bot.chat(`/register ${password} ${password}`);
        }, 1000); // 1 second delay
        setTimeout(() => {
            if (bot && bot.chat) bot.chat(`/login ${password}`);
        }, 2000); // 2 second delay
    });
}

module.exports = { setupAuth };
