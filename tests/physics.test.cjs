'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {Simulation, pairEnergy, pairForceTorque, binaryEntropy} = require('../src/physics.js');

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected} by >= ${tolerance}`);
}
function assertGeometry(sim) {
  const r = sim.isDipole ? 0.5 : 0;
  for (const p of sim.particles) {
    assert.ok(p.x >= r && p.x <= sim.width - r && p.y >= r && p.y <= sim.height - r);
    if (!sim.partitionOpen) {
      if (p.origin === 0) assert.ok(p.x < sim.width / 2 - r);
      else assert.ok(p.x > sim.width / 2 + r);
    }
  }
  if (sim.isDipole) {
    for (let i = 0; i < sim.particles.length; i++) for (let j = i + 1; j < sim.particles.length; j++) {
      const a = sim.particles[i], b = sim.particles[j];
      assert.ok((a.x - b.x) ** 2 + (a.y - b.y) ** 2 >= 1, 'Hard disks overlap.');
    }
  }
}

test('dipole known configurations: head-to-tail attracts and parallel side-by-side repels', () => {
  const a = {x: 0, y: 0, theta: 0}, b = {x: 2, y: 0, theta: 0};
  close(pairEnergy(a, b), -0.25);
  close(pairForceTorque(a, b).fx, 0.375);
  close(pairForceTorque(a, b).torqueA, 0);
  b.x = 0; b.y = 2;
  close(pairEnergy(a, b), 0.125);
  close(pairForceTorque(a, b).fy, -0.1875);
  assert.equal(pairEnergy(a, {x: 0.9, y: 0, theta: 0}), Infinity);
});

test('force and both torques are negative finite-difference energy gradients', () => {
  const a = {x: 1.4, y: 2.1, theta: 0.73}, b = {x: 3.7, y: 4.9, theta: 2.12};
  const analytic = pairForceTorque(a, b, 2.3), h = 1e-5;
  for (const [particle, axis, answer] of [[a, 'x', analytic.fx], [a, 'y', analytic.fy], [a, 'theta', analytic.torqueA], [b, 'theta', analytic.torqueB]]) {
    const original = particle[axis];
    particle[axis] = original + h; const plus = pairEnergy(a, b, 2.3);
    particle[axis] = original - h; const minus = pairEnergy(a, b, 2.3);
    particle[axis] = original;
    close(answer, -(plus - minus) / (2 * h));
  }
});

test('pair swap, translation, and global rotation symmetries', () => {
  const a = {x: 1, y: 2, theta: 0.4}, b = {x: 4, y: 3, theta: -0.8};
  close(pairEnergy(a, b), pairEnergy(b, a));
  const ab = pairForceTorque(a, b), ba = pairForceTorque(b, a);
  close(ab.fx, -ba.fx); close(ab.fy, -ba.fy);
  close(ab.torqueA, ba.torqueB); close(ab.torqueB, ba.torqueA);
  const alpha = 1.37;
  const transform = p => ({x: 7 + p.x * Math.cos(alpha) - p.y * Math.sin(alpha), y: 4 + p.x * Math.sin(alpha) + p.y * Math.cos(alpha), theta: p.theta + alpha});
  close(pairEnergy(a, b), pairEnergy(transform(a), transform(b)));
});

test('closed partition forbids even long jumps; opening preserves hard cores and walls', () => {
  for (const mode of ['ideal_AB', 'dipole_AB']) {
    const sim = new Simulation({mode, nPerSide: 16, seed: 'geometry', stepSize: 30});
    for (let k = 0; k < 10; k++) { sim.sweep(20); assertGeometry(sim); }
    assert.equal(sim.metrics().mixingPerParticle, 0);
    sim.setPartition(true);
    for (let k = 0; k < 10; k++) { sim.sweep(20); assertGeometry(sim); }
    assert.throws(() => sim.setPartition(false), /reset/);
    assert.equal(sim.particles.length, 32);
  }
});

test('same seed reproduces paths, and changing informational species labels changes no path', () => {
  for (const family of ['ideal', 'dipole']) {
    const config = {mode: `${family}_AA`, nPerSide: 12, seed: 'same-path'};
    const aa = new Simulation(config), duplicate = new Simulation(config);
    const ab = new Simulation({...config, mode: `${family}_AB`});
    for (const sim of [aa, duplicate, ab]) { sim.sweep(50); sim.setPartition(true); sim.sweep(150); }
    assert.deepEqual(aa.snapshot(), duplicate.snapshot());
    const positions = sim => sim.particles.map(({x, y, theta, origin}) => ({x, y, theta, origin}));
    assert.deepEqual(positions(aa), positions(ab));
    assert.equal(aa.energy, ab.energy);
    assert.equal(aa.metrics().thermoMixTotal, 0);
    close(ab.metrics().thermoMixTotal, 24 * Math.LN2);
  }
});

test('energy cache agrees with complete pair sum; ideal energy stays zero', () => {
  for (const mode of ['ideal_AB', 'dipole_AB']) {
    const sim = new Simulation({mode, seed: 'energy'});
    sim.sweep(100); sim.setPartition(true);
    for (let i = 0; i < 10; i++) {
      sim.sweep(30);
      close(sim.energy, sim.totalEnergy(), 1e-8);
      assert.ok(Number.isFinite(sim.energy));
      if (mode === 'ideal_AB') assert.equal(sim.energy, 0);
    }
  }
});

test('Shannon diagnostic has correct limits and all metric populations sum to N', () => {
  close(binaryEntropy(0.5), Math.LN2);
  assert.equal(binaryEntropy(0), 0); assert.equal(binaryEntropy(1), 0);
  for (const mode of ['ideal_AA', 'ideal_AB', 'dipole_AA', 'dipole_AB']) {
    const sim = new Simulation({mode, nPerSide: 15, seed: 'metrics'});
    assert.equal(sim.metrics().mixingPerParticle, 0);
    sim.setPartition(true);
    for (let k = 0; k < 8; k++) {
      sim.sweep(20);
      const m = sim.metrics();
      assert.equal(m.nAL + m.nAR + m.nBL + m.nBR, m.totalN);
      assert.ok(m.mixingPerParticle >= 0 && m.mixingPerParticle <= Math.LN2 + 1e-15);
      assert.ok(m.acceptance >= 0 && m.acceptance <= 1);
    }
  }
});

test('free points sample both half-boxes at equal probability after mixing', () => {
  const sim = new Simulation({mode: 'ideal_AB', nPerSide: 40, seed: 'uniform-equilibrium', stepSize: 4});
  sim.setPartition(true); sim.sweep(1000);
  let totalLeft = 0, totalOriginLeft = 0, totalOriginRight = 0, samples = 0;
  for (let k = 0; k < 500; k++) {
    sim.sweep(10);
    const m = sim.metrics();
    totalLeft += m.nAL + m.nBL;
    totalOriginLeft += m.originLeftL;
    totalOriginRight += m.originRightL;
    samples++;
  }
  close(totalLeft / (samples * 80), 0.5, 0.025);
  close(totalOriginLeft / (samples * 40), 0.5, 0.035);
  close(totalOriginRight / (samples * 40), 0.5, 0.035);
});

test('dipoles interact across a nonmagnetic partition, while label swaps do not affect energy', () => {
  const sim = new Simulation({mode: 'dipole_AB', nPerSide: 1});
  sim.particles = [{x: 11.4, y: 7, theta: 0, species: 0, origin: 0}, {x: 12.6, y: 7, theta: 0, species: 1, origin: 1}];
  assert.ok(sim.totalEnergy() < 0);
  const energy = sim.totalEnergy();
  sim.particles.forEach(p => {p.species = 1 - p.species;});
  assert.equal(sim.totalEnergy(), energy);
});

test('reset re-prepares the initial state; snapshots are independent copies', () => {
  const sim = new Simulation({mode: 'dipole_AB', seed: 123});
  const initial = sim.snapshot();
  sim.setPartition(true); sim.sweep(5); sim.reset();
  assert.deepEqual(sim.snapshot(), initial);
  const copy = sim.snapshot(); copy.particles[0].x = -99; copy.config.temp = -99;
  assert.notEqual(sim.particles[0].x, -99); assert.notEqual(sim.config.temp, -99);
  assert.throws(() => sim.sweep(0.5));
  assert.throws(() => new Simulation({temp: 0}));
});
