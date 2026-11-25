import { Router } from 'express';
import { getRequiredChats, verifyChatJoins } from '../controllers/systemController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/required-chats', optionalAuth, getRequiredChats);
router.post('/verify-joins', requireAuth, verifyChatJoins);

export default router;
