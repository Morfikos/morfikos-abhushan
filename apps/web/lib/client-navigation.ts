/**
 * Same-origin app paths suitable for App Router soft navigation.
 * External, mailto, and hash-only targets stay on native / Aria link behavior.
 */
export function isSameOriginAppPath(href: string): boolean {
  if (!href.startsWith("/")) {
    return false;
  }
  if (href.startsWith("//")) {
    return false;
  }
  return true;
}
