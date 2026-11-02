# U Flow

Offline-first Public Forum (PF) debate app: a rebuttal bank, the speaker's own case, a flow grid, timers, crossfire notes and a summary/final-focus builder. React 19 + TypeScript + Vite, deployed to GitHub Pages as an installable PWA. No backend: everything lives in the browser's IndexedDB.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173/ (no service worker, so no offline/install in dev)
npm start          # production build + preview at http://localhost:4173/ (installable, offline)
npm run lint
npm run typecheck
npm test           # Vitest, jsdom + fake-indexeddb
npm run build
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build. Run all four before pushing. Every push to `main` deploys to `https://jupixels.github.io/uflow/` (`deploy.yml`).

## Layout

- `src/types.ts`: the data model (Resolution, Argument, BankResponse, Round, FlowRow, FlowCell, CxQuestion, CxEntry, Case, CaseSection, Review).
- `src/db.ts`: Dexie schema. **Never edit an existing `version(n)` block.** Add `version(n+1)` with only the changed or new tables.
- `src/lib/`: pure logic and all DB writes. Components call these and never write to `db` directly.
  - `repo.ts`: CRUD and cascades (deleting a resolution, argument, round, case or section also deletes what hangs off it).
  - `speeches.ts`: PF speech order, timings, default hidden columns. `labels.ts`: Pro/Con vs Aff/Neg display names.
  - `flashcards.ts`: Leitner scheduling (`rate`), study queue and deck counts for the Practice tab.
  - `explain.ts`: which inserted bank responses are still in a cell's text (by tag, tolerant of small edits) and which one is on the caret line, for the explanations panel.
  - `summary.ts`: speech-builder analysis and outline. `caseTime.ts`: word counts and time estimates.
  - `data.ts`: JSON export/import. `timer.ts`: clocks. `search.ts`: Fuse search. `cardParser.ts`: paste-a-card splitting.
  - `theme.ts`, `install.ts`, `update.ts`: accent color wheel, PWA install prompt, auto-update rule.
- `src/store.ts`: Zustand UI state (settings, selection, timers, side panel), persisted to localStorage, plus toasts and `confirmAction()`.
- `src/components/`: one file per screen or panel (`BankView`, `CaseView`, `PracticeView`, `RoundsView`, `FlowView`, `CrossfirePanel`, `SummaryPanel`, `ExplainPanel`, `ReadingMode`, `SettingsPanel`). Shared pieces live in `ui.tsx`.
- Tests sit next to the code as `*.test.ts`. Unit-test logic in `src/lib/`; components are checked by driving the built app in Playwright.

## Domain rules

- Data always stores sides as `'PRO' | 'CON'` and speeches as `PC CC PR CR PS CS PFF CFF`. Show them to users only through `useLabels()`, which handles the Pro/Con vs Aff/Neg setting (PC → AC, CFF → NFF). Never hardcode "Pro"/"Con" in UI text.
- A round has two flow sheets, one per case (`FlowRow.sheet`). Column order follows the real speaking order (`flowColumns(firstSide)`).
- Hidden columns are stored per round and per sheet in `Round.hiddenCols`. A missing entry means "use `defaultHiddenColumns`".
- An `Argument` with `caseId` is one of the user's own contentions. Its `BankResponse`s are frontlines (with `against`) and its `CxQuestion`s carry an `answer`. Without `caseId` it is an opponent argument.
- `FlowCell.kind` is only the tag the user set with Alt+1–6. Badges for inserted bank responses are derived on render (`cellKinds` in `explain.ts`) from the responses still in the text; never write a response's kind onto the cell. Dexie v5 and pre-v5 imports clear tags that older versions copied from inserted responses (`withoutCopiedKind`).
- Flashcard progress is a `Review` per bank response (`Review.id` = response id). Deleting a response, argument or resolution must delete its reviews too: any transaction that may cascade into `deleteArgument` has to include `db.reviews`. Full backups include reviews; a bank-only export leaves them out, so a partner starts fresh.
- Roles (`REBUTTAL | CONSTRUCTIVE | BOTH`) only change defaults and visibility (Case tab, which sheet opens). Don't fork features by role.

## Gotchas (each of these has bitten us)

- **Storage keys keep the old name.** The IndexedDB name `rebuttal-flow`, the localStorage key `rebuttal-flow-ui` and the export `app: 'rebuttal-flow'` predate the rename to U Flow. Changing them would silently lose users' data or reject their backups. Visible names can change freely.
- **Vite `base` must stay `'./'`.** Hardcoding `/repo-name/` blanked the site when the repo was renamed. The service worker and manifest resolve relative to it too.
- **One-line effects must not return a value.** `useEffect(() => el.scrollIntoView())` crashed the app: Chromium returns a Promise from `scrollIntoView`, and React then tries to call it as a cleanup function. Wrap effect bodies in braces.
- **Read the time during render for timers.** Store clocks as `{ durationMs, elapsedMs, startedAt }` and compute with `remaining(clock, Date.now())`. `useTicker` only forces re-renders. Caching "now" in state once made timers show extra seconds on start.
- Side panels share one slot (`store.panel`: `cx` | `summary` | `explain`). State a panel needs after leaving and returning to the Flow tab (e.g. `store.explain`) lives in the store, not component state.
- Arrow keys in a cell move to the neighbouring cell only when the caret can't move further (`caret.ts` measures visual lines with a hidden mirror, so wrapped lines count). Keep Shift+arrows and selections as normal text editing.
- **Global shortcuts** (Space, N, P, X, S, and Alt+Z to close the explanations panel, in `FlowView`) must ignore typing and any open `[role="dialog"]` or `[role="menu"]`.
- **Updates:** a browser refresh does not pick up a new deploy while the service worker serves the cache. `UpdateBanner` in `App.tsx` applies updates automatically within 20 s of opening (if no clock is running) and otherwise shows a banner. Never auto-reload mid-round.
- **Blank-page fallback:** `index.html` shows a "didn't load" message after 8 s if `#root` is still empty. It lists failed file loads and errors, and has a **Reset app files** button that unregisters the service worker and clears caches (never IndexedDB). Keep it plain inline JS so it works even when the bundle doesn't.
- **Schema or export changes:** bump the Dexie version and `EXPORT_VERSION` together, add new tables to `TABLES` in `data.ts`, and keep older export versions importable.
- In a drag handler, render the resize handle with a plain function, not a component defined inside render, or it remounts and loses pointer capture.

## Style

- Colors come only from the theme tokens in `src/index.css` (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-accent-text`, `bg-accent-soft`, …). They are tinted by the user's accent hue and follow light/dark mode. Don't use raw Tailwind palette colors like `slate-*` or `sky-*`.
- Use the existing component classes (`btn`, `btn-primary`, `btn-ghost`, `btn-sm`, `btn-icon`, `input`, `label`, `card`, `seg`, `eyebrow`, `nav-item`) and `lucide-react` icons.
- Use `confirmAction()` and `toast()` from `store.ts`, never `window.confirm`/`alert`. Use `Modal`/`ModalHeader`/`EmptyState` from `ui.tsx`.
- UI copy is plain and short, written for high-school debaters. Explain debate terms only where a beginner would get stuck.
- Keep the app usable on a tablet: no hover-only controls without a `pointer-coarse:` fallback, and side panels overlay below the `lg` breakpoint.

## Verifying UI changes

Unit tests don't cover components. For any UI change, run `npm run build`, serve `dist/` (for example `python3 -m http.server` from a folder holding `dist` as `uflow/`) and drive it with Playwright (`require('playwright')`, `chromium.launch()`). Check for `pageerror` events and screenshot the screens you changed. The welcome screen's "Or try it with a sample bank" button gives you data to test against.
