/**
 * Telegram Bot Service for Firefly
 * Handles /start command, sends welcome message with mini app button,
 * and automatically updates the chat menu button for users.
 */
import { config } from '../config/env.js';
import { User } from '../models/User.js';

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

      // 2. Set default and language-specific bio & description (prevents affiliate spam hijack)
      const bioText = '🏎️ Play 3-lane car racing tournaments, collect diamonds & win real rewards on Firefly!';
      const descText = '🏎️ Welcome to Firefly! Race in fast-paced 3-lane tournaments, collect diamonds, dodge oncoming traffic, and climb the leaderboard to win real cash rewards.';
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
    console.log('[TelegramBot] Long polling started for @' + config.botUsername);

    while (isRunning) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=25`,
          { signal: AbortSignal.timeout(35000) }
        );

        if (!response.ok) {
          if (response.status === 409) {
            // Another instance running, back off
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
              const firstName = msg.from?.first_name || 'Racer';

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
                      console.log(`[TelegramBot] Signed up new user from /start: ${user.telegramId} (@${user.username})`);
                    } else {
                      user.firstName = msg.from.first_name || user.firstName;
                      user.lastName = msg.from.last_name || user.lastName;
                      if (msg.from.username) user.username = msg.from.username;
                      user.lastActiveAt = new Date();
                      await user.save();
                    }
                  } catch (userErr) {
                    console.error('[TelegramBot] User signup error:', userErr.message);
                  }
                }

                const username = msg.from?.username
                  ? `@${msg.from.username}`
                  : (msg.from?.first_name || 'Racer');

                const welcomeMessage = `👋 Welcome to FIREFLY, ${username}! 🏎️💨\n\nPlay car racing tournaments, collect diamonds, and climb the leaderboard to win real rewards.\nTap the button below to start racing!`;

                // 1. Send welcome message with mini app button
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: welcomeMessage,
                    parse_mode: 'Markdown',
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: '🎮 Play Firefly',
                            web_app: { url: miniAppUrl },
                          },
                        ],
                      ],
                    },
                  }),
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
