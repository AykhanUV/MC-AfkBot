function setupAuth(bot, config) {
  try {
    const authConfig = config.utils["auto-auth"];

    if (!authConfig || !authConfig.enabled) {
      console.log("[Auth] Module disabled.");
      return;
    }

    const password = authConfig.password;
    if (!password) {
      console.warn("[Auth] Module enabled but no password provided. Skipping.");
      return;
    }

    console.log("[Auth] Module enabled.");

    bot.on("chat", (_username, message) => {
      try {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes("successfully registered")) {
          console.log("[Auth] Registration successful.");
        } else if (lowerMessage.includes("already registered")) {
          console.log("[Auth] Bot is already registered.");
        } else if (lowerMessage.includes("successfully logged in")) {
          console.log("[Auth] Login successful.");
        }
      } catch (err) {
        console.error("[Auth] Error processing chat for auth:", err.message);
      }
    });

    bot.once("spawn", () => {
      try {
        console.log("[Auth] Attempting registration and login...");
        setTimeout(() => {
          try {
            if (bot && bot.chat) bot.chat(`/register ${password} ${password}`);
          } catch (e) {
            console.error("[Auth] Error sending register:", e.message);
          }
        }, 1000);
        setTimeout(() => {
          try {
            if (bot && bot.chat) bot.chat(`/login ${password}`);
          } catch (e) {
            console.error("[Auth] Error sending login:", e.message);
          }
        }, 2000);
      } catch (err) {
        console.error("[Auth] Error in spawn handler:", err.message);
      }
    });
  } catch (err) {
    console.error("[Auth] Error setting up auth module:", err.message);
  }
}

module.exports = { setupAuth };
