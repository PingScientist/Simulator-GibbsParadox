/*
 * Canonical Metropolis sampling for a two-dimensional Gibbs mixing experiment.
 * One sweep is N attempted moves, NOT a physical time interval. This is neither
 * inertial molecular dynamics nor Brownian dynamics. Species/origin labels never
 * enter the Hamiltonian or the acceptance probability.
 *
 * Reduced units: k_B = 1, dipolar hard-core diameter = 1, box = 24 x 14.
 * Ideal particles are points, with U = 0. Dipoles are planar unit directions with
 * U_ij = C / r^3 [u_i.u_j - 3 (u_i.rhat)(u_j.rhat)], outside the hard core.
 * All pairs are included. There is NO cutoff: in 2D, the r^-3 tail is integrable.
 * A nonmagnetic partition prevents crossing but does not screen dipole energy.
 */
(function attachPhysics(root) {
  'use strict';

  const BOX_WIDTH = 24;
  const BOX_HEIGHT = 14;
  const TWO_PI = 2 * Math.PI;
  const MODES = ['ideal_AA', 'ideal_AB', 'dipole_AA', 'dipole_AB'];

  class SeededRNG {
    constructor(seed = 2026) {
      const text = String(seed);
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
      }
      this.state = hash >>> 0;
    }
    next() {
      let value = this.state = (this.state + 0x6D2B79F5) >>> 0;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }
  }

  function binaryEntropy(p) {
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('p must be in [0, 1].');
    return p === 0 || p === 1 ? 0 : -p * Math.log(p) - (1 - p) * Math.log1p(-p);
  }

  function pairEnergy(a, b, coupling = 1, sigma = 1) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < sigma * sigma) return Infinity;
    if (coupling === 0) return 0;
    if (r2 === 0) return Infinity;
    const r = Math.sqrt(r2);
    const ax = Math.cos(a.theta), ay = Math.sin(a.theta);
    const bx = Math.cos(b.theta), by = Math.sin(b.theta);
    const ar = (ax * dx + ay * dy) / r;
    const br = (bx * dx + by * dy) / r;
    return coupling * (ax * bx + ay * by - 3 * ar * br) / (r2 * r);
  }

  // Smooth dipole derivatives only, valid outside contact. The hard-core force
  // is not represented by a finite force; Metropolis rejects overlaps instead.
  // fx,fy are the force on a; the force on b is its negative.
  function pairForceTorque(a, b, coupling = 1) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const r2 = dx * dx + dy * dy;
    if (r2 === 0) throw new RangeError('Dipole derivatives are undefined at r = 0.');
    const r = Math.sqrt(r2), rx = dx / r, ry = dy / r;
    const ax = Math.cos(a.theta), ay = Math.sin(a.theta);
    const bx = Math.cos(b.theta), by = Math.sin(b.theta);
    const dot = ax * bx + ay * by;
    const ar = ax * rx + ay * ry, br = bx * rx + by * ry;
    const factor = -3 * coupling / (r2 * r2);
    const energyFactor = coupling / (r2 * r);
    return {
      fx: factor * ((dot - 5 * ar * br) * rx + ar * bx + br * ax),
      fy: factor * ((dot - 5 * ar * br) * ry + ar * by + br * ay),
      torqueA: energyFactor * (-(ax * by - ay * bx) + 3 * (ax * ry - ay * rx) * br),
      torqueB: energyFactor * (-(bx * ay - by * ax) + 3 * (bx * ry - by * rx) * ar)
    };
  }

  class Simulation {
    constructor(config = {}) {
      this.reset(config);
    }

    reset(overrides = {}) {
      const config = Object.assign({
        mode: 'ideal_AB', nPerSide: 24, temp: 1, coupling: 1.5,
        seed: 2026, stepSize: 1, angleStep: 0.6
      }, this.config || {}, overrides);
      if (!MODES.includes(config.mode)) throw new RangeError('Unknown simulation mode.');
      if (!Number.isInteger(config.nPerSide) || config.nPerSide < 1 || config.nPerSide > 120) {
        throw new RangeError('nPerSide must be an integer from 1 to 120.');
      }
      for (const key of ['temp', 'stepSize', 'angleStep']) {
        if (!Number.isFinite(config[key]) || config[key] <= 0) throw new RangeError(`${key} must be positive.`);
      }
      if (!Number.isFinite(config.coupling) || config.coupling < 0) throw new RangeError('coupling must be nonnegative.');
      this.config = config;
      this.width = BOX_WIDTH;
      this.height = BOX_HEIGHT;
      this.isDipole = config.mode.startsWith('dipole');
      this.isDistinct = config.mode.endsWith('AB');
      this.radius = this.isDipole ? 0.5 : 0;
      this.rng = new SeededRNG(config.seed);
      this.partitionOpen = false;
      this.sweeps = 0;
      this.attempts = 0;
      this.accepted = 0;
      this.particles = [];
      this._initialize();
      this.energy = this.totalEnergy();
      return this;
    }

    _initialize() {
      const r = this.radius, half = this.width / 2;
      for (let origin = 0; origin < 2; origin++) {
        const minX = origin === 0 ? r : half + r;
        const maxX = origin === 0 ? half - r : this.width - r;
        for (let k = 0; k < this.config.nPerSide; k++) {
          let placed = false;
          for (let attempt = 0; attempt < 200000; attempt++) {
            const particle = {
              x: minX + (maxX - minX) * this.rng.next(),
              y: r + (this.height - 2 * r) * this.rng.next(),
              theta: TWO_PI * this.rng.next(), origin,
              species: this.isDistinct ? origin : 0
            };
            if (!this.isDipole || this.particles.every(other =>
              (particle.x - other.x) ** 2 + (particle.y - other.y) ** 2 >= 1)) {
              this.particles.push(particle);
              placed = true;
              break;
            }
          }
          if (!placed) throw new Error('Could not place hard disks without overlap; reduce particle count.');
        }
      }
      // Rejection placement avoids overlap; it is not an equilibrium sample.
      // Use closed-partition burn-in before collecting equilibrium comparisons.
    }

    setPartition(open = true) {
      if (typeof open !== 'boolean') throw new TypeError('Partition state must be boolean.');
      if (!open && this.partitionOpen) {
        throw new Error('Use reset() to prepare separated gases again. Inserting a partition does not unmix them.');
      }
      this.partitionOpen = open;
      return this;
    }

    _insideWalls(proposal, current) {
      const r = this.radius, half = this.width / 2;
      if (proposal.x < r || proposal.x > this.width - r || proposal.y < r || proposal.y > this.height - r) return false;
      if (!this.partitionOpen) {
        // Check the current chamber, not just the final overlap with the wall:
        // even proposals long enough to jump entirely over the wall are rejected.
        if (current.x < half && proposal.x >= half - r) return false;
        if (current.x >= half && proposal.x <= half + r) return false;
      }
      return true;
    }

    _localEnergy(proposal, index) {
      if (!this.isDipole) return 0;
      let sum = 0;
      for (let j = 0; j < this.particles.length; j++) {
        if (j === index) continue;
        const energy = pairEnergy(proposal, this.particles[j], this.config.coupling);
        if (!Number.isFinite(energy)) return Infinity;
        sum += energy;
      }
      return sum;
    }

    totalEnergy() {
      if (!this.isDipole) return 0;
      let sum = 0;
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          sum += pairEnergy(this.particles[i], this.particles[j], this.config.coupling);
        }
      }
      return sum;
    }

    sweep(count = 1) {
      if (!Number.isInteger(count) || count < 0) throw new RangeError('Sweep count must be a nonnegative integer.');
      const total = this.particles.length;
      const {stepSize, angleStep, temp} = this.config;
      for (let s = 0; s < count; s++) {
        for (let trial = 0; trial < total; trial++) {
          const index = Math.floor(this.rng.next() * total);
          const current = this.particles[index];
          const proposal = {
            x: current.x + (2 * this.rng.next() - 1) * stepSize,
            y: current.y + (2 * this.rng.next() - 1) * stepSize,
            theta: (current.theta + (2 * this.rng.next() - 1) * angleStep + TWO_PI) % TWO_PI,
            origin: current.origin, species: current.species
          };
          this.attempts++;
          if (!this._insideWalls(proposal, current)) continue;
          const proposedEnergy = this._localEnergy(proposal, index);
          if (!Number.isFinite(proposedEnergy)) continue;
          const deltaEnergy = proposedEnergy - this._localEnergy(current, index);
          // Symmetric proposals + Metropolis acceptance satisfy detailed balance
          // for exp(-U/T) within the allowed hard-wall/hard-core configuration set.
          if (deltaEnergy <= 0 || this.rng.next() < Math.exp(-deltaEnergy / temp)) {
            this.particles[index] = proposal;
            this.energy += deltaEnergy;
            this.accepted++;
          }
        }
        this.sweeps++;
      }
      return this;
    }

    metrics() {
      const half = this.width / 2;
      let nAL = 0, nAR = 0, nBL = 0, nBR = 0, originLeftL = 0, originRightL = 0;
      for (const p of this.particles) {
        const left = p.x < half;
        if (p.species === 0) { if (left) nAL++; else nAR++; }
        else { if (left) nBL++; else nBR++; }
        if (left) { if (p.origin === 0) originLeftL++; else originRightL++; }
      }
      const n = this.config.nPerSide, totalN = this.particles.length;
      // This origin-tracer Shannon statistic is a coarse mixing diagnostic,
      // including for A+A. It is NOT a measurement of thermodynamic entropy.
      const mixingPerParticle = (binaryEntropy(originLeftL / n) + binaryEntropy(originRightL / n)) / 2;
      return {
        sweeps: this.sweeps, totalN, nAL, nAR, nBL, nBR,
        originLeftL, originRightL, mixingPerParticle,
        // Bulk thermodynamic-limit reference for equal initial density and T.
        // Hard-wall/finite-size changes and correlations are not measured by it.
        thermoMixTotal: this.isDistinct ? totalN * Math.LN2 : 0,
        energy: this.energy, energyPerParticle: this.energy / totalN,
        acceptance: this.attempts ? this.accepted / this.attempts : 0,
        partitionOpen: this.partitionOpen
      };
    }

    snapshot() {
      return {
        config: Object.assign({}, this.config), width: this.width, height: this.height,
        particles: this.particles.map(p => Object.assign({}, p)),
        metrics: this.metrics(), rngState: this.rng.state
      };
    }
  }

  const api = {Simulation, pairEnergy, pairForceTorque, binaryEntropy, SeededRNG, BOX_WIDTH, BOX_HEIGHT};
  root.GibbsPhysics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
