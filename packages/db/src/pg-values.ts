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
    return value.slice(0, 10);
  }

  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asDecimalString(value: string | number): string {
  return typeof value === "number" ? value.toString() : value;
}

function asLocalTime(value: string): string {
  return value.length >= 5 ? value.slice(0, 8) : value;
}

export { asBusinessDate, asDecimalString, asIsoDateTime, asLocalTime };
