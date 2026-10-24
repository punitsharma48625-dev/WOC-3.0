# WOC Simulation Stats site

This is a static site for GitHub Pages. It needs no server, database, build step, paid hosting, or JavaScript packages. `index.html` reads CSV files and `data/manifest.json` from this repository.

## Publish on GitHub Pages

1. Copy these site files into the root of the `WOC-3.0` repository. Keep `index.html` at the repository root and keep the `assets/` folder beside it.
2. In the repository on GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, select your default branch and **/(root)**, then save.
4. The owner runs `/update` or `!update` once to export, commit, and push the site files and generated `data/` folder. GitHub Pages will publish the site at `https://YOUR-USERNAME.github.io/WOC-3.0/`.

## Refresh the data

Use `/update` or `!update` in the bot. Only the configured bot owner can run it. The bot writes global CSVs and `manifest.json` to `Documents/GitHub/WOC-3.0/data` by default, commits only the website and generated data files, and pushes the current branch to `origin`. Configure Git author name/email and GitHub credentials on the bot host first. To use another location on the bot host, set `STATS_WEBSITE_DIR` to that repository's `data/` directory before starting the bot.

The export aggregates all saved simulated matches across servers. It does not publish Discord user or server IDs. GitHub Pages is public, so the match and player statistics in `data/` will be visible to anyone after publishing.

## Included views

The generated manifest drives the site tabs: match results, team innings and form, player batting and bowling career lines, innings, phases, pace/spin, batter handedness, batting position, teams, opponents, venues, head-to-head records, recent form and top records. Every tab has text search, format filtering where applicable, sortable columns, pagination and direct CSV download.

The bot stores aggregate innings and split rows, not event-level data. Partnerships, ball-by-ball commentary, toss decisions and exact batter-versus-bowler pairings are therefore not in these exports.
