/** Coerces a stored setting value into a NumberField value, or undefined. */
export function toNumberFieldValue(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isNaN(value) ? undefined : value;
}
