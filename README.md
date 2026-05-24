# ResellerTrack

Track your stock, active listings, sales and profit. Built for eBay resellers of anything.

---

## Deploying to Vercel (free, ~15 minutes)

Follow these steps exactly and your app will be live on the internet at no cost.

---

### Step 1 — Create a GitHub account

Go to **github.com** and sign up for a free account if you don't have one.

---

### Step 2 — Create a new repository

1. Once logged in, click the **+** icon in the top right corner
2. Click **New repository**
3. Name it `reseller-track` (no spaces)
4. Make sure it's set to **Public**
5. Click **Create repository**

---

### Step 3 — Upload the project files

On your new repository page you'll see an option to upload files.

1. Click **uploading an existing file**
2. Drag the entire `reseller-track` folder contents into the window (all the files and the `src` folder)
3. At the bottom, click **Commit changes**

Your files are now on GitHub.

---

### Step 4 — Create a Vercel account

Go to **vercel.com** and click **Sign Up**.

Choose **Continue with GitHub** — this links your Vercel account to GitHub automatically. No extra setup needed.

---

### Step 5 — Deploy from Vercel

1. On your Vercel dashboard, click **Add New Project**
2. You'll see your GitHub repositories listed — click **Import** next to `reseller-track`
3. Vercel will detect it's a Vite project automatically
4. Leave all settings as default
5. Click **Deploy**

Vercel will build and deploy your app. This takes about 60 seconds.

When it's done you'll see a URL like:

```
https://reseller-track-yourname.vercel.app
```

That URL is your live app. Anyone can visit it. Bookmark it.

---

### Step 6 — Every future update is automatic

Whenever you want to update the app:
1. Edit the files locally
2. Upload the changed files to GitHub (same process as Step 3)
3. Vercel detects the change and redeploys automatically within about 30 seconds

You never need to touch Vercel again after the initial setup.

---

## Running locally (for development)

If you want to run the app on your own computer before deploying:

1. Install Node.js from **nodejs.org** (free, one-time)
2. Open a terminal in the `reseller-track` folder
3. Run:

```bash
npm install
npm run dev
```

4. Open your browser at `http://localhost:5173`

---

## Project structure

```
reseller-track/
├── index.html          # Entry HTML page
├── package.json        # Project dependencies
├── vite.config.js      # Build configuration
├── vercel.json         # Vercel routing config
├── .gitignore          # Files excluded from git
└── src/
    ├── main.jsx        # React entry point
    ├── App.jsx         # Main application
    └── index.css       # Global styles
```

---

## Data storage

All user data is saved in the browser's `localStorage`. This means:

- Each user's data stays on their own device
- No database or server is needed
- Data persists between sessions automatically
- If a user clears their browser data, their app data is lost (make this clear to customers)

---

## Next steps

Once the app is live and you've got your first customers:

1. **Add authentication** — Use Clerk (clerk.com, free tier) so only paying customers can access the app
2. **Add payments** — Use Lemon Squeezy (lemonsqueezy.com, no monthly fee) to take payment and send customers their login link
3. **Custom domain** — Point a domain (e.g. resellertrack.co.uk, ~£10/year) at your Vercel deployment in the Vercel dashboard under Settings > Domains

---

## Support

Built with React + Vite. Hosted on Vercel.
