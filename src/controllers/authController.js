import { User } from '../models/User.js';
import { verifyTelegramInitData } from '../utils/telegramAuth.js';
import { generateUserToken } from '../middleware/auth.js';
import { config } from '../config/env.js';

export const telegramLogin = async (req, res) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({
        success: false,
        message: 'Telegram initData is required for authentication',
      });
    }

    const verification = verifyTelegramInitData(initData);
    if (!verification.valid) {
      return res.status(401).json({
        success: false,
        message: `Authentication failed: ${verification.error}`,
      });
    }

    const tgUser = verification.user;
    const telegramId = String(tgUser.id);

    // Find or create user atomically
    let user = await User.findOne({ telegramId });

    if (!user) {
      user = await User.create({
        telegramId,
        username: tgUser.username || '',
        firstName: tgUser.first_name || 'Player',
        lastName: tgUser.last_name || '',
        photoUrl: tgUser.photo_url || '',
        walletBalance: 0,
      });
      console.log(`[Auth] New user registered: ${user.telegramId} (@${user.username})`);
    } else {
      // Update profile info if changed
      user.firstName = tgUser.first_name || user.firstName;
      user.lastName = tgUser.last_name || user.lastName;
      user.username = tgUser.username || user.username;
      if (tgUser.photo_url) user.photoUrl = tgUser.photo_url;
      user.lastActiveAt = new Date();
      await user.save();
    }

    const token = generateUserToken(user);

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        walletBalance: user.walletBalance,
        totalEarnings: user.totalEarnings,
        tournamentsPlayed: user.tournamentsPlayed,
        tournamentsWon: user.tournamentsWon,
        highestGameScore: user.highestGameScore,
        savedUpiId: user.savedUpiId || '',
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('[telegramLogin] Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during authentication' });
  }
};

/**
 * Demo / Dev login for testing outside Telegram Mini App
 */
export const devLogin = async (req, res) => {
  try {
    const { telegramId = '123456789', username = 'demo_racer', firstName = 'Alex', lastName = 'Racer' } = req.body;

    let user = await User.findOne({ telegramId: String(telegramId) });
    if (!user) {
      user = await User.create({
        telegramId: String(telegramId),
        username,
        firstName,
        lastName,
        walletBalance: 50, // Give demo starting balance for testing
      });
    }

    const token = generateUserToken(user);

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        walletBalance: user.walletBalance,
        totalEarnings: user.totalEarnings,
        tournamentsPlayed: user.tournamentsPlayed,
        tournamentsWon: user.tournamentsWon,
        highestGameScore: user.highestGameScore,
        savedUpiId: user.savedUpiId || '',
        isAdmin: user.isAdmin,
      },
    });
  } catch (error) {
    console.error('[devLogin] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateSavedUpi = async (req, res) => {
  try {
    const { upiId } = req.body;
    const cleanUpi = (upiId || '').trim();

    if (!cleanUpi || !cleanUpi.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid UPI ID (e.g. username@bank).',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { savedUpiId: cleanUpi },
      { new: true }
    );

    return res.json({
      success: true,
      message: 'UPI ID saved successfully!',
      savedUpiId: updatedUser.savedUpiId,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        walletBalance: user.walletBalance,
        totalEarnings: user.totalEarnings,
        tournamentsPlayed: user.tournamentsPlayed,
        tournamentsWon: user.tournamentsWon,
        highestGameScore: user.highestGameScore,
        savedUpiId: user.savedUpiId || '',
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
