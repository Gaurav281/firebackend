import { Router } from 'express';
import {
  getWalletData,
  getUpiPaymentConfig,
  submitDepositRequest,
  submitWithdrawRequest,
} from '../controllers/walletController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getWalletData);
router.get('/upi-config', requireAuth, getUpiPaymentConfig);
router.post('/deposit', requireAuth, submitDepositRequest);
router.post('/withdraw', requireAuth, submitWithdrawRequest);

export default router;
