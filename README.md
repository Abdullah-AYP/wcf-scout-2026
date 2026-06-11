# WCF Scout 2026

AI-powered differential finder and captaincy optimizer for FIFA World Cup Fantasy 2026.

## What It Does

- **Differential Scout** analyzes one player, checks under-5% scouting bonus eligibility, and produces a WCF scoring breakdown.
- **Captaincy Optimizer** ranks the top captain choices from your XI, recommends a vice-captain, and flags low-ownership punts.
- **Player Pool + XI Builder** lets users select players instead of typing every name/team/ownership field manually.
- The app uses the official WCF 2026 scoring rules inside the model prompt.

## API Choice

This MVP is wired for **GitHub Models** so you can use a GitHub Personal Access Token instead of paying for a separate model provider key.

Create a fine-grained PAT with Models access, then keep it server-side:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
GITHUB_MODELS_TOKEN=github_pat_your_token_here
GITHUB_MODELS_MODEL=openai/gpt-4.1
```

Do not paste this token into `index.html`, `app.js`, or any browser-side code.

## Player Data

The app loads players from:

```text
/api/players
```

That endpoint currently uses `data/sample-players.json` unless you set:

```text
WCF_DATA_BASE_URL=https://your-real-wcf-data-base-url/
```

The base URL should expose:

```text
players.json
squads.json
rounds.json
```

I checked FIFA's public Play Zone bundle and it does expose Fantasy Classic JSON file names, but the currently reachable `https://play.fifa.com/json/players.json` data looked stale rather than 2026 men's World Cup data. The adapter intentionally falls back to sample data instead of silently showing stale players. If you really want to inspect/use that stale public data during testing, set:

```text
WCF_ALLOW_STALE_DATA=true
```

## Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Deploy On Vercel

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Add these environment variables in Vercel:

```text
GITHUB_MODELS_TOKEN=your GitHub PAT
GITHUB_MODELS_MODEL=openai/gpt-4.1
```

4. Deploy.

The frontend calls `/api/analyze`, and the serverless function calls GitHub Models. Your PAT stays hidden from visitors.

## Notes

GitHub Models free API usage is rate-limited and subject to change. For a public production version, expect to add caching, stricter rate limits, and possibly a paid model provider later.
