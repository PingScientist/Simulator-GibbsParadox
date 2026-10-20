#!/usr/bin/env node
'use strict';

// Reproduce the report data. Run with `node scripts/run_experiments.cjs`.
// One sweep means N attempted Metropolis moves, not elapsed physical time.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Simulation, binaryEntropy } = require('../src/physics.js');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'results');
fs.mkdirSync(out, { recursive: true });

const config = Object.freeze({
  nPerSide: 24, temp: 1, coupling: 1.5,
  seeds: [17, 29, 43, 71, 101],
  closedBurnSweeps: 200, openSweeps: 4000,
  sampleEvery: 20, lateWindowStart: 3000,
  stepSize: 1, angleStep: 0.6,
});
const cases = [
  { id: 'ideal_AA', mode: 'ideal_AA', interaction: 'ideal', identity: 'AA', coupling: 0 },
  { id: 'ideal_AB', mode: 'ideal_AB', interaction: 'ideal', identity: 'AB', coupling: 0 },
  { id: 'hardcore_AA', mode: 'dipole_AA', interaction: 'hardcore', identity: 'AA', coupling: 0 },
  { id: 'hardcore_AB', mode: 'dipole_AB', interaction: 'hardcore', identity: 'AB', coupling: 0 },
  { id: 'dipole_AA', mode: 'dipole_AA', interaction: 'dipole', identity: 'AA', coupling: 1.5 },
  { id: 'dipole_AB', mode: 'dipole_AB', interaction: 'dipole', identity: 'AB', coupling: 1.5 },
];
const mean = values => values.reduce((sum, x) => sum + x, 0) / values.length;
const stats = values => {
  const average = mean(values);
  return { mean: average, sampleStd: values.length > 1 ? Math.sqrt(values.reduce((sum, x) => sum + (x - average) ** 2, 0) / (values.length - 1)) : 0, n: values.length };
};
const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, passed: !!condition, detail });
  assert.ok(condition, `${name}: ${detail}`);
}
const rows = [];
const trajectories = new Map();
const summaries = [];
// At ideal uniform equilibrium, each origin group has Binomial(n, 1/2)
// particles in the left half. The sample plug-in entropy is downward biased.
let binomialWeight = 2 ** -config.nPerSide;
let finiteNIdealOriginMean = 0;
for (let k = 0; k <= config.nPerSide; k++) {
  finiteNIdealOriginMean += binomialWeight * binaryEntropy(k / config.nPerSide);
  binomialWeight *= (config.nPerSide - k) / (k + 1);
}

// Metrics is intentionally recorded as supplied by the shared engine. The
// origin-label diagnostic is not a thermodynamic entropy measurement.
function sample(sim, phase, sweep, scenario, seed) {
  const metrics = sim.metrics();
  const required = ['mixingPerParticle', 'energyPerParticle'];
  for (const name of required) assert.ok(Number.isFinite(metrics[name]), `Non-finite ${name}`);
  const row = { case: scenario.id, mode: scenario.mode, interaction: scenario.interaction,
    identity: scenario.identity, coupling: scenario.coupling, seed, phase,
    sweep, totalSweeps: sim.sweeps, ...metrics };
  rows.push(row);
  return row;
}

for (const scenario of cases) {
  const seedResults = [];
  for (const seed of config.seeds) {
    const sampledStates = [];
    const sim = new Simulation({ mode: scenario.mode, nPerSide: config.nPerSide,
      temp: config.temp, coupling: scenario.coupling, seed,
      stepSize: config.stepSize, angleStep: config.angleStep });
    sample(sim, 'closed', 0, scenario, seed);
    for (let sweep = config.sampleEvery; sweep <= config.closedBurnSweeps; sweep += config.sampleEvery) {
      sim.sweep(config.sampleEvery);
      sample(sim, 'closed', sweep, scenario, seed);
    }
    sim.setPartition(true);
    const openSamples = [sample(sim, 'open', 0, scenario, seed)];
    for (let sweep = config.sampleEvery; sweep <= config.openSweeps; sweep += config.sampleEvery) {
      sim.sweep(config.sampleEvery);
      openSamples.push(sample(sim, 'open', sweep, scenario, seed));
      sampledStates.push(sim.particles.map(({ x, y, theta, origin }) => ({ x, y, theta, origin })));
    }
    const late = openSamples.filter(row => row.sweep >= config.lateWindowStart);
    const metricNames = Object.keys(late[0]).filter(key => typeof late[0][key] === 'number' &&
      !['seed', 'sweep', 'totalSweeps', 'coupling'].includes(key));
    const lateMeans = Object.fromEntries(metricNames.map(key => [key, mean(late.map(row => row[key]))]));
    seedResults.push({ seed, lateSampleCount: late.length,
      lateMeanMixingPerParticle: lateMeans.mixingPerParticle,
      lateMeanEnergyPerParticle: lateMeans.energyPerParticle,
      lateMeans, finalMetrics: sim.metrics() });
    check(`${scenario.id}/seed${seed}: finite late metrics`, Object.values(lateMeans).every(Number.isFinite));
    if (scenario.interaction === 'ideal') check(`${scenario.id}/seed${seed}: ideal potential energy zero`, openSamples.every(row => row.energyPerParticle === 0));
    check(`${scenario.id}/seed${seed}: thermodynamic reference`, openSamples.every(row => Math.abs(row.thermoMixTotal - (scenario.identity === 'AA' ? 0 : 2 * config.nPerSide * Math.LN2)) < 1e-12));
    check(`${scenario.id}/seed${seed}: cached energy equals all-pair recomputation`, Math.abs(sim.energy - sim.totalEnergy()) < 1e-8);
    // Species labels do not enter the interaction energy. Compare trajectories
    // by physical state only; equal labels are deliberately omitted.
    const physicalState = JSON.stringify(sampledStates);
    const pairKey = `${scenario.interaction}/${seed}`;
    if (scenario.identity === 'AA') trajectories.set(pairKey, physicalState);
    else check(`${pairKey}: AA/AB identical mechanical trajectory`, physicalState === trajectories.get(pairKey));
  }
  const names = Object.keys(seedResults[0].lateMeans);
  const acrossSeeds = Object.fromEntries(names.map(name => [name, stats(seedResults.map(result => result.lateMeans[name]))]));
  summaries.push({ ...scenario, nParticles: 2 * config.nPerSide,
    referenceMixingPerParticle: scenario.identity === 'AA' ? 0 : Math.log(2),
    thermodynamicReferencePerParticle: scenario.identity === 'AA' ? 0 : Math.log(2),
    referenceMeaning: 'bulk thermodynamic entropy of mixing per particle / k_B; not the measured origin-label diagnostic',
    originDiagnosticUpperBound: Math.LN2,
    seedResults, acrossSeeds });
  process.stdout.write(`${scenario.id}: origin diagnostic ${acrossSeeds.mixingPerParticle.mean.toFixed(4)} ± ${acrossSeeds.mixingPerParticle.sampleStd.toFixed(4)}, U/N ${acrossSeeds.energyPerParticle.mean.toFixed(4)} ± ${acrossSeeds.energyPerParticle.sampleStd.toFixed(4)}\n`);
}

const summary = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  model: 'Canonical Metropolis sampling; ideal points or hard-core planar dipoles; exact all-pair r^-3 potential; no physical time',
  config, modes: summaries,
  originDiagnosticReference: {
    upperBound: Math.LN2,
    finiteNIdealEquilibriumMean: finiteNIdealOriginMean,
    derivation: 'sum_k binomial(nPerSide,k) 2^(-nPerSide) H(k/nPerSide); ideal independent point particles in equal half-volumes',
    appliesTo: 'ideal only; interactions correlate positions so the binomial expression is not a universal interacting reference',
  },
  checks: { passed: checks.filter(check => check.passed).length, total: checks.length, details: checks },
  caveats: [
    'The spatial origin-label mixing diagnostic is not the thermodynamic entropy of an interacting system.',
    'AA has zero extensive thermodynamic mixing entropy under matched initial conditions even when origin labels spread.',
    'The AB ln(2) reference assumes mechanically identical species, equal populations, and equal initial densities.',
    'The table reports the mean and sample standard deviation of five seed-wise late-window means, not standard error.',
    'Finite sample size, temporal correlation, finite geometry and a finite run length affect the diagnostics; no convergence proof is claimed.',
    'The 200 closed-partition preparation sweeps are a chosen protocol; they do not certify equilibrium, particularly at stronger coupling.',
    'Each AA/AB pair uses the same seed and has identical mechanical dynamics by construction; these pairs are not independent samples.',
  ],
};
fs.writeFileSync(path.join(out, 'experiment-summary.json'), JSON.stringify(summary, null, 2) + '\n');
const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(key => rows.every(row => typeof row[key] !== 'object'));
const escape = value => /[,"\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? '');
fs.writeFileSync(path.join(out, 'timeseries.csv'), [columns.join(','), ...rows.map(row => columns.map(key => escape(row[key])).join(','))].join('\n') + '\n');
process.stdout.write(`Saved results/experiment-summary.json and results/timeseries.csv; ${summary.checks.passed}/${summary.checks.total} checks passed.\n`);
