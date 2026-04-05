function setupChat(bot, config) {
  try {
    const chatConfig = config.utils["chat-messages"];
    if (!chatConfig || !chatConfig.enabled) {
      console.log("[Chat] Module disabled.");
      return;
    }
    console.log("[Chat] Module enabled.");

    const messages = chatConfig.messages || [];
    let chatInterval = null;

    if (messages.length === 0) {
      console.log("[Chat] No messages configured.");
      return;
    }

    if (chatConfig.repeat) {
      const delay = (chatConfig["repeat-delay"] || 60) * 1000;
      let i = 0;
      console.log(
        `[Chat] Repeating messages enabled. Interval: ${delay / 1000}s`,
      );

      chatInterval = setInterval(() => {
        try {
          if (!bot || !bot.chat) return;
          const messageToSend = messages[i];
          if (messageToSend) {
            console.log(`[Chat] Sending: ${messageToSend}`);
            bot.chat(messageToSend);
          }
          i = (i + 1) % messages.length;
        } catch (err) {
          console.error("[Chat] Error sending repeating message:", err.message);
        }
      }, delay);
    } else {
      bot.once("spawn", () => {
        try {
          console.log("[Chat] Sending one-time messages.");
          messages.forEach((msg) => {
            try {
              if (bot && bot.chat) bot.chat(msg);
            } catch (err) {
              console.error(
                "[Chat] Error sending one-time message:",
                err.message,
              );
            }
          });
        } catch (err) {
          console.error("[Chat] Error in spawn handler:", err.message);
        }
      });
    }

    bot.on("chat", (username, message) => {
      try {
        const cleanMessage = message.replace(/§[0-9a-fk-or]/g, "");
        console.log(`[Chat] <${username}> ${cleanMessage}`);
      } catch (err) {
        // Ignore chat log errors
      }
    });

    bot.once("end", () => {
      try {
        if (chatInterval) {
          clearInterval(chatInterval);
          chatInterval = null;
          console.log("[Chat] Cleared repeating message interval.");
        }
      } catch (err) {
        console.error("[Chat] Error cleaning up:", err.message);
      }
    });
  } catch (err) {
    console.error("[Chat] Error setting up chat module:", err.message);
  }
}

module.exports = { setupChat };
