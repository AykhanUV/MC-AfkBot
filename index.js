const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const { GoalBlock } = require('mineflayer-pathfinder').goals;

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

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let isMining = false;
  let movementIntervalId = null;
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

  bot.once('spawn', () => {
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
          bot.chat(`${messages[i]}`);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach((msg) => {
          bot.chat(msg);
        });
      }
    }

    const pos = config.position;

    if (config.position.enabled) {
      console.log(
        `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
      );
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }

    if (config.utils.movementEnabled) {
      console.log('[INFO] Movement enabled. Bot will move periodically.');
      startRandomMovement(bot);
    }

    if (config.utils.headMovementEnabled) {
      console.log('[INFO] Head movement enabled. Bot will look around periodically.');
      setInterval(() => {
        moveHead(bot);
      }, config.utils.headMovementInterval || 5000);
    }

    if (config.mining.enabled) {
      console.log('[INFO] Mining enabled as part of anti-AFK routine.');
      setInterval(() => {
        if (!isMining) {
          mineRandomBlockNearby(bot);
        }
      }, config.mining.miningInterval);
    }
  });

  function startRandomMovement(bot) {
    movementIntervalId = setInterval(() => {
      if (!isMining) {
        moveBot(bot);
      }
    }, config.utils.movementInterval);
  }

  function stopRandomMovement() {
    if (movementIntervalId) {
      clearInterval(movementIntervalId);
      movementIntervalId = null;
    }
  }

  function moveBot(bot) {
    const directions = ['forward', 'back', 'left', 'right'];
    const randomDirection = directions[Math.floor(Math.random() * directions.length)];

    bot.setControlState(randomDirection, true);
    setTimeout(() => {
      bot.setControlState(randomDirection, false);
    }, 500);
  }

  function moveHead(bot) {
    const yaw = Math.random() * Math.PI * 2 - Math.PI;
    const pitch = Math.random() * Math.PI - Math.PI / 2;
    bot.look(yaw, pitch, true);
  }

  async function mineRandomBlockNearby(bot) {
    isMining = true;
    stopRandomMovement();

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
        startRandomMovement(bot);
      }
    } else {
      console.log('[Mining] No suitable block found to mine after several attempts.');
      isMining = false;
      startRandomMovement(bot);
    }
  }

  bot.on('goal_reached', () => {
    console.log(
      `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
    );
    isMining = false;
    startRandomMovement(bot);
  });

  bot.on('death', () => {
    console.log(
      `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}`,
      '\x1b[0m'
    );
    isMining = false;
    startRandomMovement(bot);
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

  bot.on('error', (err) =>
    console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m')
  );
}

createBot();
