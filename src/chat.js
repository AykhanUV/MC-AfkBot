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
    let lastMessageIndex = -1;

    if (messages.length === 0) {
      console.log("[Chat] No messages configured.");
      return;
    }

    /**
     * Pick a random message index, avoiding the last one sent
     * so we never send the same message back-to-back.
     */
    function pickRandomIndex() {
      if (messages.length === 1) return 0;
      let idx;
      do {
        idx = Math.floor(Math.random() * messages.length);
      } while (idx === lastMessageIndex);
      return idx;
    }

    /**
     * Returns a randomized delay with ±30% variance around the base delay.
     * e.g. base 45s → between ~31.5s and ~58.5s
     */
    function getRandomizedDelay(baseMs) {
      const variance = 0.3;
      const min = baseMs * (1 - variance);
      const max = baseMs * (1 + variance);
      return Math.floor(min + Math.random() * (max - min));
    }

    function sendNextMessage() {
      try {
        if (!bot || !bot.chat) return;

        const idx = pickRandomIndex();
        const messageToSend = messages[idx];
        if (messageToSend) {
          console.log(`[Chat] Sending: ${messageToSend}`);
          bot.chat(messageToSend);
          lastMessageIndex = idx;
        }
      } catch (err) {
        console.error("[Chat] Error sending message:", err.message);
      }

      // Schedule the next message with a randomized delay
      if (chatInterval !== null) {
        const baseDelay = (chatConfig["repeat-delay"] || 45) * 1000;
        const nextDelay = getRandomizedDelay(baseDelay);
        chatInterval = setTimeout(sendNextMessage, nextDelay);
      }
    }

    if (chatConfig.repeat) {
      const baseDelay = (chatConfig["repeat-delay"] || 45) * 1000;
      console.log(
        `[Chat] Repeating messages enabled. Base interval: ${baseDelay / 1000}s (±30% variance)`,
      );

      // Use setTimeout chain instead of setInterval for variable delays
      // Start with a random initial delay so it doesn't fire immediately on join
      const initialDelay = getRandomizedDelay(baseDelay);
      chatInterval = setTimeout(sendNextMessage, initialDelay);
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
        if (chatInterval !== null) {
          clearTimeout(chatInterval);
          chatInterval = null;
          console.log("[Chat] Cleared message timer.");
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
