import mongoose from 'mongoose';

const winnerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rank: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
    },
    score: {
      type: Number,
      required: true,
      default: 0,
    },
    prize: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const tournamentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Tournament title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: 'Compete in the 3-lane car runner, dodge traffic, collect diamonds and reach the top of the leaderboard!',
    },
    entryFee: {
      type: Number,
      required: true,
      min: [0, 'Entry fee cannot be negative'],
      default: 0,
    },
    totalParticipantsAllowed: {
      type: Number,
      required: [true, 'Total participants limit is required'],
      min: [2, 'At least 2 participants allowed'],
    },
    currentParticipantsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    winnerCount: {
      type: Number,
      required: true,
      enum: [1, 2, 3],
      default: 1,
    },
    rewards: {
      type: [Number],
      required: true,
      validate: {
        validator: function (val) {
          return Array.isArray(val) && val.length === this.winnerCount;
        },
        message: 'Rewards length must match winnerCount (1, 2 or 3)',
      },
    },
    turnsPerUser: {
      type: Number,
      required: true,
      min: [1, 'At least 1 turn per user is required'],
      default: 1,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'ENDED', 'DECLARED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    startTime: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
      index: true,
    },
    declaredAt: {
      type: Date,
      default: null,
    },
    winners: [winnerSchema],
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

tournamentSchema.virtual('totalPrizePool').get(function () {
  if (!Array.isArray(this.rewards)) return 0;
  return this.rewards.reduce((acc, curr) => acc + curr, 0);
});

tournamentSchema.virtual('isFull').get(function () {
  return this.currentParticipantsCount >= this.totalParticipantsAllowed;
});

tournamentSchema.virtual('hasEnded').get(function () {
  return new Date() >= new Date(this.endTime);
});

tournamentSchema.index({ status: 1, endTime: 1 });

export const Tournament = mongoose.model('Tournament', tournamentSchema);
