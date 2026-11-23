import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Validates Telegram Mini App initData
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export const verifyTelegramInitData = (initDataRaw) => {
  if (!initDataRaw) {
    return { valid: false, error: 'No initData provided' };
  }

  try {
    const urlParams = new URLSearchParams(initDataRaw);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { valid: false, error: 'Missing hash in initData' };
    }

    // Collect and sort all keys except hash
    const dataCheckArr = [];
    const entries = Array.from(urlParams.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [key, value] of entries) {
      if (key !== 'hash') {
        dataCheckArr.push(`${key}=${value}`);
      }
    }

    const dataCheckString = dataCheckArr.join('\n');

    // HMAC-SHA256 of botToken with key "WebAppData"
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.botToken)
      .digest();

    // HMAC-SHA256 of dataCheckString with secretKey
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Invalid hash signature' };
    }

    // Parse user object
    const userStr = urlParams.get('user');
    if (!userStr) {
      return { valid: false, error: 'Missing user data in initData' };
    }

    const user = JSON.parse(userStr);
    const authDate = parseInt(urlParams.get('auth_date') || '0', 10);

    return {
      valid: true,
      user,
      authDate,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};
