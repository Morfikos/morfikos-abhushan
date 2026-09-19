# AI Workflow Rules

## Approach

Build Aabhooshad incrementally using a spec-driven workflow. Read the current project context and affected implementation before making changes. `project-overview.md` defines product scope, `architecture.md` defines boundaries and invariants, `code-standards.md` defines engineering conventions, and `ui-context.md` defines the presentation system. Use `progress-tracker.md`, when established, to record completed work, active work, verification, and unresolved questions. Never assume a planned feature is implemented merely because it appears in a document.

Implement the agreed Next.js frontend, independent Node.js/Express API, Supabase Auth/PostgreSQL, private file storage, and pg-boss worker architecture. Keep business rules in the shared backend for web and future mobile clients. Redis, microservices, offline financial posting, and additional product modules are not part of the MVP.

Use only free, publicly available Untitled UI components and their default styling as defined in the latest `ui-context.md`. This choice supersedes earlier shadcn/ui, Morfikos theme, and paid-template references in older documents. No paid license will be purchased. Build missing page compositions from approved free primitives; do not make premium components a dependency.

For each unit, identify its acceptance conditions, affected boundaries, data changes, and verification method. Implement the smallest complete behavior, verify it against the relevant requirements, and record the actual result. Complete authorized routine work without repeatedly asking for permission; seek a business decision only when a material requirement cannot be resolved from the current specifications.

## Scoping Rules

- Work on one coherent feature unit at a time, such as receiving an article, finalizing an invoice, recording a repayment, or dispatching a reminder.
- Prefer small, verifiable increments over speculative infrastructure, broad refactoring, or unrelated feature additions.
- A vertical slice may include its contract, database migration, API behavior, and UI when they jointly deliver one testable outcome. Do not treat every layer as an unrelated task.
- Keep the first release scoped to one business and one branch. Preserve organization-scoped access without building SaaS onboarding or multi-branch workflows prematurely.
- Preserve existing behavior and user changes outside the unit. Do not rewrite working modules merely to match a preferred coding style.
- Reuse shared calculation and application services. Never implement a second invoice or Girvi engine in a Next.js action, component, or worker.
- Keep financial posting synchronous and transactional; keep documents and external messaging asynchronous through the outbox and worker.
- Keep configuration changes, provider setup, and product development distinguishable. Creating a screen does not configure SMTP, WhatsApp, Supabase permissions, backups, or production hosting.
- Add dependencies only for a concrete requirement. Verify the exact component and its required assets are free before importing them; preserve applicable notices and record the upstream version.
- Do not silently expand scope with payment gateways, old-gold exchange, accounting, customer registration, promotional messaging, or complex Girvi renewals/top-ups.

## When to Split Work

Split an implementation step if it combines:

- Unrelated product workflows, such as stock receiving and Girvi settlement.
- A financial transaction change and a separate provider integration that can be implemented and verified independently.
- Multiple unrelated API routes or modules with different acceptance conditions.
- A destructive data migration and ordinary UI work that obscure separate deployment or recovery risks.
- A change to invoice or interest calculation policy and an unrelated visual redesign.
- A broad component-library migration and new business functionality.
- An unresolved business rule and otherwise well-defined development work.
- A refactor across many packages and a narrowly scoped bug fix that does not require that refactor.

Keep atomic business operations intact: invoice finalization must not be split into independently committed invoice, stock, and payment writes. Split the implementation plan, not the transaction's correctness guarantees.

If a change cannot be verified end to end within a focused review cycle, split it into smaller demonstrable increments. A document-only unit is verified for accuracy, consistency, and requested structure; it does not require an application build.

## Handling Missing Requirements

- Do not invent business behavior that is absent from the context files. Read the current authoritative document before relying on an older conversation or summary.
- Resolve contradictions using the user's latest explicit decision. Record the resolution in the relevant context file; do not quietly retain conflicting defaults. The free-only Untitled UI decision is already settled and must not be reopened as a purchase question.
- Record unresolved product decisions in `progress-tracker.md` with the affected unit, precise question, proposed recommendation, and whether the issue blocks implementation. If the tracker does not yet exist, create a minimal truthful record when beginning implementation rather than claiming it is current.
- Continue independent work while a decision is unresolved. Pause only the affected behavior when a wrong assumption could change financial results, permissions, customer communication, or data integrity.
- Obtain approved invoice examples before finalizing purity handling, making-charge bases, wastage, discounts, tax treatment, and rounding. Do not infer these rules from a UI mockup.
- Obtain actual Girvi examples before implementing rate period, day/month convention, minimum duration, allocation order, principal-reduction date, backdating, or settlement rules. Keep unsupported methods explicit rather than approximating them.
- Confirm printer dimensions and scanner behavior with hardware evidence. A print preview is not proof that a physical tag is readable or scannable.
- Treat WhatsApp account readiness, permitted templates, recipient consent, and provider eligibility as integration requirements. Do not simulate successful delivery or implement WhatsApp Web automation as a substitute.
- If a desired UI example is paid or its free source cannot be verified, exclude that example and build an original composition using approved free controls. Preserve the required workflow without copying gated source.
- Make routine implementation choices consistent with existing conventions without blocking on optional clarification. Record assumptions when they materially affect later work.

## Protected Files

Do not modify the following unless explicitly instructed:

- Copied upstream Untitled UI source under `apps/web/components/base/` and `apps/web/components/application/`, once imported and designated as vendor code. Prefer supported props, composition, and local feature/shared components. Required fixes or upgrades need an explicit task, a minimal documented patch, and retained source/license history.
- Third-party library internals, installed packages, and `node_modules/`. Never patch dependencies directly as a hidden workaround.
- Already-applied database migration files. Add a new reviewed migration instead of rewriting deployed history.
- Generated API clients or generated contract artifacts by hand. Update their authoritative definitions and regenerate through the project's documented command.
- Production secrets, credential files, live customer exports, backup archives, and production data. Do not print, commit, overwrite, or remove them during unrelated development work.
- Finalized invoices, posted payments, stock history, Girvi financial events, and release evidence through ad hoc SQL or maintenance scripts. Corrections must use the authorized business workflow and preserve the original record.

These protections do not prohibit adding approved free components, creating new migrations, regenerating derived files, updating application-owned theme configuration within the agreed defaults, or editing project documentation as required by the current task. Never bypass a protection by copying the same destructive operation into another file.

## Keeping Docs in Sync

Update the relevant context file whenever implementation changes:

- System architecture, process boundaries, API ownership, or deployment assumptions — update `architecture.md` and the detailed architecture document if affected.
- Storage models, constraints, transaction behavior, or access policies — update the relevant database/API specification when present and the architecture invariants.
- Code conventions, package responsibilities, or engineering standards — update `code-standards.md`.
- UI library selection, free-source eligibility, theme tokens, component composition, or page patterns — update `ui-context.md`. Keep the seven existing top-level sections when revising this template-based document.
- Feature scope or acceptance conditions — update `project-overview.md` and affected feature specifications.
- Completed work, in-progress work, open questions, blockers, and verification evidence — update `progress-tracker.md`.

Separate proposed decisions from confirmed decisions and implemented behavior. Record verification commands and outcomes accurately; do not mark a unit complete when its test was skipped, its provider was mocked, or required hardware validation remains outstanding.

When a change supersedes an older convention, reconcile the relevant documents within the authorized work and identify any remaining inconsistency. Do not use documentation edits to imply that code has already migrated. Never erase unresolved decisions or earlier evidence simply to make the tracker appear complete.

## Before Moving to the Next Unit

- The unit satisfies its defined acceptance conditions end to end, or is explicitly recorded as blocked/incomplete with the exact remaining dependency.
- No invariant in `architecture.md` was violated. Check authorization, organization scope, decimal arithmetic, historical snapshots, and transaction boundaries where relevant.
- Financial changes pass approved calculation fixtures and relevant real-PostgreSQL tests for locking, rollback, payment allocation, and idempotent retries. Worker changes cover the specific retry/crash/deduplication risks they introduce.
- UI changes use only approved free components, default Untitled UI styling, accessible controls, and real workflow states. Check loading, empty, validation, failure, and keyboard behavior for the changed screen.
- Run the meaningful checks for the affected code: lint, type checking, focused tests, and the applicable application/package build. For a repository-wide or release change, run the workspace build (`pnpm build` if that script is defined). Use actual repository scripts; do not invent passing commands. Document-only edits need consistency/structure verification rather than a build.
- Review migrations and deployment implications where applicable. Before launch, complete the independent backup restore drill, required provider checks, and actual scanner/printer validation; track these separately from routine unit tests.
- `progress-tracker.md` reflects what was implemented and verified, and relevant context files match the resulting decisions. Do not mark unperformed work as complete.
- Review the final diff for unrelated edits, secrets, generated-file drift, paid dependencies, and accidental changes to protected files. Stop optional testing once the unit's concrete risks are sufficiently covered.

Report the outcome concisely: what changed, why, how it was verified, and any real remaining limitation. Then proceed to the next authorized unit without introducing an unnecessary approval step.
