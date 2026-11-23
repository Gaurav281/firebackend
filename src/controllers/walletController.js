import { User } from '../models/User.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { getSystemConfig } from '../models/SystemConfig.js';
import { config } from '../config/env.js';

export const getWalletData = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('walletBalance totalEarnings');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const transactions = await WalletTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('tournamentId', 'title');

    return res.json({
      success: true,
      balance: user.walletBalance,
      totalEarnings: user.totalEarnings,
      transactions,
    });
  } catch (error) {
    console.error('[getWalletData] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getUpiPaymentConfig = async (req, res) => {
  try {
    const upiId = (await getSystemConfig('admin_upi_id')) || config.defaultUpiId;
    const upiName = (await getSystemConfig('admin_upi_name')) || config.defaultUpiName;

    return res.json({
      success: true,
      upiId,
      upiName,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitDepositRequest = async (req, res) => {
  try {
    const { amount, transactionId } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deposit amount. Must be greater than 0.',
      });
    }

    const cleanTxnId = (transactionId || '').trim();
    if (!cleanTxnId || cleanTxnId.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid UPI Transaction / Reference ID (UTR).',
      });
    }

    // Check if this transaction ID was already submitted (prevent duplicate claims)
    const existingTxn = await WalletTransaction.findOne({
      'paymentDetails.transactionId': cleanTxnId,
    });

    if (existingTxn) {
      return res.status(409).json({
        success: false,
        message: 'This Transaction ID / UTR has already been submitted. Please check your history or contact support.',
      });
    }

    const upiId = (await getSystemConfig('admin_upi_id')) || config.defaultUpiId;

    // Create deposit transaction record
    const newTxn = await WalletTransaction.create({
      userId: req.user._id,
      type: 'DEPOSIT',
      amount: numAmount,
      status: 'PENDING',
      paymentDetails: {
        upiId,
        transactionId: cleanTxnId,
        amountPaid: numAmount,
      },
      description: `Deposit request of ₹${numAmount} via UPI`,
    });

    return res.status(201).json({
      success: true,
      message: 'Deposit request submitted successfully! Funds will be credited after admin verification.',
      transaction: newTxn,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate Transaction ID detected. This reference has already been logged.',
      });
    }
    console.error('[submitDepositRequest] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const submitWithdrawRequest = async (req, res) => {
  try {
    const { amount, upiId } = req.body;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹10.',
      });
    }

    const cleanUpi = (upiId || req.user.savedUpiId || '').trim();
    if (!cleanUpi || !cleanUpi.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid UPI ID (e.g. yourname@okaxis).',
      });
    }

    // Auto-save UPI if user doesn't have one saved
    if (!req.user.savedUpiId) {
      await User.findByIdAndUpdate(req.user._id, { savedUpiId: cleanUpi });
    }

    // Atomic balance reservation: only deduct if user has enough balance
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        walletBalance: { $gte: numAmount },
      },
      {
        $inc: { walletBalance: -numAmount },
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for this withdrawal request.',
      });
    }

    // Create pending withdrawal transaction
    const withdrawalTxn = await WalletTransaction.create({
      userId: req.user._id,
      type: 'WITHDRAWAL',
      amount: numAmount,
      status: 'PENDING',
      balanceAfter: updatedUser.walletBalance,
      paymentDetails: {
        upiId: cleanUpi,
      },
      description: `Withdrawal request of ₹${numAmount} to ${cleanUpi}`,
    });

    return res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted! It will be transferred to your UPI ID once approved.',
      newBalance: updatedUser.walletBalance,
      transaction: withdrawalTxn,
    });
  } catch (error) {
    console.error('[submitWithdrawRequest] Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
