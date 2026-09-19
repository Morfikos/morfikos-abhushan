export const PUBLIC_AUTH_PATHS = [
  "/login",
  "/invite/accept",
  "/auth/recovery",
  "/auth/recovery/confirm",
  "/auth/check-email",
  "/auth/expired",
  "/auth/callback",
  "/access-denied",
] as const;

export const PROTECTED_STAFF_PATHS = [
  "/dashboard",
  "/inventory",
  "/invoices",
  "/payments",
  "/customers",
  "/girvi",
  "/notifications",
  "/settings",
] as const;

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isProtectedStaffPath(pathname: string): boolean {
  return PROTECTED_STAFF_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const SIGNUP_PATHS = ["/signup", "/sign-up", "/register"] as const;

export function isPublicSelfSignupPath(pathname: string): boolean {
  return SIGNUP_PATHS.includes(pathname as (typeof SIGNUP_PATHS)[number]);
}
