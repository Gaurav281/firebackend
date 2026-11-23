import { Router } from 'express';
import { submitGameScore } from '../controllers/gameController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/submit-score', requireAuth, submitGameScore);

export default router;
