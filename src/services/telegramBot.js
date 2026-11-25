/**
 * Telegram Bot Service for Firefly
 * Handles /start command, sends welcome message with mini app button,
 * updates chat menu button, and provides messaging utility for broadcasts.
 */
import { config } from '../config/env.js';
import { User } from '../models/User.js';

/**
 * Send a message to a Telegram chat/user with optional inline web app button
 */
export async function sendTelegramMessage(chatId, text, options = {}) {
  const { botToken, miniAppUrl } = config;
  if (!botToken) {
    throw new Error('Telegram bot token not configured');
  }

  const {
    buttonText = '🎮 Play Firefly',
    includeWebAppButton = true,
    parseMode = 'Markdown',
  } = options;

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  };

  if (includeWebAppButton) {
    payload.reply_markup = {
      inline_keyboard: [
        [
          {
            text: buttonText,
            web_app: { url: miniAppUrl },
          },
        ],
      ],
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || 'Failed to send Telegram message');
  }

  return data;
}

export function initTelegramBot() {
  const { botToken, miniAppUrl } = config;

  if (!botToken) {
    console.warn('[TelegramBot] No botToken provided, Telegram Bot listener skipped.');
    return;
  }

  let offset = 0;
  let isRunning = true;

  // Set default bot menu button, description, bio, and commands on startup
  async function configureBotDefaults() {
    try {
      // 0. Ensure no stale webhook is blocking getUpdates
      await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drop_pending_updates: false }),
      }).catch(() => {});

      // 1. Only keep /start command (removed /play)
      await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'start', description: 'Start Firefly and launch racing mini app' },
          ],
        }),
      });

      // 2. Set default and language-specific bio & description (no 3-lane mentions, prevents spam overwrite)
      const bioText = 'Play. Compete. Earn. 🏎️💨\nJoin car racing tournaments, collect diamonds & win real rewards on Firefly!';
      const descText = 'Welcome to Firefly! 🏎️💨\n\nPlay. Compete. Earn.\n\nJoin fast-paced car racing tournaments, collect diamonds, climb the leaderboard, and win real rewards.';
      const cleanLangs = ['', 'en', 'ru', 'hi', 'es', 'zh', 'ar', 'pt', 'de', 'fr'];

      for (const l of cleanLangs) {
        fetch(`https://api.telegram.org/bot${botToken}/setMyShortDescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ short_description: bioText, language_code: l }),
        }).catch(() => {});

        fetch(`https://api.telegram.org/bot${botToken}/setMyDescription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: descText, language_code: l }),
        }).catch(() => {});
      }

      // 3. Set bottom chat menu web app button
      await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: '🎮 Play Firefly',
            web_app: { url: miniAppUrl },
          },
        }),
      });

      console.log(`[TelegramBot] Bot defaults configured (Commands: /start, Mini App URL: ${miniAppUrl})`);
    } catch (err) {
      console.warn('[TelegramBot] configureBotDefaults warning:', err.message);
    }
  }

  configureBotDefaults();

  // Long-polling updates loop
  async function poll() {
    console.log('[TelegramBot] Long polling active for @' + config.botUsername);

    while (isRunning) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=20`,
          { signal: AbortSignal.timeout(30000) }
        );

        if (!response.ok) {
          if (response.status === 409) {
            // Another instance running or conflict, wait and retry
            await new Promise((r) => setTimeout(r, 6000));
            continue;
          }
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        const data = await response.json();

        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;

            if (update.message) {
              const msg = update.message;
              const chatId = msg.chat?.id;
              const text = (msg.text || '').trim();

              if (text.startsWith('/start') || text.startsWith('/play')) {
                // Auto-register / sign up the user in MongoDB
                if (msg.from?.id) {
                  try {
                    const telegramId = String(msg.from.id);
                    let user = await User.findOne({ telegramId });
                    if (!user) {
                      user = await User.create({
                        telegramId,
                        username: msg.from.username || '',
                        firstName: msg.from.first_name || 'Racer',
                        lastName: msg.from.last_name || '',
                        walletBalance: 0,
                      });
                      console.log(`[TelegramBot] Registered user from /start: ${user.telegramId} (@${user.username})`);
                    } else {
                      user.firstName = msg.from.first_name || user.firstName;
                      user.lastName = msg.from.last_name || user.lastName;
                      if (msg.from.username) user.username = msg.from.username;
                      user.lastActiveAt = new Date();
                      await user.save();
                    }
                  } catch (userErr) {
                    console.error('[TelegramBot] User registration error:', userErr.message);
                  }
                }

                const username = msg.from?.username
                  ? `@${msg.from.username}`
                  : (msg.from?.first_name || 'Racer');

                // Simple and clear message requested:
                // "welcome <username> , play . compete . earn and button to open the mini app"
                const welcomeMessage = `👋 Welcome ${username}!\n\n🏎️ Play. Compete. Earn.\n\nTap the button below to start racing and win real rewards!`;

                // 1. Send welcome message with mini app button
                await sendTelegramMessage(chatId, welcomeMessage, {
                  buttonText: '🎮 Play Firefly',
                  includeWebAppButton: true,
                }).catch((e) => console.error('[TelegramBot] sendMessage error:', e.message));

                // 2. Automatically update chat menu button for this chat
                await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    menu_button: {
                      type: 'web_app',
                      text: '🎮 Play Firefly',
                      web_app: { url: miniAppUrl },
                    },
                  }),
                }).catch((e) => console.error('[TelegramBot] setChatMenuButton error:', e.message));
              }
            }
          }
        }
      } catch (err) {
        // Network timeout / connection reset, wait and continue
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  // Start polling in background
  poll();

  return {
    stop: () => {
      isRunning = false;
    },
  };
}
