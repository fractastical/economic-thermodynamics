# Thermodynamic Economics Simulator

A small, dependency-free codebase for exploring Philip Rosedale-style money-flow simulations and related econophysics / virtual-world models.

It has two parts:

1. **Browser app**: `index.html` + `app.js` + `styles.css`
   - Visual particle simulations.
   - Parameter sliders.
   - Live Gini, top-share, entropy, velocity, tax pool, platform treasury, land, creator activity, and energy metrics.
   - CSV export from the browser.

2. **Batch runner**: `batch_runner.py`
   - Standard-library Python script for repeated runs and parameter sweeps.
   - Produces CSV files for later analysis.

---

## Quick start

### Browser visual simulator

Open `index.html` in a browser.

If your browser blocks local files, serve the folder:

```bash
cd thermo-econ-sim
python3 -m http.server 8000
```

Then open the local server address printed by Python.

### Batch sweeps

```bash
cd thermo-econ-sim
python3 batch_runner.py --experiment baseline --steps 100000 --agents 500 --seeds 10
python3 batch_runner.py --experiment tax_sweep --steps 100000 --agents 500 --seeds 20
python3 batch_runner.py --experiment advantage_sweep --steps 100000 --agents 500 --seeds 10
python3 batch_runner.py --experiment virtual_sweep --steps 5000 --agents 400 --seeds 5
```

CSV files are written to `results/` unless you pass `--out`.

---

## Browser presets

### 1. Rosedale-style collision yard sale

Agents move like particles. Collisions trigger trades. Circle area corresponds to wealth share.

This reproduces the spirit of Philip Rosedale's original Processing simulation in [*Why do The Rich Get Richer?*](https://philiprosedale.substack.com/p/why-do-the-rich-get-richer), but with more metrics and controls. See [Credits and original work](#credits-and-original-work).

Important caveat: because larger circles collide more often, wealth can affect encounter rate. That can be interpreted as visibility/attention advantage, but it is not a clean random-matching model.

### 2. Clean random-pair yard sale

Random pairs trade, and the visual layout no longer determines who meets whom.

This is the cleaner baseline for the yard-sale mechanism:

```text
amount at risk = random fraction × poorer agent balance
winner = fair coin, unless richer-agent advantage is enabled
```

### 3. Printed UBI only

Every tick creates equal new money for every agent. This is useful for testing whether money creation alone prevents wealth concentration.

### 4. Transaction-tax dividend

Each trade contributes a percentage into a tax pool. The pool is redistributed equally every policy interval.

### 5. Wealth-tax dividend

Balances are taxed at a small per-tick rate. The pool is redistributed equally.

### 6. Wealth-acquired advantage

The richer party gets a higher probability of winning trades when wealth gaps are large.

This can stand in for unequal information, bargaining power, search ranking, network effects, legal power, or platform visibility.

### 7. Advantage + transaction-tax dividend

A richer-agent edge pushes toward concentration while a transaction-tax dividend pushes toward dispersion.

This is a good preset for searching for phase-transition-like behavior.

### 8. Virtual-world lite

A Second-Life-inspired toy economy:

- Creators pay upload/listing fees and produce digital goods.
- Consumers buy goods through a marketplace.
- Marketplace fees go to the platform treasury.
- Transaction taxes go into a dividend pool.
- Land is scarce and boosts visibility.
- Land tier/rent flows to the platform.
- Landlords/speculators can extract rent from creators.
- Search/attention bias makes reputation, wealth, and land more important.
- Energy metrics track server/transaction cost as an external physical footprint.

This is not a full model of Second Life. It is a sandbox for asking how platform rules, attention scarcity, land, fees, and redistribution affect concentration.

---

## Key metrics

- **Gini**: inequality across agent balances.
- **Top 1% / Top 10%**: oligarchic concentration.
- **Entropy**: normalized dispersion of money. Higher means more evenly spread.
- **Velocity**: transaction volume divided by current agent money in the last measurement window.
- **Income Gini**: inequality of recent inflows.
- **Platform**: platform treasury from upload fees, marketplace fees, land sales, and tier.
- **Tax pool**: tax collected but not yet redistributed.
- **Land**: total land owned by agents.
- **Energy used**: external energy-accounting metric, not deducted from balances.

---

## Where to extend

Start with these functions in `app.js`:

- `yardSaleTrade(a, b)` — core exchange rule.
- `applyDividendPolicies()` — tax and redistribution rules.
- `virtualWorldTick()` — high-level virtual-world update loop.
- `virtualProduction()` — creator production and upload fees.
- `virtualMarketplacePurchases()` — attention-weighted creator sales.
- `virtualLandMarket()` — scarce land sales.
- `captureMetrics()` — add metrics here.

Good extensions:

1. Add debt and bankruptcy.
2. Add inheritance or persistent accounts.
3. Add agent learning and strategy.
4. Add network topology instead of random matching.
5. Add creator quality distributions and repeat customers.
6. Add fraud, enforcement, bans, and trust.
7. Add cash-out flows to remove in-world money.
8. Add platform monetary policy: target exchange-rate stability by selling or buying currency.
9. Add land zoning or search-ranking rules.
10. Add real energy cost as a constraint on platform operation.

---

## Credits and original work

The yard-sale presets and the redistribution experiments in this codebase are directly inspired by **Philip Rosedale's "rich get richer" simulation series**, originally written in Processing. Three of his posts map almost one-to-one onto the presets here:

- Philip Rosedale, [*Why do The Rich Get Richer?*](https://philiprosedale.substack.com/p/why-do-the-rich-get-richer) (Jan 27, 2021) — the original collision/particle yard-sale simulation (preset 1).
- Philip Rosedale, [*Printing Money Doesn't Help*](https://philiprosedale.substack.com/p/printing-money-doesnt-help) — printed UBI alone does not stop concentration (preset 3).
- Philip Rosedale, [*Transaction Tax Dividend*](https://philiprosedale.substack.com/p/transaction-tax-dividend) — a transaction tax funding a per-person dividend (preset 4).

The underlying mechanism is the econophysics **"yard-sale model"**, which predates Rosedale's visualization:

- A. Chakraborti, *Distributions of money in model markets of economy*, International Journal of Modern Physics C, 13(10), 2002.
- B. Hayes, *Follow the Money*, American Scientist, 90(5), 2002 — coined the term "yard-sale model".
- B. M. Boghosian, *The Inescapable Casino*, Scientific American, 2019 — the affine wealth model adds taxes/redistribution and fits real wealth distributions.

This project re-implements those ideas in dependency-free JavaScript, adds more metrics and controls, and extends them with wealth-acquired advantage and a small virtual-world economy. It is an independent reimplementation and is not affiliated with or endorsed by Philip Rosedale.

---

## Scientific caution

These are toy models. They are useful for isolating mechanisms, not for predicting a real economy.

A good workflow is:

1. Run a simple model.
2. Identify the mechanism it isolates.
3. Sweep parameters across many seeds.
4. Compare qualitative regimes, not single runs.
5. Add one realistic feature at a time.

The most important distinction is between:

```text
mechanism demo: “this rule can cause concentration”
```

and

```text
empirical model: “this predicts a real economy”
```

This codebase is mostly the first. The batch runner helps move it toward the second by encouraging sweeps and repeated trials.
