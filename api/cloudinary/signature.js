import crypto from 'crypto';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiSecret  = process.env.CLOUDINARY_API_SECRET;
  const apiKey     = process.env.CLOUDINARY_API_KEY;
  const cloudName  = process.env.CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    return res.status(500).json({ error: 'Cloudinary credentials not configured' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder    = 'reseller-track';

  // Sign: sort params alphabetically, join as key=value&... then append secret
  const paramString = `folder=${folder}&timestamp=${timestamp}`;

  const signature = crypto
    .createHash('sha1')
    .update(paramString + apiSecret)
    .digest('hex');

  return res.status(200).json({ timestamp, signature, apiKey, cloudName, folder });
}
