import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      trim: true,
      default: '',
    },
    firstName: {
      type: String,
      trim: true,
      default: 'Player',
    },
    lastName: {
      type: String,
      trim: true,
      default: '',
    },
    photoUrl: {
      type: String,
      default: '',
    },
    walletBalance: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Wallet balance cannot be negative'],
    },
    totalEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },
    tournamentsPlayed: {
      type: Number,
      default: 0,
      min: 0,
    },
    tournamentsWon: {
      type: Number,
      default: 0,
      min: 0,
    },
    highestGameScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    savedUpiId: {
      type: String,
      trim: true,
      default: '',
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
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

userSchema.virtual('displayName').get(function () {
  if (this.username) return `@${this.username}`;
  if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
  return this.firstName || `Player #${this.telegramId.slice(-4)}`;
});

export const User = mongoose.model('User', userSchema);
