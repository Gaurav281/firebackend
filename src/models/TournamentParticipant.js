import mongoose from 'mongoose';

const tournamentParticipantSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    turnsLeft: {
      type: Number,
      required: true,
      min: 0,
    },
    totalTurns: {
      type: Number,
      required: true,
      min: 1,
    },
    bestScore: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    bestDiamonds: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    scores: [
      {
        score: { type: Number, required: true },
        diamondsCollected: { type: Number, default: 0 },
        distance: { type: Number, default: 0 },
        playedAt: { type: Date, default: Date.now },
      },
    ],
    rank: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Prevent duplicate participation by the same user in the same tournament
tournamentParticipantSchema.index({ tournamentId: 1, userId: 1 }, { unique: true });

// For fast leaderboard sorting: tournament + bestDiamonds descending + bestScore descending + updatedAt
tournamentParticipantSchema.index({ tournamentId: 1, bestDiamonds: -1, bestScore: -1, updatedAt: 1 });
tournamentParticipantSchema.index({ tournamentId: 1, bestScore: -1, updatedAt: 1 });

export const TournamentParticipant = mongoose.model(
  'TournamentParticipant',
  tournamentParticipantSchema
);
