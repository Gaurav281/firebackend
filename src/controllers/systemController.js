import { RequiredChat } from '../models/RequiredChat.js';
import { User } from '../models/User.js';
import { checkChatMembership } from '../services/telegramBot.js';

/**
 * Get active required chats for the client
 */
export const getRequiredChats = async (req, res) => {
  try {
    const chats = await RequiredChat.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    
    // If user is authenticated, check their verification status
    let userVerified = false;
    let userJoinedList = [];

    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        userVerified = Boolean(user.hasCompletedRequiredChats);
        userJoinedList = user.joinedChats || [];
      }
    }

    return res.json({
      success: true,
      requiredChats: chats,
      hasCompletedRequiredChats: chats.length === 0 ? true : userVerified,
      joinedChats: userJoinedList,
    });
  } catch (error) {
    console.error('[getRequiredChats] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Verify if the user has joined all required chats
 */
export const verifyChatJoins = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const chats = await RequiredChat.find({ isActive: true }).sort({ order: 1 });
    if (chats.length === 0) {
      user.hasCompletedRequiredChats = true;
      await user.save();
      return res.json({
        success: true,
        allJoined: true,
        message: 'All chats verified!',
      });
    }

    const telegramId = user.telegramId;
    const missingChats = [];
    const joinedChatIds = new Set(user.joinedChats || []);

    for (const chat of chats) {
      // If already marked joined
      if (joinedChatIds.has(String(chat._id))) {
        continue;
      }

      // If it's a bot link or chat username is not provided, we consider it joined on user action
      if (chat.type === 'bot' || !chat.chatUsernameOrId) {
        joinedChatIds.add(String(chat._id));
        continue;
      }

      // Check via Telegram Bot API getChatMember
      const check = await checkChatMembership(chat.chatUsernameOrId, telegramId);

      if (check.ok) {
        if (check.isMember) {
          joinedChatIds.add(String(chat._id));
        } else {
          missingChats.push(chat.title);
        }
      } else {
        // If bot is not admin in the channel or check couldn't be performed,
        // we check whether the user has clicked/acknowledged it
        if (req.body?.clientConfirmedIds?.includes(String(chat._id))) {
          joinedChatIds.add(String(chat._id));
        } else {
          missingChats.push(chat.title);
        }
      }
    }

    user.joinedChats = Array.from(joinedChatIds);
    const allJoined = missingChats.length === 0;
    user.hasCompletedRequiredChats = allJoined;
    await user.save();

    if (!allJoined) {
      return res.status(400).json({
        success: false,
        allJoined: false,
        message: `You have not joined: ${missingChats.join(', ')}. Please join first!`,
        missingChats,
        joinedCount: joinedChatIds.size,
        totalRequired: chats.length,
      });
    }

    return res.json({
      success: true,
      allJoined: true,
      message: 'All channels verified successfully!',
      joinedCount: chats.length,
      totalRequired: chats.length,
    });
  } catch (error) {
    console.error('[verifyChatJoins] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
