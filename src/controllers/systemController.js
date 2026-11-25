import { RequiredChat } from '../models/RequiredChat.js';
import { User } from '../models/User.js';
import { checkChatMembership } from '../services/telegramBot.js';

/**
 * Get active required chats for the client with fast background auto-verification
 */
export const getRequiredChats = async (req, res) => {
  try {
    const chats = await RequiredChat.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
    
    // If no required chats exist, always verified
    if (chats.length === 0) {
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
        if (user.hasCompletedRequiredChats) {
          userVerified = true;
          userJoinedList = user.joinedChats || [];
        } else {
          // Fast auto-check during loading screen
          const telegramId = user.telegramId;
          const joinedChatIds = new Set(user.joinedChats || []);
          let allJoinedSoFar = true;

          // Check chats via getChatMember in parallel for near-zero latency
          await Promise.all(
            chats.map(async (chat) => {
              if (joinedChatIds.has(String(chat._id))) {
                return;
              }

              const targetHandle = chat.chatUsernameOrId || chat.link;
              if (chat.type === 'bot' || !targetHandle) {
                return;
              }

              const check = await checkChatMembership(targetHandle, telegramId);
              if (check.ok && check.isMember) {
                joinedChatIds.add(String(chat._id));
              } else {
                allJoinedSoFar = false;
              }
            })
          );

          user.joinedChats = Array.from(joinedChatIds);
          userJoinedList = user.joinedChats;

          const requiredCheckCount = chats.filter((c) => c.type !== 'bot').length;
          if (allJoinedSoFar && joinedChatIds.size >= requiredCheckCount) {
            user.hasCompletedRequiredChats = true;
            userVerified = true;
          }
          await user.save();
        }
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
        message: 'All chats verified!',
      });
    }

    const telegramId = user.telegramId;
    const missingChats = [];
    const joinedChatIds = new Set(user.joinedChats || []);

    for (const chat of chats) {
      if (joinedChatIds.has(String(chat._id))) {
        continue;
      }

      const targetHandle = chat.chatUsernameOrId || chat.link;

      // Bot link: consider joined if client confirms clicked
      if (chat.type === 'bot' || !targetHandle) {
        if (req.body?.clientConfirmedIds?.includes(String(chat._id))) {
          joinedChatIds.add(String(chat._id));
        } else {
          missingChats.push(chat.title);
        }
        continue;
      }

      // Check via Telegram Bot API getChatMember
      const check = await checkChatMembership(targetHandle, telegramId);

      if (check.ok) {
        if (check.isMember) {
          joinedChatIds.add(String(chat._id));
        } else {
          missingChats.push(chat.title);
        }
      } else {
        // If bot is not admin in channel or error, allow client confirmation if user clicked Join
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
