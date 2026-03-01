# Terraforming Mars Tier List

A comprehensive card tier list for Terraforming Mars with a full data pipeline
(scraping, AI-powered analysis, visualization) and a Chrome extension for in-game
overlay, replay analysis, and draft advice.

**Live site:** [rusliksu.github.io/tm-tierlist](https://rusliksu.github.io/tm-tierlist/)

## What's Inside

- **Tier list website** -- visual tier lists for projects, corporations, preludes, and CEOs,
  hosted on GitHub Pages. Available in English and Russian.
- **Chrome extension** (Manifest V3) -- overlay that shows tier ratings, synergy tooltips,
  combo highlights, and game logging directly in the browser client
  ([terraforming-mars.herokuapp.com](https://terraforming-mars.herokuapp.com)).
- **Data pipeline** -- Python and Node.js scripts that scrape card data, collect Reddit
  COTD (Card of the Day) discussions, run AI-assisted evaluation, and generate the final
  tier lists.
- **Game analysis tools** -- replay analyzer, game watcher, and draft advisor scripts.

## Key Numbers

| Metric | Value |
|--------|-------|
| Project cards analyzed | 541 |
| Card categories | Projects, Corporations, Preludes, CEOs |
| Format | 3 players / World Government Terraforming / All expansions |
| Extension version | 4.9 |

## Tech Stack

- **Python 3** -- scraping (Reddit COTD, card data), AI batch analysis, tier list generation
- **JavaScript / Node.js** -- game log analysis, synergy rules, replay tools
- **HTML / CSS** -- tier list pages (GitHub Pages)
- **Chrome Extension** (Manifest V3) -- in-game overlay with Vue bridge
- **Playwright** -- end-to-end tests for extension tooltips
- **GitHub Actions** -- CI (syntax checks, synergy rule tests)

## Repository Structure

```
tm-tierlist/
├── index.html              # Main tier list page (GitHub Pages)
├── extension/              # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js          # Tier overlay, synergy tooltips
│   ├── game-watcher.js     # Live game state tracking
│   ├── gamelog.js           # Game log capture
│   ├── templates.js         # Game templates
│   └── data/               # Bundled ratings, combos, effects
├── scripts/                # Data pipeline and analysis tools
│   ├── extract_cards.py    # Card data extraction
│   ├── scrape_cotd.py      # Reddit COTD scraping
│   ├── batch_analyze.py    # AI-powered card evaluation
│   ├── generate_*_tierlist.py  # Tier list generators
│   ├── replay-analyzer.js  # Game replay analysis
│   └── ...                 # ~60 pipeline and utility scripts
├── data/                   # Raw and processed data (JSON)
│   ├── all_cards.json
│   ├── evaluations.json
│   ├── cotd_posts.json
│   └── ...                 # ~50 data files
├── output/                 # Generated tier list pages (HTML, Markdown)
├── game-data/              # Saved game logs and analysis
├── images/                 # Card images by category
├── docs/                   # Detailed tier breakdowns (S/A/B/C/D)
└── .github/workflows/      # CI pipeline
```

## Data Sources

- **Card data** -- [terraforming-mars](https://github.com/terraforming-mars/terraforming-mars) open-source project
- **Community ratings** -- Reddit [r/TerraformingMarsGame](https://www.reddit.com/r/TerraformingMarsGame/) COTD threads by u/Enson_Chan
- **Desktop evaluations** -- original tier analysis with MC value calculations

## Local Development

```bash
# Run synergy rule tests
npm test

# Run extension tooltip e2e tests (requires Playwright)
npm run test:e2e

# Syntax-check extension files
npm run test:syntax
```

## License

This is a fan project. Terraforming Mars is designed by Jacob Fryxelius and
published by FryxGames / Stronghold Games. All card names and game mechanics
belong to their respective owners.
