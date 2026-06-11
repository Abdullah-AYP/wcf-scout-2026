# WCF Scout 2026

WCF Scout 2026 is a free-to-run fantasy football scouting web app for FIFA World Cup Fantasy 2026.

Live site: https://wcfscout.app

The app helps users search the World Cup Fantasy player pool, find low-owned differentials, build a legal fantasy squad, and get AI-assisted captaincy recommendations.

## Features

- Differential Scout for one-player scouting reports.
- Squad Builder with FIFA fantasy squad rules.
- Captaincy Optimizer for ranking captain and vice-captain options.
- Neon pitchside UI with player-shirt cards and a tactical pitch view.
- Official FIFA fantasy player feed integration.
- 48-country filters for easier player discovery.
- Full country player pools sorted by selected percentage from lowest owned to highest owned.
- Accent-insensitive search, so users can type plain letters and still find accented FIFA names.
- Football-name aliases for common names that FIFA stores as full legal names, for example `vitinha` finds `Vitor Machado Ferreira`.
- Light and dark mode.

## How It Works

The frontend is plain HTML, CSS, and JavaScript. The backend is a small Node server locally and Vercel serverless functions in production.

The browser calls:

```text
/api/players
/api/analyze
```

`/api/players` loads and normalizes FIFA fantasy data. `/api/analyze` sends the selected player or squad context to GitHub Models and returns a structured scouting report.

## Player Data

By default, the app reads FIFA fantasy data from:

```text
https://play.fifa.com/json/fantasy/
```

The feed is expected to expose:

```text
players.json
squads.json
rounds.json
```

The data adapter normalizes:

- player names
- aliases
- positions
- countries
- prices
- selected percentage
- player status
- next fixtures
- squad rules
- budget rules
- country limits

If the live FIFA feed fails or changes shape, the app falls back to `data/sample-players.json` so the UI does not completely break.

## AI Provider

This project uses GitHub Models, so you can use a GitHub Personal Access Token instead of paying for a separate API key.

The token must stay server-side. Never paste it into `index.html`, `app.js`, or any browser-side code.

Required environment variable:

```text
GITHUB_MODELS_TOKEN=github_pat_your_token_here
```

Optional model override:

```text
GITHUB_MODELS_MODEL=openai/gpt-4.1
```

The app includes fallback handling if the configured model is unavailable.

## Local Setup

Clone the repo, then create your local environment file:

```bash
cp .env.example .env
```

Edit `.env`:

```text
GITHUB_MODELS_TOKEN=github_pat_your_token_here
GITHUB_MODELS_MODEL=openai/gpt-4.1
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Run syntax checks:

```bash
npm run check
```

## Optional Data Settings

Override the FIFA fantasy feed:

```text
WCF_DATA_BASE_URL=https://your-data-base-url/
```

Force local sample data:

```text
WCF_USE_SAMPLE_DATA=true
```

Allow stale public data during testing:

```text
WCF_ALLOW_STALE_DATA=true
```

## Deploying On Vercel

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add the environment variables in Vercel:

```text
GITHUB_MODELS_TOKEN=your GitHub PAT
GITHUB_MODELS_MODEL=openai/gpt-4.1
```

4. Deploy.
5. Add your custom domain in Vercel.
6. Point your domain DNS to Vercel.

The frontend calls the app's own `/api/analyze` endpoint. The API function calls GitHub Models, so visitors never see your GitHub token.

## Project Structure

```text
.
|-- index.html
|-- styles.css
|-- app.js
|-- server.js
|-- api/
|   |-- analyze.js
|   `-- players.js
|-- lib/
|   |-- github-models.js
|   `-- player-data.js
|-- data/
|   `-- sample-players.json
|-- .env.example
|-- package.json
`-- README.md
```

## Notes

GitHub Models free usage is rate-limited and can change over time. For heavier public traffic, add stronger rate limiting, caching, and possibly a paid model provider.

Made by Abdullah Yousuf for the love of the game.
