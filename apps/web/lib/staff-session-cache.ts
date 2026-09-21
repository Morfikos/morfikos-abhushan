import { currentStaffSchema, type CurrentStaff } from "@aabhushan/contracts";

const STAFF_ME_SESSION_KEY = "aabhushan:staff-me";
/** Cross-tab fallback so print routes opened with target=_blank can hydrate immediately. */
const STAFF_ME_LOCAL_KEY = "aabhushan:staff-me:v1";

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function parseStaffSnapshot(raw: string | null, remove: () => void): CurrentStaff | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = currentStaffSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      remove();
      return null;
    }
    return parsed.data;
  } catch {
    remove();
    return null;
  }
}

function readLocalStaffCache(): CurrentStaff | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  try {
    return parseStaffSnapshot(window.localStorage.getItem(STAFF_ME_LOCAL_KEY), () => {
      window.localStorage.removeItem(STAFF_ME_LOCAL_KEY);
    });
  } catch {
    try {
      window.localStorage.removeItem(STAFF_ME_LOCAL_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

function writeLocalStaffCache(staff: CurrentStaff): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(STAFF_ME_LOCAL_KEY, JSON.stringify(staff));
  } catch {
    // Quota / private mode — ignore.
  }
}

function writeSessionStaffCache(staff: CurrentStaff): void {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.setItem(STAFF_ME_SESSION_KEY, JSON.stringify(staff));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function readStaffSessionCache(): CurrentStaff | null {
  if (canUseSessionStorage()) {
    try {
      const fromSession = parseStaffSnapshot(window.sessionStorage.getItem(STAFF_ME_SESSION_KEY), () => {
        window.sessionStorage.removeItem(STAFF_ME_SESSION_KEY);
      });
      if (fromSession) {
        // Keep cross-tab local snapshot warm when this tab already has session data.
        writeLocalStaffCache(fromSession);
        return fromSession;
      }
    } catch {
      try {
        window.sessionStorage.removeItem(STAFF_ME_SESSION_KEY);
      } catch {
        // ignore
      }
    }
  }

  const fromLocal = readLocalStaffCache();
  if (fromLocal) {
    writeSessionStaffCache(fromLocal);
    return fromLocal;
  }
  return null;
}

export function writeStaffSessionCache(staff: CurrentStaff): void {
  writeSessionStaffCache(staff);
  writeLocalStaffCache(staff);
}

export function clearStaffSessionCache(): void {
  if (canUseSessionStorage()) {
    try {
      window.sessionStorage.removeItem(STAFF_ME_SESSION_KEY);
    } catch {
      // ignore
    }
  }
  if (canUseLocalStorage()) {
    try {
      window.localStorage.removeItem(STAFF_ME_LOCAL_KEY);
    } catch {
      // ignore
    }
  }
}
