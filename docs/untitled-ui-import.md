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

Copied for spec 02 from the same commit, with required helpers:

- `apps/web/components/base/input/input.tsx`
- `apps/web/components/base/input/hint-text.tsx`
- `apps/web/components/base/input/label.tsx`
- `apps/web/components/base/tooltip/tooltip.tsx`

PIN input was not copied: the live Supabase invitation and recovery flow uses email links, not a verification-code endpoint. Demos, stories, and unused input variants were not copied.

Copied for spec 03 from the same commit, excluding demos, stories, and sample JSON:

- `apps/web/components/application/app-navigation/sidebar-navigation/sidebar-simple.tsx` and required `base-components` / `config.ts`
- `apps/web/components/application/table/table.tsx`
- `apps/web/components/application/pagination/pagination.tsx` and `pagination-base.tsx`
- `apps/web/components/application/date-picker/date-picker.tsx`, `calendar.tsx`, `cell.tsx`
- `apps/web/components/base/badges/`, `checkbox/`, `textarea/`, `select/` (including native select), `dropdown/`, `avatar/`, `button-group/`, `radio-buttons/`, `toggle/`
- `apps/web/hooks/use-breakpoint.ts`, `use-resize-observer.ts`
- `apps/web/components/foundations/dot-icon.tsx` and logo source (logo is not rendered)

Documented patches (20 September 2026):

- `sidebar-simple.tsx` and `mobile-header.tsx` render `AabhushanLogo` instead of `UntitledLogo`. The application identity is Aabhushan.
- `textarea.tsx` uses named `CSSProperties` instead of a default `React` import.
- `avatar/utils.ts` treats a missing first token as an empty initial so `noUncheckedIndexedAccess` type-checks.
- `use-resize-observer.ts` uses React `RefObject` instead of `@react-types/shared`.
- `nav-account-card.tsx` uses `AriaPopoverProps["placement"]` instead of `@react-types/overlays`.

Staff screens compose around `SidebarNavigationSimple` with permission-filtered items and `showAccountCard={false}`. Settings is an original local composition.

Cursor MCP (free components only): `.cursor/mcp.json` points at `https://www.untitledui.com/react/api/mcp` with no auth header, following [Untitled UI MCP integration](https://www.untitledui.com/react/integrations/mcp). Enable the `untitledui` server in Cursor Settings → MCP if it does not appear after a reload. Do not add a PRO API key. The official CLI init (`npx untitledui init`) was not run; later `npx untitledui add` installs need an explicit, free-only decision so they do not replace this pinned import.

Documented patches (20 September 2026):

- `apps/web/utils/is-react-component.ts` now identity-compares `$$typeof` to `Symbol.for("react.forward_ref")`. The upstream `Symbol.prototype.toString()` string match is not a stable identity check and throws when `$$typeof` is missing.
- `apps/web/components/base/buttons/button.tsx` uses `import { isValidElement, type FC, type ReactElement, type ReactNode } from "react"` (no default `React` import). `@types/react` is `export =` and has no ESM default export.
- `apps/web/utils/is-react-component.ts` uses `import type * as React from "react"` for the same reason.
- `apps/web/components/base/input/input.tsx` annotates RAC `className` render-prop callbacks with `GroupRenderProps` and `TextFieldRenderProps & { defaultClassName }`. Without those annotations, `noImplicitAny` treats destructured state (`isDisabled`, `isFocusWithin`, `isInvalid`) as `any`.

Documented exception: `apps/web/tsconfig.json` leaves `exactOptionalPropertyTypes` off because the copied `button.tsx` is incompatible with that flag. Packages, API, and worker keep the workspace-strict flags. No runtime or style change to the vendor button.
