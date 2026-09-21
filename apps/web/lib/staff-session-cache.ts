import { currentStaffSchema, type CurrentStaff } from "@aabhushan/contracts";

const STAFF_ME_SESSION_KEY = "aabhushan:staff-me";

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function readStaffSessionCache(): CurrentStaff | null {
  if (!canUseSessionStorage()) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STAFF_ME_SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = currentStaffSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      window.sessionStorage.removeItem(STAFF_ME_SESSION_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    window.sessionStorage.removeItem(STAFF_ME_SESSION_KEY);
    return null;
  }
}

export function writeStaffSessionCache(staff: CurrentStaff): void {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.setItem(STAFF_ME_SESSION_KEY, JSON.stringify(staff));
  } catch {
    // Quota / private mode — ignore; live fetch still works.
  }
}

export function clearStaffSessionCache(): void {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.removeItem(STAFF_ME_SESSION_KEY);
  } catch {
    // ignore
  }
}
