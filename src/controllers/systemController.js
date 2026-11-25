import { RequiredChat } from '../models/RequiredChat.js';
import { User } from '../models/User.js';
import { checkChatMembership } from '../services/telegramBot.js';

/**
 * Get active required chats for the client with strict validation
 * Ensures that EVERY currently active chat must be joined.
 */
export const getRequiredChats = async (req, res) => {
  try {
    const chats = await RequiredChat.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    
    // If no active required chats exist in the system, all users are verified
    if (chats.length === 0) {
      if (req.user) {
        await User.findByIdAndUpdate(req.user._id, { hasCompletedRequiredChats: true });
      }
      return res.json({
        success: true,
        requiredChats: [],
        hasCompletedRequiredChats: true,
        joinedChats: [],
      });
    }

    let userVerified = false;
    let userJoinedList = [];

    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user) {
        const joinedChatIds = new Set((user.joinedChats || []).map(String));
        const telegramId = user.telegramId;

        // Identify which active chats are not yet in user's joined list
        const unverifiedChats = chats.filter((c) => !joinedChatIds.has(String(c._id)));

        // If there are unverified chats and user has a telegramId, try fast auto-check via getChatMember
        if (unverifiedChats.length > 0 && telegramId) {
          await Promise.all(
            unverifiedChats.map(async (chat) => {
              const targetHandle = chat.chatUsernameOrId || chat.link;
              if (chat.type === 'bot' || !targetHandle) {
                return;
              }

              try {
                const check = await checkChatMembership(targetHandle, telegramId);
                if (check.ok && check.isMember) {
                  joinedChatIds.add(String(chat._id));
                }
              } catch (e) {
                // Ignore transient lookup errors
              }
            })
          );
        }

        user.joinedChats = Array.from(joinedChatIds);

        // User is verified IF AND ONLY IF every active required chat is in joinedChatIds
        const allActiveJoined = chats.every((chat) => joinedChatIds.has(String(chat._id)));
        user.hasCompletedRequiredChats = allActiveJoined;
        await user.save();

        userVerified = allActiveJoined;
        userJoinedList = user.joinedChats;
      }
    }

    return res.json({
      success: true,
      requiredChats: chats,
      hasCompletedRequiredChats: userVerified,
      joinedChats: userJoinedList,
    });
  } catch (error) {
    console.error('[getRequiredChats] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Verify if the user has joined all required chats on clicking "I've joined"
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
        joinedChats: user.joinedChats || [],
        message: 'All chats verified!',
      });
    }

    const telegramId = user.telegramId;
    const missingChats = [];
    const joinedChatIds = new Set((user.joinedChats || []).map(String));
    const clientConfirmed = new Set((req.body?.clientConfirmedIds || []).map(String));

    for (const chat of chats) {
      const chatIdStr = String(chat._id);
      if (joinedChatIds.has(chatIdStr)) {
        continue;
      }

      const targetHandle = chat.chatUsernameOrId || chat.link;

      // Bot link: consider joined if client confirms clicked
      if (chat.type === 'bot' || !targetHandle) {
        if (clientConfirmed.has(chatIdStr)) {
          joinedChatIds.add(chatIdStr);
        } else {
          missingChats.push(chat.title);
        }
        continue;
      }

      // Check via Telegram Bot API getChatMember
      let isVerified = false;
      if (telegramId) {
        const check = await checkChatMembership(targetHandle, telegramId);
        if (check.ok && check.isMember) {
          isVerified = true;
        }
      }

      if (isVerified) {
        joinedChatIds.add(chatIdStr);
      } else {
        // If bot is not admin in channel or error (e.g. invite link), allow client confirmation if user clicked Join
        if (clientConfirmed.has(chatIdStr)) {
          joinedChatIds.add(chatIdStr);
        } else {
          missingChats.push(chat.title);
        }
      }
    }

    user.joinedChats = Array.from(joinedChatIds);
    const allJoined = chats.every((chat) => joinedChatIds.has(String(chat._id)));
    user.hasCompletedRequiredChats = allJoined;
    await user.save();

    if (!allJoined) {
      return res.status(400).json({
        success: false,
        allJoined: false,
        message: `You have not joined: ${missingChats.join(', ')}. Please tap Join first!`,
        missingChats,
        joinedChats: user.joinedChats,
        joinedCount: joinedChatIds.size,
        totalRequired: chats.length,
      });
    }

    return res.json({
      success: true,
      allJoined: true,
      message: 'All channels verified successfully!',
      joinedChats: user.joinedChats,
      joinedCount: chats.length,
      totalRequired: chats.length,
    });
  } catch (error) {
    console.error('[verifyChatJoins] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
