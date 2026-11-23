const BASE_URL = 'http://localhost:5000/api';

async function testUpiFlow() {
  console.log('🧪 Testing Saved UPI ID and Auto-Withdrawal Flow...\n');

  const tgId = `user_${Date.now()}`;
  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegramId: tgId, username: 'upi_tester' }),
  }).then((r) => r.json());

  console.log('✅ Logged in:', loginRes.user.username);
  const token = loginRes.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Save UPI ID
  const testUpi = 'tester@okaxis';
  const saveUpiRes = await fetch(`${BASE_URL}/auth/upi`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ upiId: testUpi }),
  }).then((r) => r.json());

  console.log('✅ Save UPI Response:', saveUpiRes.message, '| Saved:', saveUpiRes.savedUpiId);
  if (saveUpiRes.savedUpiId !== testUpi) {
    throw new Error('Saved UPI does not match');
  }

  // 3. Verify getMe returns savedUpiId
  const meRes = await fetch(`${BASE_URL}/auth/me`, { headers: authHeaders }).then((r) => r.json());
  console.log('✅ getMe user.savedUpiId:', meRes.user.savedUpiId);
  if (meRes.user.savedUpiId !== testUpi) {
    throw new Error('getMe did not return savedUpiId');
  }

  // 4. Submit Withdrawal request without explicit upiId to test auto-use
  const withdrawRes = await fetch(`${BASE_URL}/wallet/withdraw`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ amount: 15 }),
  }).then((r) => r.json());

  console.log('✅ Withdrawal Auto-UPI Result:', withdrawRes.message, '| Target UPI:', withdrawRes.transaction?.paymentDetails?.upiId);
  if (withdrawRes.transaction?.paymentDetails?.upiId !== testUpi) {
    throw new Error('Withdrawal did not use saved UPI');
  }

  console.log('\n🎉 ALL UPDATED REQUIREMENTS TESTED AND PASSED!');
  process.exit(0);
}

testUpiFlow().catch((err) => {
  console.error('❌ Test error:', err);
  process.exit(1);
});
