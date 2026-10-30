/** A frequency in MHz, with as many decimals as its size deserves. */
export function fmtF(f: number): string {
  return f >= 100 ? f.toFixed(2) : f >= 1 ? f.toFixed(3) : f.toFixed(4);
}

/** A round axis step near `x`: 1, 2 or 5 times a power of ten. */
export function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
