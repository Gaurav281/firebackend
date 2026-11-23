import { Router } from 'express';
import { telegramLogin, devLogin, getMe, updateSavedUpi } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/telegram', telegramLogin);
router.post('/dev-login', devLogin);
router.get('/me', requireAuth, getMe);
router.put('/upi', requireAuth, updateSavedUpi);

export default router;
