import { Tournament } from '../models/Tournament.js';
import { TournamentParticipant } from '../models/TournamentParticipant.js';
import { User } from '../models/User.js';

export const submitGameScore = async (req, res) => {
  try {
    const { tournamentId, score, diamondsCollected = 0, distance = 0 } = req.body;
    const userId = req.user._id;

    const numScore = Math.max(0, Math.floor(Number(score) || 0));
    const numDiamonds = Math.max(0, Math.floor(Number(diamondsCollected) || 0));
    const numDistance = Math.max(0, Math.floor(Number(distance) || 0));

    // Handle Tournament score submission
    if (tournamentId) {
      const tournament = await Tournament.findById(tournamentId);
      if (!tournament) {
        return res.status(404).json({ success: false, message: 'Tournament not found' });
      }

      if (tournament.status !== 'ACTIVE' || new Date() >= new Date(tournament.endTime)) {
        return res.status(400).json({
          success: false,
          message: 'Tournament is no longer active for accepting scores.',
        });
      }

      // Check participant and decrement turn atomically
      const participant = await TournamentParticipant.findOne({ tournamentId, userId });
      if (!participant) {
        return res.status(403).json({
          success: false,
          message: 'You have not joined this tournament yet. Please join first.',
        });
      }

      if (participant.turnsLeft <= 0) {
        return res.status(400).json({
          success: false,
          message: 'You have used all your attempts for this tournament.',
        });
      }

      // Atomically decrement turnsLeft and push score
      const newBestScore = Math.max(participant.bestScore, numScore);

      const updatedParticipant = await TournamentParticipant.findOneAndUpdate(
        { tournamentId, userId, turnsLeft: { $gt: 0 } },
        {
          $inc: { turnsLeft: -1 },
          $set: { bestScore: newBestScore },
          $push: {
            scores: {
              score: numScore,
              diamondsCollected: numDiamonds,
              distance: numDistance,
              playedAt: new Date(),
            },
          },
        },
        { new: true }
      );

      if (!updatedParticipant) {
        return res.status(400).json({
          success: false,
          message: 'Could not record score. No turns remaining.',
        });
      }

      // Update user highest personal score
      await User.findByIdAndUpdate(userId, {
        $max: { highestGameScore: numScore },
      });

      // Calculate current rank
      const rank =
        (await TournamentParticipant.countDocuments({
          tournamentId,
          bestScore: { $gt: newBestScore },
        })) + 1;

      return res.json({
        success: true,
        message: 'Turn recorded successfully!',
        score: numScore,
        bestScore: updatedParticipant.bestScore,
        turnsLeft: updatedParticipant.turnsLeft,
        totalTurns: updatedParticipant.totalTurns,
        rank,
      });
    }

    // Free play mode: Just record user's personal high score
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $max: { highestGameScore: numScore },
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: 'Practice game completed!',
      score: numScore,
      highestGameScore: updatedUser.highestGameScore,
    });
  } catch (error) {
    console.error('[submitGameScore] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
