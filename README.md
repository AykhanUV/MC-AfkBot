# Afk Bot
- Functional minecraft AFK bot for servers
- Anti-AFK, Auto-Auth, Microsoft/Offline accounts support.

# Note
- This project is not perfect and does random actions, put bot away from house or builds

## Installation

 1. Clone the repository
 2. Download & install [Node.JS](https://nodejs.org/en/download/)
 3. Run `npm install` command in bot directory.

 ## Usage

 1. Configure bot in `settings.json` file. [Bot configuration is explained in our wiki](https://urfate.gitbook.io/afk-bot/bot-configuration)
 2. Start bot with `node .` command.

## Features

 - Anti-AFK Kick Module (Jumping, Rotation)
 - Mojang/Microsoft Account support
 - Chat log
 - Chat messages Module
 - Auto reconnect
 - Authentication with Login Security [HERE](https://aternos.org/addons/a/spigot/19362) (Authentication Plugin For Cracked Servers)
 - Advanced interactive chat commands (follow, goto, drop items).
 - Command priority system to prevent task interference.
 - Supported server versions: `1.8 - 1.21.4`

## Commands

You can interact with the bot in the Minecraft chat using the following commands:

- `!help`: Lists available commands.
- `!status`: Checks if the bot is online.
- `!uptime`: Shows how long the bot process has been running.
- `!inventory`: Lists the items currently in the bot's inventory.
- `!follow <player_name>`: Bot follows the specified player.
- `!stopFollow`: Stops the bot from following.
- `!goto <x> <y> <z>`: Bot navigates to specified coordinates.
- `!goto <player_name>`: Bot navigates to a player's current location.
- `!dropitems`: Bot drops all items from its inventory.
