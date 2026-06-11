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

That endpoint defaults to FIFA's public Fantasy feed:

```text
https://play.fifa.com/json/fantasy/
```

It expects the base URL to expose:

```text
players.json
squads.json
rounds.json
```

The adapter normalizes the live FIFA data into the app's player selector, including player names, positions, teams, prices, ownership, status, and readable next fixtures. If FIFA blocks or changes that feed, `/api/players` falls back to `data/sample-players.json` instead of showing a broken app.

To override the feed during testing:

```text
WCF_DATA_BASE_URL=https://your-real-wcf-data-base-url/
```

To force the local 13-player sample file:

```text
WCF_USE_SAMPLE_DATA=true
```

If you really want to inspect/use stale public data during testing, set:

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
