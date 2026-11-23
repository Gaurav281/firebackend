import { Router } from 'express';
import {
  getTournaments,
  getTournamentById,
  joinTournament,
} from '../controllers/tournamentController.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', optionalAuth, getTournaments);
router.get('/:tournamentId', optionalAuth, getTournamentById);
router.post('/:tournamentId/join', requireAuth, joinTournament);

export default router;
