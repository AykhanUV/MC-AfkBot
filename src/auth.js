function setupAuth(bot, config) {
  if (!config.utils['auto-auth'].enabled) return;

  const password = config.utils['auto-auth'].password;

  bot.on('chat', (username, message) => {
    if (message.includes('successfully registered')) {
      console.log('[Auth] Registration successful.');
    } else if (message.includes('already registered')) {
      console.log('[Auth] Bot is already registered.');
    } else if (message.includes('successfully logged in')) {
      console.log('[Auth] Login successful.');
    }
  });

  bot.once('spawn', () => {
    bot.chat(`/register ${password} ${password}`);
    bot.chat(`/login ${password}`);
  });
}

module.exports = { setupAuth };
