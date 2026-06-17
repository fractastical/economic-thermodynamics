/*
  Thermodynamic Economics Simulator
  ---------------------------------
  A dependency-free browser codebase for exploring:
  - Rosedale-style collision yard-sale exchange
  - Clean random-pair yard-sale exchange
  - printed UBI, wealth tax, transaction-tax dividends
  - wealth-acquired advantage
  - a small Second-Life-like virtual-world economy

  Open index.html directly, or serve the folder with:
    python3 -m http.server 8000
*/

'use strict';

// ---------------------------
// Utilities
// ---------------------------

const TAU = Math.PI * 2;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function roundTo(x, digits = 2) {
  const m = 10 ** digits;
  return Math.round(x * m) / m;
}

function formatNumber(x, digits = 2) {
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) >= 1_000_000) return (x / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(x) >= 10_000) return Math.round(x).toLocaleString();
  if (Math.abs(x) >= 1000) return x.toFixed(0);
  if (Math.abs(x) >= 100) return x.toFixed(1);
  return x.toFixed(digits);
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

class RNG {
  constructor(seed = 1) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 1;
  }
  next() {
    // Numerical Recipes LCG. Good enough for reproducible toy simulations.
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  weighted(items, weightFn) {
    let total = 0;
    for (const item of items) total += Math.max(0, weightFn(item));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const item of items) {
      r -= Math.max(0, weightFn(item));
      if (r <= 0) return item;
    }
    return items[items.length - 1];
  }
}

function gini(values) {
  const xs = values.filter(x => Number.isFinite(x) && x >= 0).slice().sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  const total = xs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * xs[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function topShare(values, share) {
  const xs = values.filter(x => Number.isFinite(x) && x >= 0).slice().sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return 0;
  const total = xs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const k = Math.max(1, Math.floor(n * share));
  const top = xs.slice(n - k).reduce((a, b) => a + b, 0);
  return top / total;
}

function normalizedEntropy(values) {
  const xs = values.filter(x => Number.isFinite(x) && x > 0);
  const n = values.length;
  if (n <= 1) return 1;
  const total = xs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const x of xs) {
    const p = x / total;
    h -= p * Math.log(p);
  }
  return h / Math.log(n);
}

// ---------------------------
// Parameters and presets
// ---------------------------

const DEFAULT_PARAMS = Object.freeze({
  seed: 7,
  numAgents: 220,
  initialBalance: 50,
  model: 'randomYardSale',
  simSpeed: 1,
  tradesPerTick: 75,
  fractionRisk: 0.10,
  motionSpeed: 80,
  minRadius: 2.2,
  visualScale: 0.055,
  radiusCoupledToWealth: false,
  wallMode: 'bounce',

  // Policy levers. Rates are per tick unless the label says otherwise.
  transactionTax: 0.00,
  wealthTax: 0.00,
  printedUBI: 0.00,
  dividendInterval: 10,
  wealthAdvantage: 0.00,

  // Virtual world levers.
  creatorShare: 0.35,
  landlordShare: 0.08,
  speculatorShare: 0.07,
  stipend: 0.01,
  demandPerTick: 45,
  creatorProductionChance: 0.07,
  uploadFee: 0.40,
  marketplaceFee: 0.06,
  searchBias: 0.40,
  landPrice: 85,
  maxLand: 90,
  landRent: 0.035,
  rentSeeking: 0.02,
  newcomerChurn: 0.000,
  energyPerTransaction: 0.0010,
  serverEnergyPerAgent: 0.000006,
});

const PRESETS = {
  collision: {
    name: 'Rosedale-style collision yard sale',
    description: 'Agents move like particles. Collisions trigger trades. Visual radius is also collision radius, so wealth can affect encounter rate.',
    params: {
      model: 'collisionYardSale',
      numAgents: 200,
      seed: 3,
      tradesPerTick: 0,
      radiusCoupledToWealth: true,
      fractionRisk: 0.10,
      transactionTax: 0,
      wealthTax: 0,
      printedUBI: 0,
      wealthAdvantage: 0,
      motionSpeed: 110,
    },
  },
  clean: {
    name: 'Clean random-pair yard sale',
    description: 'Random pairs trade. The display no longer determines who meets whom, isolating the core yard-sale exchange rule.',
    params: {
      model: 'randomYardSale',
      seed: 11,
      numAgents: 240,
      tradesPerTick: 120,
      radiusCoupledToWealth: false,
      fractionRisk: 0.10,
      transactionTax: 0,
      wealthTax: 0,
      printedUBI: 0,
      wealthAdvantage: 0,
    },
  },
  ubi: {
    name: 'Printed UBI only',
    description: 'Every tick creates equal new money for all agents. Useful for testing whether printing alone stops concentration.',
    params: {
      model: 'randomYardSale',
      seed: 13,
      numAgents: 240,
      tradesPerTick: 120,
      printedUBI: 0.035,
      transactionTax: 0,
      wealthTax: 0,
      wealthAdvantage: 0,
    },
  },
  txTax: {
    name: 'Transaction-tax dividend',
    description: 'Each trade pays a fee into a pool. The pool is redistributed equally every policy interval.',
    params: {
      model: 'randomYardSale',
      seed: 17,
      numAgents: 240,
      tradesPerTick: 120,
      printedUBI: 0,
      transactionTax: 0.06,
      wealthTax: 0,
      wealthAdvantage: 0,
    },
  },
  wealthTax: {
    name: 'Wealth-tax dividend',
    description: 'Balances are skimmed at a small per-tick rate and redistributed equally. Compare required rates against transaction fees.',
    params: {
      model: 'randomYardSale',
      seed: 19,
      numAgents: 240,
      tradesPerTick: 120,
      printedUBI: 0,
      transactionTax: 0,
      wealthTax: 0.0012,
      wealthAdvantage: 0,
    },
  },
  advantage: {
    name: 'Wealth-acquired advantage',
    description: 'The richer party has a slightly better chance of winning trades. This mimics better information, search ranking, lawyers, bargaining power, or network effects.',
    params: {
      model: 'randomYardSale',
      seed: 23,
      numAgents: 240,
      tradesPerTick: 120,
      transactionTax: 0,
      wealthTax: 0,
      printedUBI: 0,
      wealthAdvantage: 0.16,
    },
  },
  advantageTaxed: {
    name: 'Advantage + transaction-tax dividend',
    description: 'A richer-agent edge fights against a transaction-tax dividend. Sweep the tax and advantage sliders to find regimes.',
    params: {
      model: 'randomYardSale',
      seed: 29,
      numAgents: 240,
      tradesPerTick: 120,
      transactionTax: 0.075,
      wealthTax: 0,
      printedUBI: 0,
      wealthAdvantage: 0.14,
    },
  },
  virtual: {
    name: 'Virtual-world lite',
    description: 'Creators produce digital goods, consumers buy them, land boosts visibility, the platform collects fees/tier, and attention becomes the scarce resource.',
    params: {
      model: 'virtualWorld',
      seed: 37,
      numAgents: 260,
      tradesPerTick: 0,
      transactionTax: 0.025,
      wealthTax: 0,
      printedUBI: 0,
      wealthAdvantage: 0.00,
      stipend: 0.025,
      demandPerTick: 55,
      creatorProductionChance: 0.08,
      uploadFee: 0.45,
      marketplaceFee: 0.06,
      searchBias: 0.45,
      landPrice: 90,
      maxLand: 95,
      landRent: 0.04,
      rentSeeking: 0.025,
    },
  },
};

const CONTROL_DEFS = [
  { group: 'core', key: 'seed', label: 'Random seed', type: 'number', min: 1, max: 999999, step: 1, reset: true, hint: 'Reset to replay exactly.' },
  { group: 'core', key: 'numAgents', label: 'Agents', type: 'range', min: 50, max: 700, step: 10, reset: true },
  { group: 'core', key: 'initialBalance', label: 'Initial balance', type: 'range', min: 5, max: 250, step: 5, reset: true },
  { group: 'core', key: 'model', label: 'Model', type: 'select', reset: true, options: [
    ['collisionYardSale', 'collision yard sale'],
    ['randomYardSale', 'random-pair yard sale'],
    ['virtualWorld', 'virtual-world lite'],
  ]},
  { group: 'core', key: 'simSpeed', label: 'Ticks per animation frame', type: 'range', min: 1, max: 20, step: 1 },
  { group: 'core', key: 'tradesPerTick', label: 'Random trades per tick', type: 'range', min: 0, max: 350, step: 5, hint: 'Ignored in collision and virtual-world modes.' },
  { group: 'core', key: 'fractionRisk', label: 'Fraction risked', type: 'range', min: 0.01, max: 0.50, step: 0.01 },
  { group: 'core', key: 'motionSpeed', label: 'Particle motion speed', type: 'range', min: 0, max: 220, step: 5 },
  { group: 'core', key: 'radiusCoupledToWealth', label: 'Use wealth as collision radius', type: 'checkbox', hint: 'Useful for reproducing the original particle demo; turn off for cleaner matching.' },
  { group: 'core', key: 'visualScale', label: 'Visual radius scale', type: 'range', min: 0.01, max: 0.18, step: 0.005 },

  { group: 'policy', key: 'transactionTax', label: 'Transaction tax', type: 'range', min: 0, max: 0.30, step: 0.005 },
  { group: 'policy', key: 'wealthTax', label: 'Wealth tax per tick', type: 'range', min: 0, max: 0.010, step: 0.0001 },
  { group: 'policy', key: 'printedUBI', label: 'Printed UBI per tick', type: 'range', min: 0, max: 0.25, step: 0.005 },
  { group: 'policy', key: 'dividendInterval', label: 'Dividend interval', type: 'range', min: 1, max: 100, step: 1 },
  { group: 'policy', key: 'wealthAdvantage', label: 'Richer-agent edge', type: 'range', min: 0, max: 0.45, step: 0.005, hint: '0 means a fair coin. Higher values favor the richer side more strongly when wealth gaps are large.' },

  { group: 'virtual', key: 'creatorShare', label: 'Creator share', type: 'range', min: 0.05, max: 0.75, step: 0.01, reset: true },
  { group: 'virtual', key: 'landlordShare', label: 'Landlord share', type: 'range', min: 0, max: 0.30, step: 0.01, reset: true },
  { group: 'virtual', key: 'speculatorShare', label: 'Speculator share', type: 'range', min: 0, max: 0.30, step: 0.01, reset: true },
  { group: 'virtual', key: 'stipend', label: 'Virtual-world stipend', type: 'range', min: 0, max: 0.20, step: 0.005 },
  { group: 'virtual', key: 'demandPerTick', label: 'Consumer purchases per tick', type: 'range', min: 0, max: 180, step: 5 },
  { group: 'virtual', key: 'creatorProductionChance', label: 'Creator production chance', type: 'range', min: 0, max: 0.30, step: 0.005 },
  { group: 'virtual', key: 'uploadFee', label: 'Upload/listing fee', type: 'range', min: 0, max: 5, step: 0.05 },
  { group: 'virtual', key: 'marketplaceFee', label: 'Marketplace fee', type: 'range', min: 0, max: 0.30, step: 0.005 },
  { group: 'virtual', key: 'searchBias', label: 'Search/attention bias', type: 'range', min: 0, max: 1.5, step: 0.01, hint: 'Higher values make wealth, reputation, and land matter more for visibility.' },
  { group: 'virtual', key: 'landPrice', label: 'Base land price', type: 'range', min: 5, max: 500, step: 5 },
  { group: 'virtual', key: 'maxLand', label: 'Total land supply', type: 'range', min: 0, max: 350, step: 5, reset: true },
  { group: 'virtual', key: 'landRent', label: 'Land tier/rent per tick', type: 'range', min: 0, max: 0.30, step: 0.005 },
  { group: 'virtual', key: 'rentSeeking', label: 'Landlord rent seeking', type: 'range', min: 0, max: 0.20, step: 0.005 },
  { group: 'virtual', key: 'newcomerChurn', label: 'Poor-agent churn', type: 'range', min: 0, max: 0.01, step: 0.0001 },
  { group: 'virtual', key: 'energyPerTransaction', label: 'Energy per transaction', type: 'range', min: 0, max: 0.02, step: 0.0005 },
  { group: 'virtual', key: 'serverEnergyPerAgent', label: 'Server energy per agent', type: 'range', min: 0, max: 0.0001, step: 0.000001 },
];

// ---------------------------
// Agent and simulation engine
// ---------------------------

class Agent {
  constructor(id, rng, params, width, height) {
    this.id = id;
    this.x = rng.range(12, width - 12);
    this.y = rng.range(12, height - 12);
    const theta = rng.range(0, TAU);
    const speed = rng.range(0.45, 1.0) * params.motionSpeed;
    this.vx = Math.cos(theta) * speed;
    this.vy = Math.sin(theta) * speed;

    this.balance = params.initialBalance;
    this.radius = params.minRadius;
    this.role = 'consumer';
    this.skill = rng.range(0.45, 1.85);
    this.reputation = rng.range(0.05, 0.35);
    this.inventory = 0;
    this.land = 0;
    this.utility = 0;
    this.visibility = 1;
    this.incomeWindow = 0;
    this.salesWindow = 0;
    this.age = 0;
  }
}

class EconomySim {
  constructor(worldCanvas, chartCanvas, metricRoot, params) {
    this.canvas = worldCanvas;
    this.ctx = worldCanvas.getContext('2d');
    this.chartCanvas = chartCanvas;
    this.chartCtx = chartCanvas.getContext('2d');
    this.metricRoot = metricRoot;
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.running = true;
    this.history = [];
    this.reset();
  }

  reset() {
    this.rng = new RNG(Math.floor(this.params.seed || 1));
    this.ticks = 0;
    this.transactions = 0;
    this.taxPool = 0;
    this.platformTreasury = 0;
    this.energyUsed = 0;
    this.churned = 0;
    this.windowTransferVolume = 0;
    this.windowTrades = 0;
    this.history = [];
    this.agents = [];
    for (let i = 0; i < this.params.numAgents; i++) {
      this.agents.push(new Agent(i, this.rng, this.params, this.canvas.width, this.canvas.height));
    }
    this.assignRoles();
    this.updateRadii();
    this.captureMetrics(true);
    this.draw();
  }

  assignRoles() {
    const p = this.params;
    const creatorShare = clamp(p.creatorShare, 0, 0.95);
    const landlordShare = clamp(p.landlordShare, 0, 0.9);
    const speculatorShare = clamp(p.speculatorShare, 0, 0.9);
    for (const a of this.agents) {
      const r = this.rng.next();
      if (r < creatorShare) a.role = 'creator';
      else if (r < creatorShare + landlordShare) a.role = 'landlord';
      else if (r < creatorShare + landlordShare + speculatorShare) a.role = 'speculator';
      else a.role = 'consumer';

      if (a.role === 'creator') {
        a.reputation = this.rng.range(0.1, 0.8);
        a.inventory = this.rng.range(0, 8);
      } else if (a.role === 'landlord') {
        a.reputation = this.rng.range(0.05, 0.25);
      } else if (a.role === 'speculator') {
        a.reputation = this.rng.range(0.05, 0.25);
      }
    }
  }

  stepAnimationFrame() {
    const speed = Math.max(1, Math.floor(this.params.simSpeed));
    for (let i = 0; i < speed; i++) this.tick();
    this.draw();
  }

  tick() {
    this.ticks++;
    for (const a of this.agents) a.age++;

    // Printed basic income creates money rather than recycling it.
    if (this.params.printedUBI > 0) {
      for (const a of this.agents) a.balance += this.params.printedUBI;
    }

    if (this.params.model === 'virtualWorld') {
      this.virtualWorldTick();
    } else if (this.params.model === 'collisionYardSale') {
      this.moveAgents();
      this.handleCollisions(true);
    } else {
      this.randomYardSaleTick();
      this.moveAgents();
    }

    if (this.ticks % Math.max(1, Math.floor(this.params.dividendInterval)) === 0) {
      this.applyDividendPolicies();
      this.applyVirtualWorldMaintenance();
    }

    this.updateRadii();

    if (this.ticks % 10 === 0) this.captureMetrics(false);
  }

  randomYardSaleTick() {
    const n = this.agents.length;
    const trades = Math.max(0, Math.floor(this.params.tradesPerTick));
    for (let k = 0; k < trades; k++) {
      const i = this.rng.int(n);
      let j = this.rng.int(n - 1);
      if (j >= i) j++;
      this.yardSaleTrade(this.agents[i], this.agents[j]);
    }
  }

  yardSaleTrade(a, b) {
    if (!a || !b || a === b) return;
    if (a.balance <= 0 || b.balance <= 0) return;

    const rich = a.balance >= b.balance ? a : b;
    const poor = rich === a ? b : a;
    let amount = poor.balance * this.rng.range(0, this.params.fractionRisk);
    if (amount <= 0) return;

    const gap = (rich.balance - poor.balance) / Math.max(rich.balance + poor.balance, 1e-9);
    const pRichWins = clamp(0.5 + this.params.wealthAdvantage * gap, 0.001, 0.999);
    const winner = this.rng.chance(pRichWins) ? rich : poor;
    const loser = winner === rich ? poor : rich;

    amount = Math.min(amount, loser.balance);
    if (amount <= 0) return;

    const tax = amount * clamp(this.params.transactionTax, 0, 0.95);
    const net = amount - tax;

    loser.balance -= amount;
    winner.balance += net;
    winner.incomeWindow += net;
    this.taxPool += tax;

    this.transactions++;
    this.windowTrades++;
    this.windowTransferVolume += amount;
  }

  applyDividendPolicies() {
    const p = this.params;
    const n = this.agents.length;
    if (p.wealthTax > 0) {
      for (const a of this.agents) {
        const tax = Math.max(0, a.balance) * clamp(p.wealthTax, 0, 1);
        a.balance -= tax;
        this.taxPool += tax;
      }
    }

    if (this.taxPool > 0) {
      const dividend = this.taxPool / n;
      for (const a of this.agents) a.balance += dividend;
      this.taxPool = 0;
    }
  }

  moveAgents() {
    const dt = 1 / 60;
    const w = this.canvas.width;
    const h = this.canvas.height;
    for (const a of this.agents) {
      // Re-align speeds when the slider changes.
      const current = Math.hypot(a.vx, a.vy) || 1;
      const target = Math.max(0, this.params.motionSpeed) * (0.45 + 0.55 * ((a.id * 9301 + 49297) % 1000) / 999);
      const scale = target / current;
      a.vx *= scale;
      a.vy *= scale;

      a.x += a.vx * dt;
      a.y += a.vy * dt;

      if (this.params.wallMode === 'wrap') {
        if (a.x > w) a.x -= w;
        if (a.x < 0) a.x += w;
        if (a.y > h) a.y -= h;
        if (a.y < 0) a.y += h;
      } else {
        if (a.x > w - a.radius) { a.x = w - a.radius; a.vx *= -1; }
        if (a.x < a.radius) { a.x = a.radius; a.vx *= -1; }
        if (a.y > h - a.radius) { a.y = h - a.radius; a.vy *= -1; }
        if (a.y < a.radius) { a.y = a.radius; a.vy *= -1; }
      }
    }
  }

  handleCollisions(tradeOnCollision) {
    const n = this.agents.length;
    for (let i = 0; i < n; i++) {
      const a = this.agents[i];
      for (let j = i + 1; j < n; j++) {
        const b = this.agents[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          // Approximate elastic response along the collision normal.
          const va = a.vx * nx + a.vy * ny;
          const vb = b.vx * nx + b.vy * ny;
          const impulse = vb - va;
          a.vx += impulse * nx;
          a.vy += impulse * ny;
          b.vx -= impulse * nx;
          b.vy -= impulse * ny;

          if (tradeOnCollision) this.yardSaleTrade(a, b);
        } else if (dist === 0) {
          a.x += this.rng.range(-0.5, 0.5);
          a.y += this.rng.range(-0.5, 0.5);
        }
      }
    }
  }

  updateRadii() {
    const total = this.agentMoney();
    const area = this.canvas.width * this.canvas.height;
    const p = this.params;
    for (const a of this.agents) {
      const share = total > 0 ? Math.max(0, a.balance) / total : 1 / this.agents.length;
      // Always display wealth visually. The key difference is whether this also affects collisions/matching.
      const wealthRadius = Math.sqrt(share * area * p.visualScale);
      const displayRadius = clamp(wealthRadius, p.minRadius, 85);
      a.radius = displayRadius;
      if (!p.radiusCoupledToWealth && p.model === 'collisionYardSale') {
        // Clean collision option: fixed encounter radius, still display wealth by drawing an inner wealth circle.
        a.radius = Math.max(p.minRadius, 7);
      }
    }
  }

  // ---------------------------
  // Virtual-world model
  // ---------------------------

  virtualWorldTick() {
    const p = this.params;

    if (p.stipend > 0) {
      for (const a of this.agents) a.balance += p.stipend;
    }

    this.virtualProduction();
    this.virtualLandMarket();
    this.virtualRentSeeking();
    this.virtualMarketplacePurchases();
    this.virtualChurn();
    this.moveAgents();

    this.energyUsed += p.serverEnergyPerAgent * this.agents.length;
  }

  virtualProduction() {
    const p = this.params;
    for (const a of this.agents) {
      if (a.role !== 'creator') continue;
      if (!this.rng.chance(p.creatorProductionChance)) continue;
      if (a.balance < p.uploadFee) continue;

      a.balance -= p.uploadFee;
      this.platformTreasury += p.uploadFee;
      const output = a.skill * this.rng.range(0.6, 1.8) * (1 + 0.10 * a.land);
      a.inventory += output;
      a.reputation += 0.006 * a.skill;
      a.reputation = clamp(a.reputation, 0, 20);
    }
  }

  virtualLandMarket() {
    const p = this.params;
    const usedLand = this.totalLand();
    let available = Math.max(0, Math.floor(p.maxLand - usedLand));
    if (available <= 0) return;

    const scarcity = p.maxLand > 0 ? usedLand / p.maxLand : 1;
    const price = p.landPrice * (1 + 3 * scarcity * scarcity);

    for (const a of this.agents) {
      if (available <= 0) break;
      let chance = 0;
      if (a.role === 'landlord') chance = 0.030;
      else if (a.role === 'speculator') chance = 0.020;
      else if (a.role === 'creator') chance = 0.012;
      else chance = 0.002;

      // Richer agents can buy scarce platform land more easily.
      chance *= clamp(a.balance / Math.max(price, 1), 0.15, 3.0);

      if (a.balance > price && this.rng.chance(chance)) {
        a.balance -= price;
        this.platformTreasury += price;
        a.land += 1;
        available -= 1;
      }
    }
  }

  virtualRentSeeking() {
    const p = this.params;
    if (p.rentSeeking <= 0) return;
    const landlords = this.agents.filter(a => a.land > 0 && (a.role === 'landlord' || a.role === 'speculator'));
    const tenants = this.agents.filter(a => a.role === 'creator' && a.balance > 1);
    if (landlords.length === 0 || tenants.length === 0) return;

    // Landowners periodically sell attention/rent access to creators.
    for (const landlord of landlords) {
      if (!this.rng.chance(0.025)) continue;
      const tenant = this.rng.pick(tenants);
      if (tenant === landlord) continue;
      const rent = Math.min(tenant.balance, p.rentSeeking * (1 + landlord.land) * this.rng.range(0.5, 2.0));
      if (rent <= 0) continue;
      tenant.balance -= rent;
      landlord.balance += rent;
      landlord.incomeWindow += rent;
      this.transactions++;
      this.windowTrades++;
      this.windowTransferVolume += rent;
    }
  }

  virtualMarketplacePurchases() {
    const p = this.params;
    const buyers = this.agents.filter(a => a.balance > 0.25);
    const sellers = this.agents.filter(a => a.role === 'creator' && a.inventory > 0.1);
    if (buyers.length === 0 || sellers.length === 0) return;

    for (const s of sellers) this.updateVisibility(s);

    const demand = Math.max(0, Math.floor(p.demandPerTick));
    for (let k = 0; k < demand; k++) {
      const buyer = this.rng.pick(buyers);
      if (!buyer || buyer.balance <= 0.25) continue;
      const seller = this.rng.weighted(sellers, s => s.visibility * Math.max(0.1, Math.sqrt(s.inventory)));
      if (!seller || seller === buyer || seller.inventory <= 0) continue;

      const basePrice = this.rng.range(0.8, 4.5);
      const reputationPremium = 1 + 0.18 * Math.log1p(seller.reputation);
      const landPremium = 1 + 0.05 * seller.land;
      let price = basePrice * reputationPremium * landPremium;
      price = Math.min(price, buyer.balance * 0.35);
      if (price <= 0.05) continue;

      const marketplaceFee = price * clamp(p.marketplaceFee, 0, 0.95);
      const transactionTax = price * clamp(p.transactionTax, 0, 0.95);
      const sellerReceives = Math.max(0, price - marketplaceFee - transactionTax);

      buyer.balance -= price;
      seller.balance += sellerReceives;
      seller.incomeWindow += sellerReceives;
      seller.salesWindow += 1;
      this.platformTreasury += marketplaceFee;
      this.taxPool += transactionTax;
      seller.inventory = Math.max(0, seller.inventory - this.rng.range(0.4, 1.2));
      seller.reputation += 0.004 + 0.0008 * price;
      buyer.utility += price * this.rng.range(0.7, 1.6);

      this.transactions++;
      this.windowTrades++;
      this.windowTransferVolume += price;
      this.energyUsed += p.energyPerTransaction;
    }

    // Reputation decays unless continuously maintained.
    for (const a of this.agents) {
      if (a.role === 'creator') a.reputation *= (1 - clamp(this.params.creatorProductionChance, 0, 1) * 0.0005 - 0.0004);
    }
  }

  updateVisibility(a) {
    const p = this.params;
    const wealthTerm = Math.log1p(Math.max(0, a.balance)) / Math.log(100 + this.params.initialBalance);
    const repTerm = Math.log1p(Math.max(0, a.reputation));
    const landTerm = Math.log1p(Math.max(0, a.land));
    a.visibility = Math.max(0.01, 1 + p.searchBias * (0.55 * wealthTerm + 1.3 * repTerm + 1.0 * landTerm));
  }

  applyVirtualWorldMaintenance() {
    if (this.params.model !== 'virtualWorld') return;
    const p = this.params;

    // Land tier: land has visibility value but requires recurring payments to the platform.
    if (p.landRent > 0) {
      for (const a of this.agents) {
        if (a.land <= 0) continue;
        const tier = p.landRent * a.land;
        if (a.balance >= tier) {
          a.balance -= tier;
          this.platformTreasury += tier;
        } else {
          // Foreclose one unit if the owner cannot pay tier.
          a.land = Math.max(0, a.land - 1);
        }
      }
    }
  }

  virtualChurn() {
    const p = this.params;
    if (p.newcomerChurn <= 0) return;
    for (const a of this.agents) {
      const poor = a.balance < p.initialBalance * 0.10 && a.land <= 0 && a.inventory < 1;
      if (!poor || !this.rng.chance(p.newcomerChurn)) continue;
      // Replace a failed participant with a newcomer. This is intentionally a new-money entry rule.
      a.balance = p.initialBalance;
      a.role = 'consumer';
      a.skill = this.rng.range(0.45, 1.85);
      a.reputation = this.rng.range(0.05, 0.35);
      a.inventory = 0;
      a.land = 0;
      a.utility = 0;
      a.incomeWindow = 0;
      a.salesWindow = 0;
      a.age = 0;
      this.churned++;
    }
  }

  // ---------------------------
  // Metrics
  // ---------------------------

  agentMoney() {
    return this.agents.reduce((s, a) => s + Math.max(0, a.balance), 0);
  }

  totalLand() {
    return this.agents.reduce((s, a) => s + Math.max(0, a.land), 0);
  }

  captureMetrics(initial = false) {
    const balances = this.agents.map(a => Math.max(0, a.balance));
    const income = this.agents.map(a => Math.max(0, a.incomeWindow));
    const total = balances.reduce((a, b) => a + b, 0);
    const avg = total / this.agents.length;
    const rich = balances.filter(x => x > avg * 2).length / this.agents.length;
    const poor = balances.filter(x => x < avg * 0.5).length / this.agents.length;
    const creators = this.agents.filter(a => a.role === 'creator');
    const activeCreators = creators.filter(a => a.inventory > 0.1 || a.salesWindow > 0).length;
    const creatorSales = creators.reduce((s, a) => s + a.salesWindow, 0);
    const velocity = this.windowTransferVolume / Math.max(total, 1);

    const row = {
      tick: this.ticks,
      transactions: this.transactions,
      gini: gini(balances),
      incomeGini: gini(income),
      top1: topShare(balances, 0.01),
      top10: topShare(balances, 0.10),
      entropy: normalizedEntropy(balances),
      richShareCount: rich,
      poorShareCount: poor,
      agentMoney: total,
      averageBalance: avg,
      taxPool: this.taxPool,
      platformTreasury: this.platformTreasury,
      velocity,
      tradesWindow: this.windowTrades,
      energyUsed: this.energyUsed,
      totalLand: this.totalLand(),
      activeCreators,
      creatorSales,
      churned: this.churned,
      totalUtility: this.agents.reduce((s, a) => s + a.utility, 0),
    };

    this.history.push(row);
    if (this.history.length > 1200) this.history.shift();

    if (!initial) {
      this.windowTransferVolume = 0;
      this.windowTrades = 0;
      for (const a of this.agents) {
        a.incomeWindow = 0;
        a.salesWindow = 0;
      }
    }
  }

  latestMetrics() {
    return this.history[this.history.length - 1] || {};
  }

  // ---------------------------
  // Rendering
  // ---------------------------

  draw() {
    this.drawWorld();
    this.drawMetrics();
    this.drawChart();
  }

  drawWorld() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background grid.
    ctx.save();
    ctx.fillStyle = '#11151c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();

    const total = this.agentMoney();
    const avg = total / this.agents.length;
    const maxBalance = Math.max(...this.agents.map(a => a.balance));

    // Draw smaller circles first so wealthy agents remain visible.
    const sorted = this.agents.slice().sort((a, b) => a.radius - b.radius);
    for (const a of sorted) {
      let fill = '#75a7ff';
      if (a.balance > avg * 2) fill = '#6de08f';
      else if (a.balance < avg * 0.5) fill = '#ff7d7d';
      if (this.params.model === 'virtualWorld') {
        if (a.role === 'creator') fill = '#9e8cff';
        if (a.role === 'landlord') fill = '#ffd166';
        if (a.role === 'speculator') fill = '#ff9f6e';
        if (a.balance < avg * 0.5) fill = '#ff7d7d';
      }

      const displayRadius = this.displayRadiusFor(a, total);
      ctx.beginPath();
      ctx.arc(a.x, a.y, displayRadius, 0, TAU);
      ctx.fillStyle = fill;
      ctx.globalAlpha = 0.86;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (a.land > 0) {
        ctx.strokeStyle = 'rgba(255, 220, 120, 0.85)';
        ctx.lineWidth = clamp(1 + a.land * 0.15, 1, 5);
        ctx.stroke();
      }

      if (a.balance === maxBalance && displayRadius > 8) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    this.drawLegend(ctx, w, h);
  }

  displayRadiusFor(a, total) {
    const area = this.canvas.width * this.canvas.height;
    const share = total > 0 ? Math.max(0, a.balance) / total : 1 / this.agents.length;
    const wealthRadius = Math.sqrt(share * area * this.params.visualScale);
    return clamp(wealthRadius, this.params.minRadius, 85);
  }

  drawLegend(ctx, w, h) {
    ctx.save();
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(15, 17, 22, 0.70)';
    ctx.fillRect(12, 12, 415, this.params.model === 'virtualWorld' ? 88 : 62);
    ctx.fillStyle = '#edf0f5';
    ctx.fillText(this.readableModelName(), 24, 32);
    ctx.fillStyle = '#a9b0bd';
    if (this.params.model === 'virtualWorld') {
      ctx.fillText('purple: creators  yellow: landlords  orange: speculators  red: poor', 24, 54);
      ctx.fillText('circle area ≈ money share; yellow ring ≈ land holdings', 24, 74);
    } else {
      ctx.fillText('green: >2× average  blue: middle  red: <0.5× average', 24, 54);
    }
    ctx.restore();
  }

  readableModelName() {
    if (this.params.model === 'collisionYardSale') return 'Collision yard-sale exchange';
    if (this.params.model === 'virtualWorld') return 'Virtual-world lite economy';
    return 'Random-pair yard-sale exchange';
  }

  drawMetrics() {
    const m = this.latestMetrics();
    const metricDefs = [
      ['Gini', m.gini, v => formatNumber(v, 3)],
      ['Top 1%', m.top1, v => (v * 100).toFixed(1) + '%'],
      ['Top 10%', m.top10, v => (v * 100).toFixed(1) + '%'],
      ['Entropy', m.entropy, v => formatNumber(v, 3)],
      ['Velocity', m.velocity, v => formatNumber(v, 3)],
      ['Agent money', m.agentMoney, v => formatNumber(v, 1)],
      ['Transactions', m.transactions, v => formatNumber(v, 0)],
      ['Tax pool', m.taxPool, v => formatNumber(v, 2)],
      ['Platform', m.platformTreasury, v => formatNumber(v, 2)],
      ['Land', m.totalLand, v => formatNumber(v, 0)],
      ['Creators active', m.activeCreators, v => formatNumber(v, 0)],
      ['Energy used', m.energyUsed, v => formatNumber(v, 3)],
      ['Rich agents', m.richShareCount, v => (v * 100).toFixed(0) + '%'],
      ['Poor agents', m.poorShareCount, v => (v * 100).toFixed(0) + '%'],
      ['Income Gini', m.incomeGini, v => formatNumber(v, 3)],
      ['Churned', m.churned, v => formatNumber(v, 0)],
    ];

    this.metricRoot.innerHTML = metricDefs.map(([label, value, fmt]) => `
      <div class="metric">
        <div class="label">${label}</div>
        <div class="value">${fmt(value)}</div>
      </div>
    `).join('');
  }

  drawChart() {
    const ctx = this.chartCtx;
    const w = this.chartCanvas.width;
    const h = this.chartCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#11151c';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let y = 20; y < h - 20; y += 30) {
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(w - 20, y); ctx.stroke();
    }

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#a9b0bd';
    ctx.fillText('0', 18, h - 20);
    ctx.fillText('1', 18, 25);
    ctx.fillText('Gini', 54, 18);
    ctx.fillText('Top 1%', 115, 18);
    ctx.fillText('Entropy', 195, 18);
    ctx.fillText('Velocity scaled', 285, 18);

    if (this.history.length < 2) return;

    const plot = (key, color, scaleFn = v => v) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.history.forEach((row, idx) => {
        const x = 40 + idx / Math.max(1, this.history.length - 1) * (w - 60);
        const yv = clamp(scaleFn(row[key]), 0, 1);
        const y = h - 20 - yv * (h - 45);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    plot('gini', '#6de08f');
    plot('top1', '#ffd166');
    plot('entropy', '#75a7ff');
    plot('velocity', '#ff7d7d', v => Math.log1p(v) / Math.log(2));
  }

  exportCsv() {
    if (this.history.length === 0) return;
    const cols = Object.keys(this.history[0]);
    const rows = [cols.join(',')];
    for (const row of this.history) rows.push(cols.map(c => csvEscape(row[c])).join(','));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thermo-econ-history-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

// ---------------------------
// UI binding
// ---------------------------

const worldCanvas = document.getElementById('world');
const chartCanvas = document.getElementById('chart');
const metricsRoot = document.getElementById('metrics');
const presetSelect = document.getElementById('presetSelect');
const presetDescription = document.getElementById('presetDescription');
const toggleRunBtn = document.getElementById('toggleRun');
const resetBtn = document.getElementById('resetBtn');
const stepBtn = document.getElementById('stepBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const copyParamsBtn = document.getElementById('copyParamsBtn');

let currentParams = { ...DEFAULT_PARAMS, ...PRESETS.clean.params };
let sim = new EconomySim(worldCanvas, chartCanvas, metricsRoot, currentParams);

function initPresets() {
  presetSelect.innerHTML = Object.entries(PRESETS).map(([key, preset]) => (
    `<option value="${key}">${preset.name}</option>`
  )).join('');
  presetSelect.value = 'clean';
  presetDescription.textContent = PRESETS.clean.description;
}

function valueLabel(key, value) {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'string') return value;
  if (key.toLowerCase().includes('tax') || key === 'transactionTax' || key === 'marketplaceFee' || key === 'wealthAdvantage' || key === 'creatorShare' || key === 'landlordShare' || key === 'speculatorShare' || key === 'searchBias' || key === 'rentSeeking') {
    return Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (Math.abs(Number(value)) < 0.01 && Number(value) !== 0) return Number(value).toExponential(2);
  if (Number.isInteger(Number(value))) return String(value);
  return Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

function buildControls() {
  const roots = {
    core: document.getElementById('coreControls'),
    policy: document.getElementById('policyControls'),
    virtual: document.getElementById('virtualControls'),
  };
  for (const root of Object.values(roots)) root.innerHTML = '';

  for (const def of CONTROL_DEFS) {
    const root = roots[def.group];
    const wrap = document.createElement('div');
    wrap.className = 'control';

    if (def.type === 'checkbox') {
      wrap.innerHTML = `
        <label class="checkboxControl">
          <input type="checkbox" ${currentParams[def.key] ? 'checked' : ''} data-key="${def.key}" />
          <span><strong>${def.label}</strong>${def.hint ? `<br><span class="hint">${def.hint}</span>` : ''}</span>
        </label>
      `;
    } else if (def.type === 'select') {
      wrap.innerHTML = `
        <div class="controlTop"><label>${def.label}</label><output>${valueLabel(def.key, currentParams[def.key])}</output></div>
        <select data-key="${def.key}">
          ${def.options.map(([value, label]) => `<option value="${value}" ${currentParams[def.key] === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        ${def.hint ? `<div class="hint">${def.hint}</div>` : ''}
      `;
    } else if (def.type === 'number') {
      wrap.innerHTML = `
        <div class="controlTop"><label>${def.label}</label><output>${valueLabel(def.key, currentParams[def.key])}</output></div>
        <input type="number" min="${def.min}" max="${def.max}" step="${def.step}" value="${currentParams[def.key]}" data-key="${def.key}" />
        ${def.hint ? `<div class="hint">${def.hint}</div>` : ''}
      `;
    } else {
      wrap.innerHTML = `
        <div class="controlTop"><label>${def.label}</label><output>${valueLabel(def.key, currentParams[def.key])}</output></div>
        <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${currentParams[def.key]}" data-key="${def.key}" />
        ${def.hint ? `<div class="hint">${def.hint}</div>` : ''}
      `;
    }

    const input = wrap.querySelector('[data-key]');
    const output = wrap.querySelector('output');
    input.addEventListener('input', () => {
      let value;
      if (def.type === 'checkbox') value = input.checked;
      else if (def.type === 'select') value = input.value;
      else value = Number(input.value);
      currentParams[def.key] = value;
      sim.params[def.key] = value;
      if (output) output.textContent = valueLabel(def.key, value);
      if (def.reset) {
        sim.params = { ...currentParams };
        sim.reset();
      }
    });

    root.appendChild(wrap);
  }
}

function applyPreset(key) {
  const preset = PRESETS[key];
  currentParams = { ...DEFAULT_PARAMS, ...preset.params };
  presetDescription.textContent = preset.description;
  sim.params = { ...currentParams };
  sim.reset();
  buildControls();
}

initPresets();
buildControls();

presetSelect.addEventListener('change', () => applyPreset(presetSelect.value));

toggleRunBtn.addEventListener('click', () => setRunning(!sim.running));

resetBtn.addEventListener('click', () => {
  sim.params = { ...currentParams };
  sim.reset();
});

stepBtn.addEventListener('click', () => {
  sim.tick();
  sim.draw();
});

exportCsvBtn.addEventListener('click', () => sim.exportCsv());

copyParamsBtn.addEventListener('click', async () => {
  const text = JSON.stringify(currentParams, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    copyParamsBtn.textContent = 'Copied';
    setTimeout(() => copyParamsBtn.textContent = 'Copy params', 900);
  } catch {
    console.log(text);
    copyParamsBtn.textContent = 'Logged';
    setTimeout(() => copyParamsBtn.textContent = 'Copy params', 900);
  }
});

// ---------------------------
// Embed mode (?embed=1)
// ---------------------------
// Query params:
//   embed=1            compact, sidebar-free layout for iframes
//   preset=<key>       one of the PRESETS keys (e.g. advantage, virtual)
//   autoplay=0         start paused (default: running)
//   controls=0         hide the compact control bar
//   chart=0            hide the time-series chart
//   speed=<n>          ticks per animation frame

function setRunning(running) {
  sim.running = running;
  const label = running ? 'Pause' : 'Run';
  toggleRunBtn.textContent = label;
  const embedToggle = document.getElementById('embedToggle');
  if (embedToggle) embedToggle.textContent = label;
}

function applyEmbedFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const presetKey = q.get('preset');
  if (presetKey && PRESETS[presetKey]) {
    presetSelect.value = presetKey;
    applyPreset(presetKey);
  }

  const speed = Number(q.get('speed'));
  if (Number.isFinite(speed) && speed >= 1) {
    currentParams.simSpeed = speed;
    sim.params.simSpeed = speed;
  }

  const isEmbed = q.get('embed') === '1' || q.get('embed') === 'true';
  if (!isEmbed) return;

  document.body.classList.add('embed');
  if (q.get('controls') === '0') document.body.classList.add('no-controls');
  if (q.get('chart') === '0') document.body.classList.add('no-chart');

  const embedBar = document.getElementById('embedBar');
  const embedPreset = document.getElementById('embedPreset');
  const embedToggle = document.getElementById('embedToggle');
  const embedReset = document.getElementById('embedReset');
  const embedFull = document.getElementById('embedFull');
  embedBar.hidden = false;

  embedPreset.innerHTML = Object.entries(PRESETS)
    .map(([key, preset]) => `<option value="${key}">${preset.name}</option>`)
    .join('');
  embedPreset.value = presetSelect.value;
  embedPreset.addEventListener('change', () => {
    presetSelect.value = embedPreset.value;
    applyPreset(embedPreset.value);
  });

  embedToggle.addEventListener('click', () => setRunning(!sim.running));
  embedReset.addEventListener('click', () => {
    sim.params = { ...currentParams };
    sim.reset();
  });

  // Link back to the full, slider-driven version (same page, no query).
  const full = new URL(window.location.href);
  full.search = '';
  embedFull.href = full.toString();

  if (q.get('autoplay') === '0') setRunning(false);
}

applyEmbedFromUrl();

function animationLoop() {
  if (sim.running) sim.stepAnimationFrame();
  else sim.draw();
  requestAnimationFrame(animationLoop);
}

requestAnimationFrame(animationLoop);
