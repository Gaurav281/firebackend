import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI,
  botToken: process.env.BOT_TOKEN,
  botUsername: process.env.BOT_USERNAME || 'FireflyPlayBot',
  miniAppUrl: process.env.MINI_APP_URL || 'https://cclient-chi.vercel.app/',
  jwtSecret: process.env.JWT_SECRET || 'car_tournament_default_jwt_secret',
  adminSecretKey: process.env.ADMIN_SECRET_KEY || 'admin_car_tournament_master_pass_2026',
  defaultUpiId: process.env.DEFAULT_UPI_ID || 'fireflypay@upi',
  defaultUpiName: process.env.DEFAULT_UPI_NAME || 'Firefly Car Tournament',
  isProduction: process.env.NODE_ENV === 'production',
};
