function setupCommands(bot, config) {
  bot.on('chat', (username, message) => {
    if (message.startsWith('!')) {
      const command = message.substring(1).split(' ')[0];
      const args = message.substring(1).split(' ').slice(1);

      console.log(`[Command] Received: ${command} with args: ${args}`);

      switch (command) {
        case 'status':
          bot.chat(`I'm online!`);
          break;
        case 'help':
          bot.chat(`Available commands: !status, !help, !uptime`);
          break;
        case 'uptime':
          const uptime = process.uptime();
          const uptimeString = formatUptime(uptime);
          bot.chat(`Uptime: ${uptimeString}`);
          break;
        default:
          bot.chat(`Unknown command: ${command}`);
      }
    }
  });

  function formatUptime(seconds) {
    const days = Math.floor(seconds / (3600 * 24));
    seconds -= days * 3600 * 24;
    const hrs = Math.floor(seconds / 3600);
    seconds -= hrs * 3600;
    const mnts = Math.floor(seconds / 60);
    seconds -= mnts * 60;
    return `${days}d ${hrs}h ${mnts}m ${Math.floor(seconds)}s`;
  }
}

module.exports = { setupCommands };
