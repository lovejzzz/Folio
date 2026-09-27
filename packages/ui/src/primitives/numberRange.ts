/** Would a number field keep what was typed as it is? Out of range or too precise, it gets changed on commit. */
export function fitsRange(typed: string, min: number, max: number, fractionDigits = 0): boolean {
  const text = typed.trim().replace(',', '.');
  if (!text) return true;
  const n = Number(text);
  return Number.isFinite(n) && n >= min && n <= max && Number(n.toFixed(fractionDigits)) === n;
}
