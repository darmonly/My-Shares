# My Shares

A public NextJS website for tracking shares, comparing multiple price graphs, and receiving browser window notices when prices cross your chosen minimum or maximum levels.

## Features

- Starts with `NVDA`, `SPCX`, `MSFT`, `TSLA`, and `AAPL`.
- Add and remove your own symbols from the browser.
- Compare multiple shares on one graph.
- Set minimum and maximum price alerts per share.
- Uses browser notifications only while the website is open.
- Uses free Stooq market data directly from the browser, so no API key or backend server is required.
- Exports to static HTML/CSS/JS so GitHub Pages can host it.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and click **Enable window notices** if you want price alerts.

## Host on GitHub Pages

This repo includes `.github/workflows/deploy.yml`, which builds the static NextJS app and publishes the `out` folder to GitHub Pages.

1. Push this repository to GitHub.
2. In GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to `main`, `master`, or `work`, or manually run the workflow named **Deploy NextJS site to GitHub Pages**.
5. Your website will be available at `https://<your-github-user>.github.io/<repo-name>/`.

The workflow sets `NEXT_PUBLIC_BASE_PATH` to the repository name, which makes the static app work under GitHub Pages project URLs such as `/My-Shares/`.
