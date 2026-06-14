import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// The exact public URL of this endpoint — must match what you entered in eBay dashboard
const ENDPOINT_URL = 'https://reseller-track.vercel.app/api/ebay/account-deletion';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

  // ── GET — eBay sends a challenge_code to verify we own this endpoint ──────
  if (req.method === 'GET') {
    const challengeCode = req.query.challenge_code;

    if (!challengeCode) {
      return res.status(400).json({ error: 'Missing challenge_code' });
    }

    const token = process.env.EBAY_VERIFICATION_TOKEN;
    if (!token) {
      console.error('[account-deletion] EBAY_VERIFICATION_TOKEN not set');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }

    // eBay requires: SHA256(challengeCode + verificationToken + endpointUrl)
    const hash = crypto
      .createHash('sha256')
      .update(challengeCode + token + ENDPOINT_URL)
      .digest('hex');

    console.log(`[account-deletion] Verification challenge responded`);
    return res.status(200).json({ challengeResponse: hash });
  }

  // ── POST — eBay notifies us that a user has closed their eBay account ─────
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      const data = payload?.notification?.data;
      const ebayUserId   = data?.userId;
      const ebayUsername = data?.username;

      console.log(`[account-deletion] Received deletion for eBay user: ${ebayUsername} (${ebayUserId})`);

      // Delete their eBay OAuth tokens from Supabase (when eBay login is built)
      if (ebayUserId) {
        const { error } = await supabase
          .from('ebay_tokens')
          .delete()
          .eq('ebay_user_id', String(ebayUserId));

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = row not found, which is fine
          console.error('[account-deletion] Supabase delete error:', error);
        }
      }

      // eBay expects a 200 response — anything else triggers a retry
      return res.status(200).json({ success: true });

    } catch (e) {
      console.error('[account-deletion] Error processing notification:', e);
      // Still return 200 to prevent eBay retrying indefinitely
      return res.status(200).json({ received: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
