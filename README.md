# MC-AfkBot v2.0 — Web Control Panel

A fully web-controlled Minecraft AFK bot with a real-time dashboard, live configuration, and Docker support.

![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Web Control Panel** — Modern dark-themed dashboard running on port 5050
- **Real-Time Dashboard** — Live health/food bars, position, ping, inventory, and chat log
- **Live Configuration** — Edit all bot settings from the browser without touching config files
- **Server Stats** — View player count, MOTD, version, and latency even when the bot is disconnected
- **Bot Lifecycle Control** — Connect and disconnect the bot from the UI
- **Auto Reconnect** — Configurable automatic reconnection on disconnect
- **Anti-AFK** — Periodic sneak toggle to avoid AFK kick detection
- **Mining Module** — Automatic interval-based mining and on-demand `!mine` command
- **Chat Messages** — Configurable repeating or one-time chat messages
- **Auto Auth** — Automatic `/register` and `/login` for cracked server auth plugins
- **Player Activity** — Optionally leave when other players join
- **Console Logs** — Real-time log viewer in the browser
- **Crash Prevention** — Comprehensive error handling across all modules
- **Docker Ready** — One command to build and run with Docker Compose
- **Mojang / Microsoft / Offline** account support
- **Supported server versions:** `1.8 – 1.21.4`

## Quick Start with Docker

```bash
git clone https://github.com/YourUser/MC-AfkBot.git
cd MC-AfkBot
docker-compose up -d
```

Open **http://localhost:5050** in your browser, configure your server details in the **Settings** tab, and click **Connect**.

## Manual Installation

1. Clone the repository
2. Install [Node.js](https://nodejs.org/) (v18 or higher recommended)
3. Install dependencies:

```bash
npm install
```

4. Start the application:

```bash
npm start
```

5. Open **http://localhost:5050** in your browser

## Docker Commands

| Command | Description |
|---|---|
| `npm run docker:build` | Build the Docker image |
| `npm run docker:up` | Start the container in the background |
| `npm run docker:down` | Stop and remove the container |
| `npm run docker:logs` | Tail container logs |

## Web Panel Overview

### Dashboard Tab

- **Server Info** — Address, version, player count, MOTD, and latency (updates every 30s)
- **Bot Status** — Username, game mode, position, ping, uptime, experience, health/food bars, mining state
- **Controls** — Connect / Disconnect buttons, Toggle Mining, and a chat input to send messages through the bot
- **Inventory** — Live view of all items in the bot's inventory
- **Chat Log** — Real-time chat feed from the server

### Settings Tab

All settings from `settings.json` are exposed as form fields:

| Section | Options |
|---|---|
| **Bot Account** | Username*, Password, Auth Type (offline/microsoft/mojang) |
| **Server** | IP Address*, Port*, Version |
| **Auto Auth** | Enable/Disable, Auth password for cracked servers |
| **Chat Messages** | Enable/Disable, Repeat toggle, Delay, Message list (add/remove) |
| **Auto Reconnect** | Enable/Disable, Reconnect delay (seconds) |
| **Player Activity** | Enable/Disable, Check interval, Leave when player joins |
| **Mining** | Block types (comma-separated), Interval (ms), Max distance |

> Fields marked with **\*** are locked while the bot is connected to prevent mid-session changes.

### Console Tab

- Colored real-time log viewer (info, warn, error)
- Shows bot events, player joins/leaves, server messages, mining activity, and errors
- Clear button to reset the log view

## In-Game Chat Commands

Players on the server can interact with the bot using `!` commands:

| Command | Description |
|---|---|
| `!help` | List available commands |
| `!status` | Check if the bot is online |
| `!uptime` | Show bot process uptime |
| `!ping` | Show bot's ping to the server |
| `!inventory` | List the bot's inventory |
| `!follow <player>` | Follow a player |
| `!stopFollow` | Stop following |
| `!goto <x> <y> <z>` | Navigate to coordinates |
| `!goto <player>` | Navigate to a player's position |
| `!dropitems` | Drop all inventory items |
| `!mine <block_type>` | Mine a specific block type until inventory is full |
| `!stopMine` | Stop the current `!mine` operation |
| `!toggleMining` | Toggle automatic interval-based mining on/off |
| `!miningStatus` | Show whether automatic mining is enabled |

## Configuration

Settings are stored in `settings.json` and can be edited via the web panel or directly:

```json
{
  "bot-account": {
    "username": "AfkBot",
    "password": "",
    "type": "offline"
  },
  "server": {
    "ip": "your.server.ip",
    "port": 25565,
    "version": "1.21.4"
  },
  "utils": {
    "auto-auth": { "enabled": false, "password": "" },
    "chat-messages": {
      "enabled": true,
      "repeat": true,
      "repeat-delay": 20,
      "messages": ["I am an AFK bot!", "Staying active..."]
    },
    "auto-reconnect": true,
    "auto-reconnect-delay": 10,
    "player-activity": {
      "enabled": false,
      "checkIntervalSeconds": 30,
      "leaveWhenPlayerJoins": true
    }
  },
  "mining": {
    "blockTypes": ["dirt", "cobblestone", "coal_ore", "sand", "oak_log"],
    "interval": 10000,
    "maxDistance": 5
  },
  "webserver": {
    "port": 5050
  }
}
```

The web server port can also be set via the `PORT` environment variable.

## Architecture

```
src/
├── index.js          # Entry point — bootstraps everything
├── config.js         # ConfigManager — reads/writes settings.json
├── bot-manager.js    # BotManager — bot lifecycle, event relay, auto-reconnect
├── webserver.js      # Express + Socket.IO server, REST API
├── bot.js            # Creates mineflayer bot, loads plugins and modules
├── auth.js           # Auto-auth module (/register, /login)
├── chat.js           # Repeating/one-time chat messages
├── commands.js       # In-game ! command handler
└── mining.js         # Automatic + on-demand mining
public/
├── index.html        # Single-page dashboard
├── css/style.css     # Dark theme styles
└── js/app.js         # Frontend Socket.IO client and UI logic
```

## API Reference

The web server exposes a REST API alongside the Socket.IO real-time connection:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Bot status |
| `GET` | `/api/config` | Current configuration |
| `PUT` | `/api/config` | Update configuration |
| `POST` | `/api/connect` | Connect the bot |
| `POST` | `/api/disconnect` | Disconnect the bot |
| `GET` | `/api/inventory` | Bot inventory |
| `POST` | `/api/chat` | Send a chat message (`{ "message": "..." }`) |
| `POST` | `/api/toggle-mining` | Toggle auto-mining |
| `GET` | `/api/server-status` | Ping the Minecraft server |
| `GET` | `/api/logs` | Recent log entries |
| `GET` | `/api/chat-log` | Recent chat messages |

## Note

This bot performs random actions (mining, movement). Keep it away from important builds or structures.

## License

MIT