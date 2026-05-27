export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customerId } = req.query;
  const fallback = 'https://app.lemonsqueezy.com/my-orders';

  if (!customerId) {
    return res.status(200).json({ url: fallback });
  }

  try {
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/customers/${customerId}`,
      {
        headers: {
          'Accept': 'application/vnd.api+json',
          'Authorization': `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(200).json({ url: fallback });
    }

    const data = await response.json();
    const portalUrl = data?.data?.attributes?.urls?.customer_portal || fallback;
    return res.status(200).json({ url: portalUrl });
  } catch (e) {
    console.error('Portal error:', e);
    return res.status(200).json({ url: fallback });
  }
}
