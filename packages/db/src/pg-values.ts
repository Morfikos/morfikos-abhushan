function asIsoDateTime(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid timestamp from database.");
  }

  return parsed.toISOString();
}

function asBusinessDate(value: Date | string): string {
  if (typeof value === "string") {
    // Postgres DATE and ISO strings: take the calendar prefix only.
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid business date from database.");
    }
    return asBusinessDate(parsed);
  }

  // node-pg may expose DATE as a Date at UTC midnight or at local midnight.
  // Prefer the UTC calendar day when the time is exactly UTC midnight; otherwise
  // use local calendar components so IST shifts do not move the shop date back.
  const isUtcMidnight =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0;
  if (isUtcMidnight) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asDecimalString(value: string | number): string {
  return typeof value === "number" ? value.toString() : value;
}

function asLocalTime(value: string): string {
  return value.length >= 5 ? value.slice(0, 8) : value;
}

export { asBusinessDate, asDecimalString, asIsoDateTime, asLocalTime };
