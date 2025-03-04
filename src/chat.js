function setupChat(bot, config) {
  if (!config.utils['chat-messages'].enabled) return;

  const messages = config.utils['chat-messages']['messages'];

  if (config.utils['chat-messages'].repeat) {
    const delay = config.utils['chat-messages']['repeat-delay'];
    let i = 0;
    setInterval(() => {
      const messageToSend = messages[i];
      bot.chat(messageToSend);
      i = (i + 1) % messages.length;
    }, delay * 1000);
  } else {
    messages.forEach((msg) => {
      bot.chat(msg);
    });
  }

  bot.on('chat', (username, message) => {
    console.log(`[Chat] <${username}> ${message}`);
  });
}

module.exports = { setupChat };
