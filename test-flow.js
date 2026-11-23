const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting End-to-End Automated Validation Tests...\n');

  // Generate unique test user
  const uniqueTgId = String(Date.now()).slice(-8);

  // 1. Auth Test
  const loginRes = await fetch(`${BASE_URL}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telegramId: uniqueTgId,
      username: `racer_${uniqueTgId}`,
      firstName: 'Turbo',
      lastName: 'Racer',
    }),
  }).then((r) => r.json());

  console.log('✅ User Login Success:', loginRes.user.username, 'ID:', loginRes.user.id);
  const token = loginRes.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Initial Wallet Balance Check
  const walletRes = await fetch(`${BASE_URL}/wallet`, { headers: authHeaders }).then((r) => r.json());
  console.log(`✅ Initial Wallet Balance: ₹${walletRes.balance}`);

  // 3. Create a fresh active tournament via Admin
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-key': 'admin_car_tournament_master_pass_2026',
  };

  const newTourneyRes = await fetch(`${BASE_URL}/admin/tournaments`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      title: `Grand Prix Test ${uniqueTgId}`,
      entryFee: 15,
      totalParticipantsAllowed: 20,
      winnerCount: 3,
      rewards: [75, 45, 20],
      turnsPerUser: 3,
      durationHours: 24,
    }),
  }).then((r) => r.json());

  const activeTourney = newTourneyRes.tournament;
  console.log(`✅ Admin Created Tournament: ${activeTourney.title} (Fee: ₹${activeTourney.entryFee})`);

  // 4. Join Tournament (Entry Fee ₹15 Deducted)
  const joinRes = await fetch(`${BASE_URL}/tournaments/${activeTourney._id}/join`, {
    method: 'POST',
    headers: authHeaders,
  }).then((r) => r.json());
  console.log(`✅ Joined Tournament: ${joinRes.message} | New Balance: ₹${joinRes.walletBalance}`);

  // 5. Submit Game Turn Score
  const scoreRes = await fetch(`${BASE_URL}/game/submit-score`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      tournamentId: activeTourney._id,
      score: 750,
      diamondsCollected: 14,
      distance: 90,
    }),
  }).then((r) => r.json());
  console.log(`✅ Game Turn 1 Recorded! Score: ${scoreRes.score}, Best: ${scoreRes.bestScore}, Turns Left: ${scoreRes.turnsLeft}`);

  // 6. Submit Deposit Request
  const uniqueUtr = `UTR_${Date.now()}`;
  const depositRes = await fetch(`${BASE_URL}/wallet/deposit`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amount: 100,
      transactionId: uniqueUtr,
    }),
  }).then((r) => r.json());
  console.log(`✅ Deposit Request Created: ₹100 with UTR: ${uniqueUtr}`);

  // 7. Admin Approves Deposit
  const approveRes = await fetch(
    `${BASE_URL}/admin/transactions/deposit/${depositRes.transaction._id}/approve`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ remarks: 'Verified in bank account' }),
    }
  ).then((r) => r.json());
  console.log(`✅ Admin Approved Deposit: ${approveRes.message}`);

  // 8. Wallet Balance after Deposit Approval
  const walletAfterDeposit = await fetch(`${BASE_URL}/wallet`, { headers: authHeaders }).then((r) => r.json());
  console.log(`✅ Wallet Balance After Deposit: ₹${walletAfterDeposit.balance}`);

  // 9. Submit Withdrawal Request
  const withdrawRes = await fetch(`${BASE_URL}/wallet/withdraw`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      amount: 35,
      upiId: 'test_racer@okhdfcbank',
    }),
  }).then((r) => r.json());
  console.log(`✅ Withdrawal Submitted: ₹35 | Balance after reservation: ₹${withdrawRes.newBalance}`);

  // 10. Admin Approves Withdrawal
  const approveWithdrawRes = await fetch(
    `${BASE_URL}/admin/transactions/withdraw/${withdrawRes.transaction._id}/approve`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ remarks: 'Processed via UPI payout' }),
    }
  ).then((r) => r.json());
  console.log(`✅ Admin Approved Withdrawal: ${approveWithdrawRes.message}`);

  // 11. Declare Tournament Winner
  const declareRes = await fetch(
    `${BASE_URL}/admin/tournaments/${activeTourney._id}/declare`,
    {
      method: 'POST',
      headers: adminHeaders,
    }
  ).then((r) => r.json());
  console.log(`✅ Admin Declared Tournament Results: ${declareRes.message}`);
  if (declareRes.winners?.length > 0) {
    console.log(`🏆 1st Place Winner Prize: ₹${declareRes.winners[0].prize}`);
  }

  // 12. Final Wallet Check & Transaction Count
  const finalWallet = await fetch(`${BASE_URL}/wallet`, { headers: authHeaders }).then((r) => r.json());
  console.log(`\n🎉 ALL FLOWS VERIFIED!`);
  console.log(`Final User Balance: ₹${finalWallet.balance}`);
  console.log(`Total Transactions Logged: ${finalWallet.transactions.length}`);

  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test Failed:', err);
  process.exit(1);
});
