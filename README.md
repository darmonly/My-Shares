# My Shares

A public Next.js website for tracking shares, comparing multiple price graphs, and receiving browser window notices when prices cross your chosen minimum or maximum levels.

## Features

- Starts with `NVDA`, `SPCX`, `MSFT`, `TSLA`, and `AAPL`.
- Add and remove your own symbols from the browser.
- Compare multiple shares on one graph.
- Set minimum and maximum price alerts per share.
- Uses browser notifications only while the website is open.
- Uses free Stooq market data directly first, then public CORS proxy fallbacks if the browser blocks direct access.
- Optionally supports a free Alpha Vantage API key if public no-sign-in endpoints are unavailable.
- Exports to static HTML/CSS/JS so GitHub Pages can host it.

## Run locally

```bash
corepack enable
pnpm install
pnpm dev
```

Optional: if the no-sign-in Stooq/public CORS endpoints fail, sign up for a free Alpha Vantage key and run:

```bash
NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY=your_key_here pnpm dev
```

Open <http://localhost:3000> and click **Enable window notices** if you want price alerts.

## Host on GitHub Pages

This repo includes `.github/workflows/deploy.yml`, which uses pnpm, the latest Node.js release, a larger Node heap, and Next.js build caching to build the static Next.js app and publishes the `out` folder to GitHub Pages.

1. Push this repository to GitHub.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`, `master`, or `work`, or manually run the workflow named **Deploy Next.js site to GitHub Pages**.
5. Your website will be available at `https://<your-github-user>.github.io/<repo-name>/`.

The workflow sets `NEXT_PUBLIC_BASE_PATH` to the repository name, which makes the static app work under GitHub Pages project URLs such as `/My-Shares/`.
