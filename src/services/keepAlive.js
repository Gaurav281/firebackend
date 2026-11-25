/**
 * Resilient Keep-Alive Service for Render Free Tier
 * Pings the server's public URL every 14 minutes to prevent Render from idling/sleeping.
 * Runs completely autonomously on the backend with zero dependency on frontend users.
 */
import { config } from '../config/env.js';

let keepAliveInterval = null;

export function initKeepAlive() {
  const backendUrl =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.BACKEND_URL ||
    'https://firebackend-4k60.onrender.com';

  const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (Render idle limit is 15 minutes)

  async function ping() {
    try {
      const targetUrl = `${backendUrl.replace(/\/+$/, '')}/health`;
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Firefly-KeepAlive-Worker/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        console.log(`[KeepAlive] 🟢 Self-ping successful: ${targetUrl} (Status: ${res.status})`);
      } else {
        console.warn(`[KeepAlive] ⚠️ Self-ping returned non-200: ${res.status}`);
      }
    } catch (err) {
      console.warn(`[KeepAlive] ⚠️ Self-ping network error:`, err.message);
      // Retry once after 30 seconds if ping failed
      setTimeout(async () => {
        try {
          const targetUrl = `${backendUrl.replace(/\/+$/, '')}/health`;
          await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
          console.log(`[KeepAlive] 🟢 Retry self-ping successful: ${targetUrl}`);
        } catch (retryErr) {
          console.warn(`[KeepAlive] ⚠️ Retry failed:`, retryErr.message);
        }
      }, 30000);
    }
  }

  // Initial ping after 1 minute of boot
  setTimeout(ping, 60000);

  // Recurring ping every 14 minutes
  keepAliveInterval = setInterval(ping, PING_INTERVAL_MS);
  console.log(`[KeepAlive] Service initialized (Target: ${backendUrl}/health, Interval: 14m)`);

  return {
    stop: () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
    },
  };
}
