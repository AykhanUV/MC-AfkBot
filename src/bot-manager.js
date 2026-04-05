const EventEmitter = require('events');
const { createBot } = require('./bot');
const util = require('minecraft-server-util');

class BotManager extends EventEmitter {
    constructor(configManager) {
        super();
        this.configManager = configManager;
        this.bot = null;
        this.connected = false;
        this.connecting = false;
        this.chatLog = [];
        this.logs = [];
        this.statusInterval = null;
        this.reconnectTimeout = null;
        this.autoReconnectEnabled = true; // Can be temporarily disabled for manual disconnect
        this.startTime = null;
        this.maxLogs = 500;
        this.maxChatLog = 300;
    }

    addLog(level, message, module = 'System') {
        const entry = { level, message, module, timestamp: new Date().toISOString() };
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) this.logs.shift();
        this.emit('log', entry);
    }

    connect() {
        if (this.bot || this.connecting) {
            this.addLog('warn', 'Bot is already connected or connecting.');
            return { success: false, error: 'Already connected or connecting' };
        }

        const config = this.configManager.get();
        const runtimeState = this.configManager.loadRuntimeState();

        this.connecting = true;
        this.autoReconnectEnabled = true;
        this.addLog('info', `Connecting to ${config.server.ip}:${config.server.port}...`);

        try {
            this.bot = createBot(config, runtimeState);
        } catch (err) {
            this.connecting = false;
            this.bot = null;
            this.addLog('error', `Failed to create bot: ${err.message}`);
            return { success: false, error: err.message };
        }

        this._setupBotListeners(config);
        return { success: true };
    }

    disconnect() {
        this.autoReconnectEnabled = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.bot) {
            this.addLog('info', 'Disconnecting bot...');
            try {
                this.bot.quit();
            } catch (err) {
                this.addLog('warn', `Error during disconnect: ${err.message}`);
            }
            this._cleanup();
            this.emit('disconnected', { reason: 'Manual disconnect' });
        }
        return { success: true };
    }

    _cleanup() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
        this.bot = null;
        this.connected = false;
        this.connecting = false;
        this.startTime = null;
    }

    _setupBotListeners(config) {
        const bot = this.bot;
        if (!bot) return;

        bot.once('spawn', () => {
            this.connected = true;
            this.connecting = false;
            this.startTime = Date.now();
            this.addLog('info', `Bot spawned as ${bot.username} in ${bot.game?.gameMode || 'unknown'} mode.`, 'Bot');
            this.emit('connected');

            // Start periodic status/inventory updates
            this.statusInterval = setInterval(() => {
                if (this.bot && this.connected) {
                    this.emit('status', this.getStatus());
                    this.emit('inventory', this.getInventory());
                }
            }, 2000);

            // Emit initial status
            setTimeout(() => {
                if (this.bot && this.connected) {
                    this.emit('status', this.getStatus());
                    this.emit('inventory', this.getInventory());
                }
            }, 500);
        });

        bot.on('chat', (username, message) => {
            const entry = { username, message, timestamp: new Date().toISOString() };
            this.chatLog.push(entry);
            if (this.chatLog.length > this.maxChatLog) this.chatLog.shift();
            this.emit('chat', entry);
        });

        bot.on('health', () => {
            if (this.bot && this.connected) {
                this.emit('status', this.getStatus());
            }
        });

        bot.on('playerJoined', (player) => {
            if (player.username !== bot.username) {
                this.addLog('info', `Player ${player.username} joined the server.`, 'Server');
            }
        });

        bot.on('playerLeft', (player) => {
            if (player.username !== bot.username) {
                this.addLog('info', `Player ${player.username} left the server.`, 'Server');
            }
        });

        bot.on('death', () => {
            this.addLog('warn', 'Bot died and respawned.', 'Bot');
        });

        bot.on('kicked', (reason) => {
            let reasonText = reason;
            try {
                if (typeof reason === 'object') reasonText = JSON.stringify(reason);
            } catch(e) { /* ignore */ }
            this.addLog('error', `Bot was kicked: ${reasonText}`, 'Server');
        });

        bot.on('error', (err) => {
            this.addLog('error', `Bot error: ${err.message}`, 'Bot');
        });

        bot.on('end', (reason) => {
            const wasConnected = this.connected;
            this._cleanup();

            const reasonStr = reason || 'Unknown';
            if (wasConnected) {
                this.addLog('info', `Bot disconnected: ${reasonStr}`, 'Bot');
            }
            this.emit('disconnected', { reason: reasonStr });

            // Auto-reconnect logic
            if (this.autoReconnectEnabled && config.utils['auto-reconnect']) {
                const delay = (config.utils['auto-reconnect-delay'] || 10) * 1000;
                this.addLog('info', `Auto-reconnecting in ${delay / 1000}s...`, 'System');
                this.reconnectTimeout = setTimeout(() => {
                    this.reconnectTimeout = null;
                    if (this.autoReconnectEnabled) {
                        this.connect();
                    }
                }, delay);
            }
        });

        // Listen for message events (system messages, not just chat)
        bot.on('message', (jsonMsg) => {
            try {
                const text = jsonMsg.toString();
                if (text && text.trim()) {
                    // Don't double-log player chat messages (those come via 'chat' event)
                    // Only log system/action bar messages
                    const isPlayerChat = jsonMsg.translate === 'chat.type.text';
                    if (!isPlayerChat) {
                        this.addLog('info', `[Server] ${text}`, 'Server');
                    }
                }
            } catch (e) { /* ignore parse errors */ }
        });
    }

    getStatus() {
        if (!this.bot || !this.connected) {
            return {
                connected: false,
                username: null,
                health: null,
                food: null,
                position: null,
                ping: null,
                isMining: false,
                isMiningEnabled: false,
                gameMode: null,
                experience: null,
                uptime: null
            };
        }

        const bot = this.bot;
        return {
            connected: true,
            username: bot.username || null,
            health: bot.health ?? null,
            food: bot.food ?? null,
            position: bot.entity?.position ? {
                x: Math.round(bot.entity.position.x * 10) / 10,
                y: Math.round(bot.entity.position.y * 10) / 10,
                z: Math.round(bot.entity.position.z * 10) / 10
            } : null,
            ping: bot.player?.ping ?? null,
            isMining: bot.isMining || false,
            isMiningEnabled: bot.isMiningEnabled || false,
            gameMode: bot.game?.gameMode || null,
            experience: bot.experience ? {
                level: bot.experience.level,
                points: bot.experience.points,
                progress: bot.experience.progress
            } : null,
            uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : null
        };
    }

    getInventory() {
        if (!this.bot || !this.connected) return [];
        try {
            return this.bot.inventory.items().map(item => ({
                name: item.name,
                count: item.count,
                slot: item.slot,
                displayName: item.displayName || item.name
            }));
        } catch (err) {
            return [];
        }
    }

    getChatLog() {
        return this.chatLog;
    }

    getLogs() {
        return this.logs;
    }

    sendChat(message) {
        if (!this.bot || !this.connected) {
            return { success: false, error: 'Bot is not connected' };
        }
        try {
            this.bot.chat(message);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    toggleMining() {
        if (!this.bot || !this.connected) {
            return { success: false, error: 'Bot is not connected' };
        }
        this.bot.isMiningEnabled = !this.bot.isMiningEnabled;
        this.configManager.saveRuntimeState({ isMiningEnabled: this.bot.isMiningEnabled });

        if (!this.bot.isMiningEnabled && this.bot.isMining) {
            this.bot.isMining = false;
            try { this.bot.pathfinder.stop(); } catch(e) { /* ignore */ }
            this.bot.emit('mining_stopped');
        }

        this.addLog('info', `Auto-mining ${this.bot.isMiningEnabled ? 'ENABLED' : 'DISABLED'}`, 'Mining');
        this.emit('status', this.getStatus());
        return { success: true, isMiningEnabled: this.bot.isMiningEnabled };
    }

    async pingServer(ip, port) {
        try {
            const result = await util.status(ip, parseInt(port), { timeout: 5000 });
            return {
                online: result.players.online,
                max: result.players.max,
                players: result.players.sample || [],
                motd: result.motd?.clean || result.motd?.toString() || '',
                version: result.version?.name || 'Unknown',
                latency: result.roundTripLatency || 0
            };
        } catch (err) {
            return { error: err.message, online: 0, max: 0, players: [], motd: '', version: '', latency: 0 };
        }
    }

    isConnected() {
        return this.connected;
    }

    getBot() {
        return this.bot;
    }
}

module.exports = { BotManager };
