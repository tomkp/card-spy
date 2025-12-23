# Unified Code Guidelines (for LLM-Generated & Human-Maintained Codebases)

---

## Usage Priorities (apply in order)

- Correctness first; code must handle all valid inputs and fail clearly on invalid ones.
- Clarity/readability over cleverness; optimize for maintainability.
- Testability: design for easy isolation, automation, and fast feedback loops.
- Performance last; measure before optimizing.

---

## Core Architecture & Design

- Prefer pure functions (no hidden state/side effects) where practical; improves reasoning & testability.
- Group logic by business/domain, not just technical layer; keeps related behavior together.
- Apply dependency inversion (ports/adapters; inject deps; depend on abstractions).
- Single Responsibility: one reason to change per module/class/function.
- Composition over inheritance; prefer small composable units.
- Immutability by default; reduces bugs from unintended mutation.
- Explicit > implicit (explicit params, no hidden globals, avoid magic values).
- Open/Closed: expose extension points but avoid premature abstraction; pragmatism over dogma.
- Follow data flow; keep variables scoped tightly; order code to mirror logical processing.
- Use positive logic and intent-revealing names; avoid negation chains and generic suffixes.
- Comment _why_ (intent, business rule, perf workaround), not _what_; remove noise comments.
- Fail fast at boundaries with specific errors/guard clauses.
- Boy Scout Rule: leave code healthier than you found it.

---

## TypeScript Philosophy & Practices

- Make illegal states unrepresentable via discriminated unions / domain types.
- Let the type system document domain intent; types should tell the story.
- Prefer unions or literal object patterns over enums unless interop, tooling, or perf requires enums.
- Favor type inference; minimal assertions (`as`) — if asserting, reconsider model.
- Think in sets: understand widening/narrowing & exhaustiveness checking.
- Use branded types sparingly for opaque domain IDs when confusion risk is high.
- Provide type predicates / user-defined guards for complex runtime checks.
- Template literal types for structured strings (routes, keys) where it improves safety.
- Use `satisfies` to preserve literal information in objects without widening.
- Prefer `readonly` and immutable patterns; pair with general immutability principle.
- Avoid `any`
- Avoid overly broad types (`Function`, `{}`); use precise signatures or `Record<string,unknown>`.
- Guard against excess property bugs; prefer `as const` for config objects when literals matter.
- File naming: kebab-case (`foo-bar.ts`); keep consistent across code + tests.
- Limit or curate barrel exports; explicit imports aid tree-shaking & clarity.

---

## React + TypeScript Patterns

- Prefer function components with typed props; avoid unnecessary class components.
- Minimize component local state; treat UI layer as a projection of data.
- Colocate state where used; lift only to share.
- Derive state during render instead of duplicating derived values in state.
- Use refs for non-reactive data (config, imperatives) rather than state.
- Minimize `useEffect`; reserve for external side effects (subscriptions, DOM, timers) and document why.
- Always include correct effect dependency lists; avoid stale closures.
- Prefer data-fetching utilities (React Query, SWR, or app abstraction) instead of ad-hoc effects for async requests.
- Avoid premature `useMemo` / `useCallback`; use only for measured perf or referential stability.
- Build reusable custom hooks (prefix `use*`) with predictable return shapes.
- Extract complex conditionals into subcomponents; keep JSX flat & readable.
- Provide error boundaries around major subtrees; surface graceful fallback UI.
- Centralize form patterns using a form library + schema validation (e.g., React Hook Form + Zod or equivalent).
- Use consistent Tailwind class ordering & variant helpers; keep styling predictable.
- Ensure accessibility: ARIA labels/roles, keyboard navigation, focus management.
- Lazy-load heavy routes/features; avoid splitting trivial components.
- Document exceptional timer usage (`setTimeout`, intervals) and race-condition workarounds.

---

## Electron Best Practices

### Process Architecture
- Respect the process boundary: main process for system access, renderer for UI.
- Never enable `nodeIntegration` in renderer; always use `contextIsolation: true`.
- Treat the renderer as untrusted; validate all IPC inputs in the main process.

### Preload Scripts
- Keep preload scripts minimal; expose only what the renderer needs.
- Use `contextBridge.exposeInMainWorld` to create a typed, narrow API surface.
- Define shared TypeScript interfaces for the exposed API; import in both preload and renderer.
- Return Promises from exposed methods; avoid exposing raw `ipcRenderer`.

### IPC Communication
- Use `ipcMain.handle` / `ipcRenderer.invoke` for request-response patterns (async, Promise-based).
- Use `ipcMain.on` / `webContents.send` for main-to-renderer push events (subscriptions, real-time updates).
- Name channels descriptively with consistent conventions (e.g., `get-devices`, `card-inserted`).
- Keep IPC payloads serializable (no functions, classes, or circular references).
- Type all IPC channels and payloads; consider a shared channel registry type.

### Lifecycle & Cleanup
- Handle `before-quit` and `window-all-closed` for graceful shutdown.
- Clean up IPC handlers, native resources, and subscriptions on quit.
- On macOS, respect platform conventions (app stays alive when windows close).
- Set window references to `null` on `closed` to avoid memory leaks.

### Security
- Never use `shell.openExternal` with untrusted URLs; validate protocols.
- Avoid `eval`, `new Function`, or loading remote scripts in renderer.
- Use `safeStorage` for sensitive data; never store secrets in plain config files.
- Keep Electron updated; security patches are frequent.

### Native Modules & Dependencies
- Rebuild native modules for Electron's Node version (`electron-rebuild`).
- Isolate native module access to main process; expose via IPC if renderer needs it.
- Handle native module errors gracefully; not all platforms support all features.

### Development & Debugging
- Use separate Vite/Webpack configs for main, preload, and renderer.
- Enable DevTools in development; disable or gate in production.
- Use `electron-log` or similar for persistent main process logging.
- Test on all target platforms early; behavior varies across macOS/Windows/Linux.

---

## Testing Strategy

- Test behavior / observable outcomes, not internal implementation details.
- Mock only external/architectural boundaries (network, DB, filesystem, time).
- Prefer verifying end state over verifying interactions (spy only when interaction _is_ the behavior).
- Use the simplest appropriate test double: stub → fake → mock (last resort).
- Write DAMP tests: descriptive, story-telling names; duplication acceptable for clarity.
- Keep end-to-end UI tests minimal — one per critical user journey; rely on lower-level tests for breadth.
- Co-locate tests with source _when it improves discoverability_; allow centralized test dirs in large monorepos.
- Component tests should interact via the UI (labels, roles) to reflect user behavior.

---

## Continuous Delivery & Automation

- Work in small batches; commit often; use feature flags / branch by abstraction for large work.
- Automate build, typecheck, lint, format, test, and deploy for consistency.
- Build quality in from the start: code review, TDD where useful, automated quality gates.

---

## Refactoring & Maintenance

- Make small, safe, reversible refactors; run tests after each step.
- Make the change easy (prepare), then make the easy change (implement feature).
- Continuously clean up (Boy Scout) — remove dead code, obsolete comments, unused deps.
- Optimize only after measurement; clear code often performs well enough.

---

## Error Handling

- Use structured errors/exceptions (or result types) for exceptional cases; include actionable context.
- Fail fast; validate inputs at boundaries; escalate meaningful messages.
- Surface user-facing fallbacks via error boundaries & form-level error reporting.

---

## Performance

- Measure before optimizing (profilers, render counts, bundle size).
- Memoize expensive computations or stabilize props only when profiling shows benefit.
- Use code splitting / lazy loading for large routes & heavy libs; avoid micro-splits.
- Favor readability; clear code usually fast enough.

---

## Documentation & Comments

- Document intent, domain context, non-obvious constraints, and performance hacks; omit obvious restatements.
- Record why `setTimeout`/intervals or other workarounds are required (race conditions, sequencing).
- Keep TODOs actionable (what, why, owner, date) to avoid rot.
- Remove clutter / redundant comments; trust the code & types.

---

## Unified Quick Checklist (for PRs & LLM Output Review)

- [ ] Follows Usage Priorities: correctness > clarity > testability > perf.
- [ ] Names reveal intent; positive logic; no magic values.
- [ ] Domain-oriented structure; SRP respected.
- [ ] Minimal side effects; effects isolated & documented.
- [ ] State colocated / derived; no redundant React state.
- [ ] `useEffect` only for real side effects; deps complete.
- [ ] No premature memoization; perf backed by measurement.
- [ ] Types express domain; illegal states unrepresentable; no loose `any`.
- [ ] Immutability respected (`readonly` / pure updates).
- [ ] Tests cover user behavior; mocks only at boundaries.
- [ ] Automated scripts run typecheck/lint/test/format in CI.
- [ ] Accessible UI (ARIA, keyboard, focus).
- [ ] Error handling surfaces meaningful feedback (UI + logs).
- [ ] Electron: `contextIsolation: true`, `nodeIntegration: false`.
- [ ] Electron: IPC inputs validated in main process; payloads serializable.
- [ ] Electron: Graceful shutdown with resource cleanup.

---
