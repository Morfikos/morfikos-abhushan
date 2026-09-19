# Untitled UI import notes

Source: https://github.com/untitleduico/react  
Pinned commit: `c981a73bcd6b6c68d2a54070f20f020191212828`  
License: MIT (see `apps/web/components/base/LICENSE`)  
Setup path: official free Next.js integration, default purple brand (`brand`), Inter via `--font-inter`.  
No PRO CLI, paid registry, or premium page templates were used.

Copied for spec 01 only as needed:

- `apps/web/components/base/buttons/button.tsx`
- `apps/web/utils/cx.ts`
- `apps/web/utils/is-react-component.ts`
- `apps/web/styles/theme.css`
- `apps/web/styles/typography.css`

Treat copied Base files as vendor code after this import. Prefer composition and local feature/shared components for application screens.

Cursor MCP (free components only): `.cursor/mcp.json` points at `https://www.untitledui.com/react/api/mcp` with no auth header, following [Untitled UI MCP integration](https://www.untitledui.com/react/integrations/mcp). Enable the `untitledui` server in Cursor Settings → MCP if it does not appear after a reload. Do not add a PRO API key. The official CLI init (`npx untitledui init`) was not run; later `npx untitledui add` installs need an explicit, free-only decision so they do not replace this pinned import.

Documented patches (20 September 2026):

- `apps/web/utils/is-react-component.ts` now identity-compares `$$typeof` to `Symbol.for("react.forward_ref")`. The upstream `Symbol.prototype.toString()` string match is not a stable identity check and throws when `$$typeof` is missing.
- `apps/web/components/base/buttons/button.tsx` uses `import { isValidElement, type FC, type ReactElement, type ReactNode } from "react"` (no default `React` import). `@types/react` is `export =` and has no ESM default export.
- `apps/web/utils/is-react-component.ts` uses `import type * as React from "react"` for the same reason.

Documented exception: `apps/web/tsconfig.json` leaves `exactOptionalPropertyTypes` off because the copied `button.tsx` is incompatible with that flag. Packages, API, and worker keep the workspace-strict flags. No runtime or style change to the vendor button.
