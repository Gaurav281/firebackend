import { Tournament } from '../models/Tournament.js';
import { TournamentParticipant } from '../models/TournamentParticipant.js';
import { User } from '../models/User.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { RequiredChat } from '../models/RequiredChat.js';
import { getSystemConfig, setSystemConfig } from '../models/SystemConfig.js';
import { config } from '../config/env.js';
import { sendTelegramMessage } from '../services/telegramBot.js';

export const createTournament = async (req, res) => {
  try {
    const {
      title,
      description,
      entryFee = 0,
      totalParticipantsAllowed,
      winnerCount = 1,
      rewards = [],
      turnsPerUser = 1,
      durationHours = 24,
      endTimeCustom,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Tournament title is required' });
    }

    const maxParticipants = Number(totalParticipantsAllowed);
    if (!maxParticipants || maxParticipants < 2) {
      return res.status(400).json({
        success: false,
        message: 'Total participants must be at least 2',
      });
    }

    const numWinners = Number(winnerCount);
    if (![1, 2, 3].includes(numWinners)) {
      return res.status(400).json({
        success: false,
        message: 'Number of winners must be 1, 2, or 3',
      });
    }

    if (!Array.isArray(rewards) || rewards.length !== numWinners) {
      return res.status(400).json({
        success: false,
        message: `Must provide exactly ${numWinners} reward amount(s) matching winner count`,
      });
    }

    const cleanRewards = rewards.map((r) => Math.max(0, Number(r) || 0));

    const numTurns = Math.max(1, Number(turnsPerUser) || 1);
    const numEntryFee = Math.max(0, Number(entryFee) || 0);

    let calculatedEndTime = new Date(Date.now() + Number(durationHours) * 3600 * 1000);
    if (endTimeCustom) {
      calculatedEndTime = new Date(endTimeCustom);
    }

    if (calculatedEndTime <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'End time must be in the future',
      });
    }

    const newTournament = await Tournament.create({
      title: title.trim(),
      description: description ? description.trim() : undefined,
      entryFee: numEntryFee,
      totalParticipantsAllowed: maxParticipants,
      winnerCount: numWinners,
      rewards: cleanRewards,
      turnsPerUser: numTurns,
      status: 'ACTIVE',
      startTime: new Date(),
      endTime: calculatedEndTime,
    });

    return res.status(201).json({
      success: true,
      message: 'Tournament created successfully!',
      tournament: newTournament,
    });
  } catch (error) {
    console.error('[createTournament] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const declareTournamentResult = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    if (tournament.status === 'DECLARED') {
      return res.status(400).json({
        success: false,
        message: 'This tournament results have already been declared and prizes distributed.',
      });
    }

    // Fetch all participants sorted primarily by bestDiamonds, then bestScore descending
    const participants = await TournamentParticipant.find({ tournamentId })
      .sort({ bestDiamonds: -1, bestScore: -1, updatedAt: 1 })
      .populate('userId');

    if (participants.length === 0) {
      tournament.status = 'DECLARED';
      tournament.declaredAt = new Date();
      await tournament.save();
      return res.json({
        success: true,
        message: 'Tournament declared with 0 participants. No rewards distributed.',
        tournament,
      });
    }

    const winners = [];
    const countToReward = Math.min(tournament.winnerCount, participants.length);

    for (let i = 0; i < countToReward; i++) {
      const part = participants[i];
      const rank = i + 1;
      const prizeAmount = tournament.rewards[i] || 0;

      winners.push({
        userId: part.userId._id,
        rank,
        diamonds: part.bestDiamonds || 0,
        score: part.bestScore,
        prize: prizeAmount,
      });

      // Update participant rank
      part.rank = rank;
      await part.save();

      // Credit prize if > 0
      if (prizeAmount > 0) {
        const winnerUser = await User.findByIdAndUpdate(
          part.userId._id,
          {
            $inc: {
              walletBalance: prizeAmount,
              totalEarnings: prizeAmount,
              tournamentsWon: 1,
            },
          },
          { new: true }
        );

        // Record winning transaction
        await WalletTransaction.create({
          userId: part.userId._id,
          type: 'TOURNAMENT_WINNING',
          amount: prizeAmount,
          status: 'SUCCESS',
          balanceAfter: winnerUser.walletBalance,
          tournamentId: tournament._id,
          description: `Prize for Rank #${rank} in "${tournament.title}"`,
        });
      }
    }

    tournament.status = 'DECLARED';
    tournament.declaredAt = new Date();
    tournament.winners = winners;
    await tournament.save();

    return res.json({
      success: true,
      message: `Tournament results declared! Rewards credited to top ${winners.length} winner(s).`,
      winners,
      tournament,
    });
  } catch (error) {
    console.error('[declareTournamentResult] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminTransactions = async (req, res) => {
  try {
    const { type, status } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const transactions = await WalletTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'username firstName lastName telegramId walletBalance')
      .populate('tournamentId', 'title');

    return res.json({
      success: true,
      transactions,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const approveDeposit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { remarks = 'Deposit verified and approved' } = req.body;

    const txn = await WalletTransaction.findOne({
      _id: transactionId,
      type: 'DEPOSIT',
      status: 'PENDING',
    });

    if (!txn) {
      return res.status(404).json({
        success: false,
        message: 'Deposit transaction not found or already processed.',
      });
    }

    // Atomically credit user's wallet balance
    const updatedUser = await User.findByIdAndUpdate(
      txn.userId,
      {
        $inc: { walletBalance: txn.amount },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    txn.status = 'APPROVED';
    txn.balanceAfter = updatedUser.walletBalance;
    txn.paymentDetails.adminRemarks = remarks;
    txn.paymentDetails.processedAt = new Date();
    await txn.save();

    return res.json({
      success: true,
      message: `Deposit of ₹${txn.amount} approved! User balance updated to ₹${updatedUser.walletBalance}.`,
      transaction: txn,
    });
  } catch (error) {
    console.error('[approveDeposit] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const rejectDeposit = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { remarks = 'Invalid transaction reference or payment not received' } = req.body;

    const txn = await WalletTransaction.findOne({
      _id: transactionId,
      type: 'DEPOSIT',
      status: 'PENDING',
    });

    if (!txn) {
      return res.status(404).json({
        success: false,
        message: 'Deposit transaction not found or already processed.',
      });
    }

    txn.status = 'REJECTED';
    txn.paymentDetails.adminRemarks = remarks;
    txn.paymentDetails.processedAt = new Date();
    await txn.save();

    return res.json({
      success: true,
      message: 'Deposit request rejected.',
      transaction: txn,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const approveWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { remarks = 'Payment sent successfully via UPI' } = req.body;

    const txn = await WalletTransaction.findOne({
      _id: transactionId,
      type: 'WITHDRAWAL',
      status: 'PENDING',
    });

    if (!txn) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal transaction not found or already processed.',
      });
    }

    txn.status = 'APPROVED';
    txn.paymentDetails.adminRemarks = remarks;
    txn.paymentDetails.processedAt = new Date();
    await txn.save();

    return res.json({
      success: true,
      message: `Withdrawal of ₹${txn.amount} marked as APPROVED.`,
      transaction: txn,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const rejectWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { remarks = 'Withdrawal rejected. Amount refunded to wallet.' } = req.body;

    const txn = await WalletTransaction.findOne({
      _id: transactionId,
      type: 'WITHDRAWAL',
      status: 'PENDING',
    });

    if (!txn) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal transaction not found or already processed.',
      });
    }

    // Refund the deducted amount back to user's wallet balance
    const updatedUser = await User.findByIdAndUpdate(
      txn.userId,
      {
        $inc: { walletBalance: txn.amount },
      },
      { new: true }
    );

    txn.status = 'REJECTED';
    txn.paymentDetails.adminRemarks = remarks;
    txn.paymentDetails.processedAt = new Date();
    if (updatedUser) txn.balanceAfter = updatedUser.walletBalance;
    await txn.save();

    // Log refund transaction
    await WalletTransaction.create({
      userId: txn.userId,
      type: 'REFUND',
      amount: txn.amount,
      status: 'SUCCESS',
      balanceAfter: updatedUser?.walletBalance,
      description: `Refund for rejected withdrawal: ${remarks}`,
    });

    return res.json({
      success: true,
      message: `Withdrawal rejected and ₹${txn.amount} refunded back to user wallet.`,
      transaction: txn,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateUpiConfig = async (req, res) => {
  try {
    const { upiId, upiName } = req.body;

    if (upiId) {
      await setSystemConfig('admin_upi_id', upiId.trim(), 'Admin UPI ID');
    }
    if (upiName) {
      await setSystemConfig('admin_upi_name', upiName.trim(), 'Admin UPI Display Name');
    }

    return res.json({
      success: true,
      message: 'UPI settings updated successfully',
      upiId: await getSystemConfig('admin_upi_id'),
      upiName: await getSystemConfig('admin_upi_name'),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalTournaments,
      activeTournaments,
      pendingDeposits,
      pendingWithdrawals,
      totalDepositedArr,
      totalWithdrawnArr,
    ] = await Promise.all([
      User.countDocuments(),
      Tournament.countDocuments(),
      Tournament.countDocuments({ status: 'ACTIVE' }),
      WalletTransaction.countDocuments({ type: 'DEPOSIT', status: 'PENDING' }),
      WalletTransaction.countDocuments({ type: 'WITHDRAWAL', status: 'PENDING' }),
      WalletTransaction.aggregate([
        { $match: { type: 'DEPOSIT', status: 'APPROVED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      WalletTransaction.aggregate([
        { $match: { type: 'WITHDRAWAL', status: 'APPROVED' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const upiId = (await getSystemConfig('admin_upi_id')) || config.defaultUpiId;
    const upiName = (await getSystemConfig('admin_upi_name')) || config.defaultUpiName;

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalTournaments,
        activeTournaments,
        pendingDeposits,
        pendingWithdrawals,
        totalDeposited: totalDepositedArr[0]?.total || 0,
        totalWithdrawn: totalWithdrawnArr[0]?.total || 0,
        upiId,
        upiName,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTournament = async (req, res) => {
  try {
    const { tournamentId } = req.params;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    const participants = await TournamentParticipant.find({ tournamentId });

    // Refund entry fees to participants if tournament was still ACTIVE
    if (tournament.status === 'ACTIVE' && tournament.entryFee > 0 && participants.length > 0) {
      for (const p of participants) {
        await User.findByIdAndUpdate(p.userId, {
          $inc: { walletBalance: tournament.entryFee, tournamentsPlayed: -1 },
        });

        await WalletTransaction.create({
          userId: p.userId,
          type: 'DEPOSIT',
          amount: tournament.entryFee,
          status: 'APPROVED',
          tournamentId: tournament._id,
          paymentDetails: {
            method: 'REFUND',
            notes: `Refund for deleted tournament: ${tournament.title}`,
          },
        });
      }
    }

    // Delete all participants and the tournament
    await TournamentParticipant.deleteMany({ tournamentId });
    await Tournament.findByIdAndDelete(tournamentId);

    return res.json({
      success: true,
      message: `Tournament "${tournament.title}" deleted successfully! ${
        participants.length > 0 && tournament.status === 'ACTIVE' && tournament.entryFee > 0
          ? `Refunded ${participants.length} participant(s).`
          : ''
      }`,
    });
  } catch (error) {
    console.error('[deleteTournament] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Broadcast message to all registered Telegram users with a Mini App button
 */
export const broadcastMessage = async (req, res) => {
  try {
    const { message, buttonText = '🎮 Play Firefly' } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Broadcast message content is required' });
    }

    // Find all users who have a valid telegramId
    const users = await User.find(
      { telegramId: { $exists: true, $ne: '' } },
      'telegramId username firstName'
    );

    if (!users || users.length === 0) {
      return res.json({
        success: true,
        message: 'No registered Telegram users found to broadcast to.',
        totalTargeted: 0,
        sentCount: 0,
        failedCount: 0,
      });
    }

    let sentCount = 0;
    let failedCount = 0;

    // Send in sequence with throttle to respect Telegram API rate limits (30 msgs/sec max)
    for (const u of users) {
      try {
        await sendTelegramMessage(u.telegramId, message.trim(), {
          buttonText: buttonText.trim() || '🎮 Play Firefly',
          includeWebAppButton: true,
        });
        sentCount++;
      } catch (err) {
        failedCount++;
      }

      // 35ms sleep between sends (~28 msg/sec)
      await new Promise((resolve) => setTimeout(resolve, 35));
    }

    return res.json({
      success: true,
      message: `Broadcast delivered: ${sentCount} sent, ${failedCount} failed out of ${users.length} users.`,
      totalTargeted: users.length,
      sentCount,
      failedCount,
    });
  } catch (error) {
    console.error('[broadcastMessage] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Required Chats CRUD for Admin
 */
export const getAdminRequiredChats = async (req, res) => {
  try {
    const chats = await RequiredChat.find().sort({ order: 1, createdAt: -1 });
    return res.json({ success: true, chats });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const createRequiredChat = async (req, res) => {
  try {
    const { title, type = 'channel', link, chatUsernameOrId = '', isActive = true, order = 0 } = req.body;

    if (!title || !title.trim() || !link || !link.trim()) {
      return res.status(400).json({ success: false, message: 'Title and Telegram link are required' });
    }

    const newChat = await RequiredChat.create({
      title: title.trim(),
      type,
      link: link.trim(),
      chatUsernameOrId: chatUsernameOrId.trim(),
      isActive: Boolean(isActive),
      order: Number(order) || 0,
    });

    return res.json({
      success: true,
      message: 'Required Telegram chat added successfully',
      chat: newChat,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateRequiredChat = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, link, chatUsernameOrId, isActive, order } = req.body;

    const chat = await RequiredChat.findById(id);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Required chat not found' });
    }

    if (title) chat.title = title.trim();
    if (type) chat.type = type;
    if (link) chat.link = link.trim();
    if (chatUsernameOrId !== undefined) chat.chatUsernameOrId = chatUsernameOrId.trim();
    if (isActive !== undefined) chat.isActive = Boolean(isActive);
    if (order !== undefined) chat.order = Number(order);

    await chat.save();

    return res.json({
      success: true,
      message: 'Required Telegram chat updated successfully',
      chat,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteRequiredChat = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await RequiredChat.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Required chat not found' });
    }

    return res.json({
      success: true,
      message: 'Required chat removed successfully',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
