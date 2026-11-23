import mongoose from 'mongoose';
import { config } from './config/env.js';
import { Tournament } from './models/Tournament.js';
import { User } from './models/User.js';

async function seed() {
  await mongoose.connect(config.mongoUri);
  console.log('[Seed] Connected to DB');

  // Check if tournaments already exist
  const count = await Tournament.countDocuments();
  if (count === 0) {
    console.log('[Seed] Creating demo tournaments...');
    await Tournament.create([
      {
        title: '⚡ Midnight Cyber Grand Prix #1',
        description: 'Dodge oncoming cybercars, collect glowing diamonds and compete for the top podium finish!',
        entryFee: 10,
        totalParticipantsAllowed: 25,
        winnerCount: 3,
        rewards: [100, 50, 20],
        turnsPerUser: 3,
        status: 'ACTIVE',
        startTime: new Date(),
        endTime: new Date(Date.now() + 48 * 3600 * 1000),
      },
      {
        title: '🏁 Rookie Free Rumble',
        description: 'Free entry tournament! Practice your reflexes and win real prizes.',
        entryFee: 0,
        totalParticipantsAllowed: 50,
        winnerCount: 3,
        rewards: [30, 20, 10],
        turnsPerUser: 2,
        status: 'ACTIVE',
        startTime: new Date(),
        endTime: new Date(Date.now() + 24 * 3600 * 1000),
      },
      {
        title: '🔥 High Roller Diamond Dash',
        description: 'High stakes sprint for master racers. Top racer takes all!',
        entryFee: 50,
        totalParticipantsAllowed: 15,
        winnerCount: 1,
        rewards: [500],
        turnsPerUser: 2,
        status: 'ACTIVE',
        startTime: new Date(),
        endTime: new Date(Date.now() + 72 * 3600 * 1000),
      },
    ]);
    console.log('[Seed] Tournaments created successfully!');
  } else {
    console.log(`[Seed] Found ${count} existing tournaments.`);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
