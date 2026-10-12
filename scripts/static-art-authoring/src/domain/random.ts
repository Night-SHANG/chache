import { xoroshiro128plus, uniformIntDistribution } from 'pure-rand';
/** All random state is explicit and portable; no Math.random or platform entropy. */
export function createRandomState(seed: number): number[] {
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer');
  return [...xoroshiro128plus(seed | 0).getState()];
}
export function nextRandom(state: number[], min: number, max: number): {value: number; state: number[]} {
  const [value, rng] = uniformIntDistribution(min, max, xoroshiro128plus.fromState(state));
  return { value, state: [...rng.getState()] };
}
