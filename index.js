const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear, GoalGetToBlock } } = require('mineflayer-pathfinder');
const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
});

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.once('spawn', () => {
    bot.loadPlugin(pathfinder);
    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    bot.settings.colorsEnabled = false;

    let isMining = false;
    let lastMinedBlock = null;

    function sendRegister(password) {
      return new Promise((resolve, reject) => {
        bot.chat(`/register ${password} ${password}`);
        console.log(`[Auth] Sent /register command.`);

        bot.once('chat', (username, message) => {
          console.log(`[ChatLog] <${username}> ${message}`);

          if (message.includes('successfully registered')) {
            console.log('[INFO] Registration confirmed.');
            resolve();
          } else if (message.includes('already registered')) {
            console.log('[INFO] Bot was already registered.');
            resolve();
          } else if (message.includes('Invalid command')) {
            reject(`Registration failed: Invalid command. Message: "${message}"`);
          } else {
            reject(`Registration failed: unexpected message "${message}".`);
          }
        });
      });
    }

    function sendLogin(password) {
      return new Promise((resolve, reject) => {
        bot.chat(`/login ${password}`);
        console.log(`[Auth] Sent /login command.`);

        bot.once('chat', (username, message) => {
          console.log(`[ChatLog] <${username}> ${message}`);

          if (message.includes('successfully logged in')) {
            console.log('[INFO] Login successful.');
            resolve();
          } else if (message.includes('Invalid password')) {
            reject(`Login failed: Invalid password. Message: "${message}"`);
          } else if (message.includes('not registered')) {
            reject(`Login failed: Not registered. Message: "${message}"`);
          } else {
            reject(`Login failed: unexpected message "${message}".`);
          }
        });
      });
    }

    function startAntiAFK() {
      const antiAFK = config.utils['anti-afk'];

      if (!antiAFK.enabled) return;

      console.log('[INFO] Starting improved anti-AFK module');

      if (antiAFK.movement.enabled) {
        setInterval(() => {
          if (!isMining) moveToRandomNearbyPosition(bot, antiAFK.movement.radius);
        }, antiAFK.movement.interval);
      }

      if (antiAFK.interaction.enabled) {
        setInterval(() => {
          if (!isMining) interactWithNearbyBlock(bot, antiAFK.interaction.nearbyBlockTypes);
        }, antiAFK.interaction.interval);
      }

      if (antiAFK.jumping.enabled) {
        setInterval(() => {
          if (!isMining && Math.random() < antiAFK.jumping.probability) {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
          }
        }, antiAFK.jumping.interval);
      }

      if (antiAFK.rotation.enabled) {
        setInterval(() => {
          if (!isMining) rotateRandomly(bot);
        }, antiAFK.rotation.interval);
      }

      if (antiAFK.fishing.enabled) {
        setInterval(() => {
          if (!isMining) fish(bot);
        }, antiAFK.fishing.interval)
      }
    }

    function moveToRandomNearbyPosition(bot, radius) {
        const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
        const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

        const targetX = bot.entity.position.x + randomX;
        const targetZ = bot.entity.position.z + randomZ;

        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.goto(new GoalGetToBlock(targetX, bot.entity.position.y, targetZ))
          .catch(() => {
          });
    }

    function interactWithNearbyBlock(bot, blockTypes) {
      const nearbyBlock = bot.findBlock({
        matching: (block) => blockTypes.includes(block.name),
        maxDistance: 3,
      });

      if (nearbyBlock) {
        console.log(`[Anti-AFK] Interacting with ${nearbyBlock.name} at ${nearbyBlock.position}`);
        bot.activateBlock(nearbyBlock);
      }
    }
      async function fish(bot) {
      try {
        await bot.equip(mcData.itemsByName.fishing_rod.id, 'hand');
      } catch (err) {
        console.log("[Fishing] Can't equip fishing rod")
        return;
      }

      try {
        await bot.activateItem();
        console.log('[Fishing] Cast fishing rod.');

        const waitTime = Math.random() * (20000 - 5000) + 5000;
        await new Promise(resolve => setTimeout(resolve, waitTime));

        await bot.activateItem();
        console.log('[Fishing] Reeled in fishing rod.');

      } catch (error) {
        console.log(`[Fishing] Error while fishing: ${error}`);
      }
    }

    function rotateRandomly(bot) {
      const yaw = Math.random() * Math.PI * 2 - Math.PI;
      const pitch = Math.random() * Math.PI - Math.PI / 2;
      bot.look(yaw, pitch, true);
    }

    console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

    if (config.utils['auto-auth'].enabled) {
        console.log('[INFO] Started auto-auth module');

        const password = config.utils['auto-auth'].password;

        Promise.resolve()
          .then(() => sendRegister(password))
          .then(() => sendLogin(password))
          .catch(error => console.error('[ERROR]', error));
    }

    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];

      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;

        setInterval(() => {
          const messageToSend = messages[i];
          console.log(`[Chat] Attempting to send message: ${messageToSend}`);
          bot.chat(messageToSend);
          console.log(`[Chat] Sent message: ${messageToSend}`);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach((msg) => {
          console.log(`[Chat] Attempting to send message: ${msg}`);
          bot.chat(msg);
          console.log(`[Chat] Sent message: ${msg}`);
        });
      }
    }

    bot.on('chat', (username, message) => {
      console.log(`[ChatLog] <${username}> ${message}`);

      if (message.startsWith('!')) {
        const command = message.substring(1).split(' ')[0];
        const args = message.substring(1).split(' ').slice(1);

        console.log(`[Command] Received command: ${command} with args: ${args}`);

        switch (command) {
          case 'status':
            bot.chat(`[Status] I'm currently online and running!`);
            break;
          case 'help':
            bot.chat(`[Help] Available commands: !status, !help, !uptime`);
            break;
          case 'uptime':
            const uptime = process.uptime();
            const uptimeString = formatUptime(uptime);
            bot.chat(`[Uptime] I've been running for: ${uptimeString}`);
            break;
          default:
            bot.chat(`[Error] Unknown command: ${command}`);
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

      const pos = config.position;

      if (config.position.enabled) {
        console.log(
          `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
        );
        bot.pathfinder.setMovements(defaultMove);
        bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      startAntiAFK();

      if (config.mining.enabled) {
        console.log('[INFO] Mining enabled as part of anti-AFK routine.');
        setInterval(() => {
          if (!isMining) {
            mineRandomBlockNearby(bot);
          }
        }, config.mining.miningInterval);
      }

      async function mineRandomBlockNearby(bot) {
      isMining = true;

      const radius = 4;
      const yRange = 2;

      let targetBlock = null;
      let attempts = 0;

      while (!targetBlock && attempts < 10) {
        const randomX = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
        const randomY = Math.floor(Math.random() * (yRange * 2 + 1)) - yRange;
        const randomZ = Math.floor(Math.random() * (radius * 2 + 1)) - radius;

        const targetPos = bot.entity.position.offset(randomX, randomY, randomZ);
        const block = bot.blockAt(targetPos);

        if (block && block.type !== 0 && !config.mining.blockExceptions.includes(block.name)) {
          if (!lastMinedBlock || lastMinedBlock.position.distanceTo(block.position) > 1) {
            targetBlock = block;
          }
        }

        attempts++;
      }

      if (targetBlock) {
        console.log(`[Mining] Attempting to mine block at ${targetBlock.position} (type: ${targetBlock.name})`);
        try {
          const digTime = targetBlock.digTime(bot.heldItem);
          await new Promise((resolve) => setTimeout(resolve, digTime));

          await bot.dig(targetBlock);
          console.log(`[Mining] Successfully mined block at ${targetBlock.position}`);

          bot.pathfinder.setMovements(defaultMove);
          bot.pathfinder.setGoal(new GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1));
          lastMinedBlock = targetBlock;

        } catch (err) {
          console.log(`[Mining] Error while mining: ${err}`);
          isMining = false;
        }
      } else {
        console.log('[Mining] No suitable block found to mine after several attempts.');
        isMining = false;
      }
    }

    bot.on('goal_reached', () => {
      console.log(`[AfkBot] Reached a goal`);
      isMining = false;
    });

    bot.on('death', () => {
      console.log(`\x1b[33m[AfkBot] Bot has died and was respawned\x1b[0m`);
      isMining = false;
    });

    if (config.utils['auto-reconnect']) {
      bot.on('end', () => {
        setTimeout(() => {
          createBot();
        }, config.utils['auto-recconect-delay']);
      });
    }

    bot.on('kicked', (reason) =>
      console.log(
        '\x1b[33m',
        `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`,
        '\x1b[0m'
      )
    );

    bot.on('error', (err) => {
      console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m');
    });

    bot.on('entityUpdate', (entity) => {

    });
  });
}

createBot();
