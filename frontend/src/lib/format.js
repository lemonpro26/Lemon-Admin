// Uniform US phone display: any input -> "(760) 910-8655".
// Strips a leading country code (1). If it isn't a clean 10-digit US number,
// the original value is returned unchanged so nothing is lost.
export function formatPhone(value) {
  if (!value) return value || '';
  let d = String(value).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return String(value);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
