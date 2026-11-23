import { Tournament } from '../models/Tournament.js';
import { TournamentParticipant } from '../models/TournamentParticipant.js';
import { User } from '../models/User.js';
import { WalletTransaction } from '../models/WalletTransaction.js';

export const getTournaments = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;

    const tournaments = await Tournament.find()
      .sort({ createdAt: -1 })
      .lean();

    // If user is authenticated, attach user's participation status
    let userParticipations = [];
    if (userId) {
      userParticipations = await TournamentParticipant.find({ userId }).lean();
    }

    const participationMap = new Map();
    userParticipations.forEach((p) => {
      participationMap.set(String(p.tournamentId), p);
    });

    const now = new Date();

    const formattedTournaments = tournaments.map((t) => {
      const userPart = participationMap.get(String(t._id));
      const isEnded = now >= new Date(t.endTime) || t.status === 'ENDED' || t.status === 'DECLARED';

      return {
        ...t,
        isFull: t.currentParticipantsCount >= t.totalParticipantsAllowed,
        hasEnded: isEnded,
        userParticipation: userPart
          ? {
              isJoined: true,
              turnsLeft: userPart.turnsLeft,
              totalTurns: userPart.totalTurns,
              bestScore: userPart.bestScore,
              bestDiamonds: userPart.bestDiamonds || 0,
              rank: userPart.rank,
            }
          : {
              isJoined: false,
              turnsLeft: 0,
              totalTurns: t.turnsPerUser,
              bestScore: 0,
              bestDiamonds: 0,
            },
      };
    });

    return res.json({
      success: true,
      tournaments: formattedTournaments,
    });
  } catch (error) {
    console.error('[getTournaments] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getTournamentById = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const userId = req.user ? req.user._id : null;

    const tournament = await Tournament.findById(tournamentId).lean();
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    // Fetch leaderboard (ranked by diamonds collected first, then score)
    const participants = await TournamentParticipant.find({ tournamentId })
      .sort({ bestDiamonds: -1, bestScore: -1, updatedAt: 1 })
      .populate('userId', 'username firstName lastName photoUrl')
      .lean();

    const leaderboard = participants.map((p, index) => ({
      rank: index + 1,
      userId: p.userId?._id,
      name: p.userId?.username
        ? `@${p.userId.username}`
        : `${p.userId?.firstName || 'Player'} ${p.userId?.lastName || ''}`.trim(),
      photoUrl: p.userId?.photoUrl || '',
      bestScore: p.bestScore,
      bestDiamonds: p.bestDiamonds || 0,
      turnsUsed: p.totalTurns - p.turnsLeft,
      totalTurns: p.totalTurns,
      joinedAt: p.joinedAt,
      isCurrentUser: userId ? String(p.userId?._id) === String(userId) : false,
    }));

    let userParticipation = null;
    if (userId) {
      const part = participants.find((p) => String(p.userId?._id) === String(userId));
      if (part) {
        userParticipation = {
          isJoined: true,
          turnsLeft: part.turnsLeft,
          totalTurns: part.totalTurns,
          bestScore: part.bestScore,
          bestDiamonds: part.bestDiamonds || 0,
          rank: leaderboard.find((l) => String(l.userId) === String(userId))?.rank || null,
        };
      }
    }

    return res.json({
      success: true,
      tournament: {
        ...tournament,
        isFull: tournament.currentParticipantsCount >= tournament.totalParticipantsAllowed,
        hasEnded: new Date() >= new Date(tournament.endTime),
        userParticipation: userParticipation || {
          isJoined: false,
          turnsLeft: 0,
          totalTurns: tournament.turnsPerUser,
          bestScore: 0,
        },
      },
      leaderboard,
    });
  } catch (error) {
    console.error('[getTournamentById] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const joinTournament = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const userId = req.user._id;

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    if (tournament.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: `Tournament is no longer active (Status: ${tournament.status})`,
      });
    }

    if (new Date() >= new Date(tournament.endTime)) {
      return res.status(400).json({ success: false, message: 'This tournament has already ended.' });
    }

    if (tournament.currentParticipantsCount >= tournament.totalParticipantsAllowed) {
      return res.status(400).json({ success: false, message: 'Tournament is full.' });
    }

    // Check if user already joined
    const alreadyJoined = await TournamentParticipant.findOne({ tournamentId, userId });
    if (alreadyJoined) {
      return res.status(400).json({ success: false, message: 'You have already joined this tournament.' });
    }

    // Atomic deduction of entry fee if fee > 0
    let updatedUser = null;
    if (tournament.entryFee > 0) {
      updatedUser = await User.findOneAndUpdate(
        {
          _id: userId,
          walletBalance: { $gte: tournament.entryFee },
        },
        {
          $inc: { walletBalance: -tournament.entryFee, tournamentsPlayed: 1 },
        },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Entry fee is ₹${tournament.entryFee}. Please add funds to your wallet.`,
        });
      }

      // Log wallet transaction
      await WalletTransaction.create({
        userId,
        type: 'TOURNAMENT_ENTRY',
        amount: tournament.entryFee,
        status: 'SUCCESS',
        balanceAfter: updatedUser.walletBalance,
        tournamentId: tournament._id,
        description: `Entry fee for tournament: "${tournament.title}"`,
      });
    } else {
      // Free tournament
      updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { tournamentsPlayed: 1 } },
        { new: true }
      );
    }

    // Increment participant count with safety check
    const updatedTournament = await Tournament.findOneAndUpdate(
      {
        _id: tournamentId,
        currentParticipantsCount: { $lt: tournament.totalParticipantsAllowed },
      },
      {
        $inc: { currentParticipantsCount: 1 },
      },
      { new: true }
    );

    if (!updatedTournament) {
      // Race condition: tournament filled up between checks, refund entry fee
      if (tournament.entryFee > 0) {
        await User.findByIdAndUpdate(userId, {
          $inc: { walletBalance: tournament.entryFee, tournamentsPlayed: -1 },
        });
        await WalletTransaction.create({
          userId,
          type: 'REFUND',
          amount: tournament.entryFee,
          status: 'SUCCESS',
          tournamentId: tournament._id,
          description: `Refund: Tournament filled up during entry`,
        });
      }
      return res.status(400).json({ success: false, message: 'Tournament reached full capacity.' });
    }

    // Create participant entry
    const participant = await TournamentParticipant.create({
      tournamentId,
      userId,
      turnsLeft: tournament.turnsPerUser,
      totalTurns: tournament.turnsPerUser,
      bestScore: 0,
    });

    return res.status(200).json({
      success: true,
      message: 'Successfully joined tournament! Good luck racer!',
      walletBalance: updatedUser.walletBalance,
      participant: {
        isJoined: true,
        turnsLeft: participant.turnsLeft,
        totalTurns: participant.totalTurns,
        bestScore: participant.bestScore,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'You have already joined this tournament.' });
    }
    console.error('[joinTournament] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
