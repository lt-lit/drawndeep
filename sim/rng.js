// Seeded PRNG (mulberry32). Pure: same seed in -> same value out.
// Reducer threads `seed` through state; never call Math.random() in /sim.

export function nextRandom(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { seed: t, value };
}

export function nextInt(seed, max) {
  const r = nextRandom(seed);
  return { seed: r.seed, value: Math.floor(r.value * max) };
}

export function nextRange(seed, min, max) {
  const r = nextRandom(seed);
  return { seed: r.seed, value: min + r.value * (max - min) };
}
