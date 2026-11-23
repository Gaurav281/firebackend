import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';

export const requireAdmin = async (req, res, next) => {
  try {
    // Check 1: x-admin-key header
    const adminKey = req.headers['x-admin-key'];
    if (adminKey && adminKey === config.adminSecretKey) {
      req.isAdminKeyAuthenticated = true;
      return next();
    }

    // Check 2: Bearer token of an admin user
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.userId);
        if (user && user.isAdmin) {
          req.user = user;
          return next();
        }
      } catch (err) {
        // Fall through to 403
      }
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied: Admin authorization required',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
