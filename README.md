# WCF Scout 2026

WCF Scout 2026 is an unofficial fantasy football scouting app for FIFA World Cup Fantasy 2026.

Live app: https://wcfscout.app

It helps fantasy managers search the player pool, find low-owned differentials, build a legal 15-player squad, and compare captaincy options with AI-assisted scouting reports.

## Highlights

- Search FIFA fantasy players by name, known football name, position, or country.
- Browse all World Cup countries and filter each country pool.
- Sort player pools from lowest selected percentage to highest selected percentage.
- Spot under-5% differential punts.
- Build a legal 15-player fantasy squad with budget, country-limit, and position checks.
- Set starters, captain, and vice-captain on a pitch-style layout.
- Compare captaincy options using player role, fixture, ownership, price, and fantasy scoring context.
- Use light mode or dark mode.
- See friendly display names while keeping official FIFA names searchable.

## Differential Scout

The Differential Scout is for checking one player quickly.

Pick a player from the FIFA fantasy pool, review their price, ownership, country, position, fixture, and notes, then generate a scoring-aware report. The report focuses on upside, risk, scouting-bonus eligibility, and whether the player is worth considering as a low-owned pick.

## Squad Builder + Captaincy Optimizer

The squad builder helps you create a legal World Cup Fantasy squad before running captaincy analysis.

It tracks:

- Squad size
- Budget
- Position limits
- Country limits
- Starters and bench
- Captain and vice-captain
- Valid formations

The pitch view makes it easier to see the XI before comparing captaincy options.

## Player Search

Some FIFA feed records use full legal names, so the app supports more familiar football names and aliases.

Examples:

```text
vitinha
bruno fernandes
joao cancelo
nuno mendes
ederson
```

Search also handles accents, so users can type plain letters and still find players with accented names.

## Data And AI

Player names, countries, positions, prices, selected percentages, fixtures, and fantasy rules are loaded from FIFA's public World Cup Fantasy data feed.

The app distinguishes between:

- FIFA fantasy records
- Selectable fantasy players

If the live FIFA feed is unavailable or stale, the app clearly labels demo data and disables AI scouting recommendations until live data returns.

AI reports are powered by GitHub Models through a server-side endpoint. The token is never exposed in the browser.

## Production Safeguards

The public AI endpoint includes:

- Persistent per-IP rate limiting for 5 AI reports every 10 minutes
- Request body size limits
- Strict request schema validation
- Context truncation before model calls
- Friendly rate-limit and quota messages
- Demo-data blocking for AI recommendations
- FIFA feed diagnostics for record counts, duplicate IDs, missing fields, status values, and selectable-player count

## Tech Stack

- HTML, CSS, and vanilla JavaScript
- Node.js serverless API routes
- FIFA World Cup Fantasy public data feed
- GitHub Models for AI-assisted scouting
- Vercel deployment

## Status

This is an independent fan project built for fantasy football planning and experimentation. It is not affiliated with FIFA.

Unofficial fan-made scouting tool. Not affiliated with, endorsed by, or sponsored by FIFA. Player data is sourced from the public FIFA Fantasy feed and may change.

## Credits

Made by Abdullah Yousuf for the love of the game.

- Website: https://wcfscout.app
- LinkedIn: https://www.linkedin.com/in/abdullah-yousuf-140925311/
- GitHub: https://github.com/Abdullah-AYP
