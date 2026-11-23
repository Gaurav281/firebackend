import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['DEPOSIT', 'WITHDRAWAL', 'TOURNAMENT_ENTRY', 'TOURNAMENT_WINNING', 'REFUND'],
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, 'Amount must be greater than 0'],
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUCCESS', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    balanceAfter: {
      type: Number,
      default: null,
    },
    paymentDetails: {
      upiId: {
        type: String,
        trim: true,
        default: '',
      },
      transactionId: {
        type: String,
        trim: true,
        default: null,
        // Will index sparsely in pre-save or index definition
      },
      amountPaid: {
        type: Number,
      },
      adminRemarks: {
        type: String,
        default: '',
      },
      processedAt: {
        type: Date,
      },
    },
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      default: null,
      index: true,
    },
    description: {
      type: String,
      default: '',
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

// Compound index for user transactions sorted by recency
walletTransactionSchema.index({ userId: 1, createdAt: -1 });

// Unique sparse index for deposit transaction IDs to prevent duplicate claim attempts
walletTransactionSchema.index(
  { 'paymentDetails.transactionId': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { 'paymentDetails.transactionId': { $type: 'string', $ne: '' } },
  }
);

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
