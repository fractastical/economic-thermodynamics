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

This reproduces the spirit of the original Processing/p5 sketch, but with more metrics and controls.

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
