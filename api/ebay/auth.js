export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const clientId = process.env.EBAY_APP_ID;
  const ruName   = process.env.EBAY_RUNAME;

  if (!clientId || !ruName) {
    return res.status(500).json({ error: 'eBay credentials not configured' });
  }

  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
  ].join(' ');

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  ruName,
    scope:         scopes,
    state:         userId,
  });

  const authUrl = `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;
  return res.status(200).json({ url: authUrl });
}
