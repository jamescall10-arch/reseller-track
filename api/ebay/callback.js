import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://hrpzkakrvgigtxtcyjzk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const successHtml = (username) => `<!DOCTYPE html>
<html>
<head><title>eBay Connected — ResellerTrack</title></head>
<body style="background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;text-align:center;padding:20px">
  <div style="font-size:52px">✅</div>
  <h2 style="margin:0;font-size:22px">eBay account connected!</h2>
  ${username ? `<p style="color:#3fb950;margin:0;font-size:15px">Signed in as <strong>${username}</strong></p>` : ''}
  <p style="color:#8b949e;margin:0;font-size:13px">You can close this window and return to ResellerTrack.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'EBAY_CONNECTED', username: ${JSON.stringify(username)} }, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`;

const errorHtml = (msg) => `<!DOCTYPE html>
<html>
<head><title>eBay Connection Failed</title></head>
<body style="background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;text-align:center;padding:20px">
  <div style="font-size:52px">❌</div>
  <h2 style="margin:0;font-size:22px">Connection failed</h2>
  <p style="color:#8b949e;margin:0;font-size:13px">${msg || 'Something went wrong. Please try again from ResellerTrack.'}</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'EBAY_ERROR' }, '*');
      setTimeout(() => window.close(), 3000);
    }
  </script>
</body>
</html>`;

export default async function handler(req, res) {
  const { code, state: userId, error } = req.query;

  const sendHtml = (html) => {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  };

  if (error || !code || !userId) {
    return sendHtml(errorHtml(error === 'access_denied' ? 'You declined the eBay authorisation.' : null));
  }

  try {
    const clientId = process.env.EBAY_APP_ID;
    const certId   = process.env.EBAY_CERT_ID;
    const ruName   = process.env.EBAY_RUNAME;

    const credentials = Buffer.from(`${clientId}:${certId}`).toString('base64');

    // Exchange authorisation code for access + refresh tokens
    const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: ruName,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[ebay/callback] Token exchange failed:', err);
      return sendHtml(errorHtml('Token exchange with eBay failed. Please try again.'));
    }

    const tokens = await tokenRes.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Fetch eBay username from identity API
    let ebayUsername = null;
    let ebayUserId   = null;
    try {
      const identRes = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      });
      if (identRes.ok) {
        const identity = await identRes.json();
        ebayUsername = identity.username || null;
        ebayUserId   = identity.userId   || null;
      }
    } catch (e) {
      console.warn('[ebay/callback] Could not fetch eBay identity:', e);
    }

    // Store tokens in Supabase
    const { error: dbErr } = await supabase.from('ebay_tokens').upsert({
      user_id:       userId,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      ebay_user_id:  ebayUserId,
      ebay_username: ebayUsername,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (dbErr) {
      console.error('[ebay/callback] Supabase upsert failed:', dbErr);
      return sendHtml(errorHtml('Failed to save your eBay connection. Please try again.'));
    }

    console.log(`[ebay/callback] Connected eBay account for user ${userId}: ${ebayUsername}`);
    return sendHtml(successHtml(ebayUsername));

  } catch (e) {
    console.error('[ebay/callback] Unexpected error:', e);
    return sendHtml(errorHtml('An unexpected error occurred. Please try again.'));
  }
}
