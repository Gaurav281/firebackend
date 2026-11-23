import { Router } from 'express';
import {
  createTournament,
  declareTournamentResult,
  deleteTournament,
  getAdminTransactions,
  approveDeposit,
  rejectDeposit,
  approveWithdrawal,
  rejectWithdrawal,
  updateUpiConfig,
  getAdminStats,
} from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// All admin routes are protected by requireAdmin middleware
router.use(requireAdmin);

router.get('/stats', getAdminStats);
router.post('/tournaments', createTournament);
router.delete('/tournaments/:tournamentId', deleteTournament);
router.post('/tournaments/:tournamentId/declare', declareTournamentResult);
router.get('/transactions', getAdminTransactions);
router.post('/transactions/deposit/:transactionId/approve', approveDeposit);
router.post('/transactions/deposit/:transactionId/reject', rejectDeposit);
router.post('/transactions/withdraw/:transactionId/approve', approveWithdrawal);
router.post('/transactions/withdraw/:transactionId/reject', rejectWithdrawal);
router.post('/config/upi', updateUpiConfig);

export default router;
