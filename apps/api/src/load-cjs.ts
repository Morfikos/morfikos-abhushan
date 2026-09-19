import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function loadCjs<T>(moduleId: string): T {
  return require(moduleId) as T;
}
