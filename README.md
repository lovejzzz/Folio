# Folio

*Your course, bound together.*

Folio turns a description of what you want to teach, or the syllabus you already have, into a course: an outline you agree to first, then ten linked, editable materials built from one course document. Change an objective once, and everything that depends on it knows. It is made for teachers in the United States and Canada, from elementary school to graduate seminars, and it lives at [folio.university](https://folio.university).

![Home: one question, one box](docs/screenshots/home.png)

| The overview: lessons × materials | One lesson, in teaching order |
| --- | --- |
| ![Overview](docs/screenshots/map.png) | ![Lesson](docs/screenshots/lesson.png) |
| **Slides: filmstrip, stage, speaker notes** | **Quiz bank, dark ("chalkboard")** |
| ![Slides](docs/screenshots/slides.png) | ![Quiz bank in dark mode](docs/screenshots/quiz-dark.png) |

## Try it

You need Node 22 or newer and pnpm 10 (`corepack enable` gives you the version pinned in `package.json`).

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # the static site, in apps/web/dist
pnpm preview        # serve the build, with the production headers
```

- **Without an AI:** choose *Or open the sample course* on the home page. It is a hand-written four-lesson statistics unit with every material filled in, so you can edit, undo, export and print straight away.
- **With an AI:** type a brief and press *Continue*. Folio asks how to write it: with **Folio credits** (sign in with Google; a school `.edu` address gets free credits), or with your own Claude, OpenAI, Gemini or DeepSeek key, or a local OpenAI-compatible server (Ollama, LM Studio). For Ollama, allow the site's address with `OLLAMA_ORIGINS` (never `*`); the site's Content-Security-Policy allows `localhost` and `127.0.0.1` only.

**Browsers.** Safari 16.4, Chrome and Edge 111, Firefox 128, or newer. An older browser gets a message asking to update instead of a blank page.

**Privacy.** No analytics, no tracking of people, no ads; the server keeps only daily totals across everyone (sign-ins, AI requests and how they ended, credits used), tied to no account or course: `SELECT * FROM daily_counts ORDER BY day DESC` in the D1 console. Without an account, courses stay in the browser (IndexedDB), and a browser that has never signed in never contacts Folio's server. Signing in is optional (Google): your courses are then also kept in your account, so they follow you between devices. Your own key stays in the browser, and with it requests go straight to the AI company you chose. With Folio credits, requests pass through Folio's server, which keeps only the token counts it charges for. The [privacy policy](apps/web/src/screens/privacy/policy.ts) says all of this in full.

## What it does

1. **Describe.** One box: "What do you want to teach?" Describe the course, or drop in your syllabus, notes or readings (PDF, Word, `.txt` or `.md`). The level menu runs from elementary grades to graduate and adult education; the lesson count fills itself in from what you type. The example courses under the box are full briefs that show what a good one looks like.
2. **Clarify.** When something important is unclear, such as how many lessons a syllabus implies, Folio asks one or two questions first, with answers you can pick.
3. **Plan.** The AI first writes only an outline, with how the course is graded and each lesson's homework (a graded assignment, a step toward a bigger piece, or none). When you attached your own syllabus, Folio follows it, and checks it for problems instead of writing a new one. You rename, reorder, add or remove lessons, edit objectives, set the minutes (or a lecture and a seminar, a class and a lab, each timed) and the quiz size, and choose which materials to write.
4. **Write.** The overview fills in lesson by lesson, each cell showing the opening words of what it holds. Every lesson plan is checked by a second model before the rest of the lesson is written from it; what the check can fix it fixes, and the rest is left on the plan for you. One line in the header tracks progress ("Writing lesson 3 of 6 · Stop"), and the run ends by saying what to check and what it cost.
5. **Adjust.** Everything is edited in place. When an objective, a lesson title, the plan, the level or a source changes, the sections written from it are marked *Needs updating*, with the reason. *To do & history* groups them by lesson, one card with one *Update*; the plan updates first, so the rest are written from the new plan. You can *Keep as is*, or *Compare* an update with your own version: an update never overwrites text you wrote.
6. **Ask.** Select text to *Rewrite, Simplify, Harder, Easier, Translate to Spanish* or *Explain*. The suggestion appears inline for you to accept or reject. `⌘K` (Ctrl+K) searches and navigates, and turns requests such as "add a lesson on sampling bias after lesson 2" into a plan you preview before it runs.
7. **Deliver.** Export asks what (whole course, one lesson, chosen materials), who it's for (*Students*, the default, or *You (answers)*) and the format: Word, PDF (print view), PowerPoint, Google Docs, a spreadsheet of the quiz bank, a ZIP of everything, or a backup file (`.folio`). A student copy can never contain answers, because projections filter by audience before any exporter runs; a copy with answers says "Teacher copy, with answers" in its file name and on every page.

University courses are taught as universities teach: lectures and seminars instead of school routines, weekly readings and a grading scheme taken from the brief, letter-grade rubric levels, and suggested further reading kept apart until the teacher adds it.

The ten materials are objectives & assessment, the syllabus, lesson plans, slide decks, assignments, rubrics, discussions, quiz & exam bank, study guides and course FAQ. Every screen has a URL: `/c/:id/map` (the overview), `/c/:id/lesson/:lessonId`, `/c/:id/m/:kind`. Folio has light and dark themes.

## Folio credits

A credit is one US cent. Each call is charged at three times what it costs Folio, and only what it actually used: before a call, Folio holds the most it could cost, and settles at the real token count when it ends. A hold that is never settled (a closed tab, a lost connection) is returned after 15 minutes. Credits come in packs from $10 (1,000 credits) to $100 (13,000), paid on Stripe's page, and they don't expire.

With credits, each job goes to the model that does it best for its cost:

| Job | Model |
| --- | --- |
| Outline, clarifying questions, lesson plans, slides, study guides, discussions, FAQ | Claude Sonnet 5.5 |
| Quizzes, assignments and rubrics | GPT-6 Luna (high effort) |
| Checking each lesson plan, checking a teacher's syllabus | GPT-6.1 Sol (low effort) |

Every job has an output limit well above the longest answer measured for it, and an answer cut off at that limit is asked for again with room to finish, so a limit never shortens what a teacher gets.

## How it is built

```text
apps/web/          routes, screens, drawers, command bar, state, i18n (React 19, TanStack Router)
packages/core/     the Course schema (Zod), commands + undo, ripple, projections, checks, sample course
packages/ai/       one Inference port, Anthropic/OpenAI/Gemini/DeepSeek/local adapters, prompts, jobs, build queue
packages/export/   SemanticDoc → .docx, .pptx, .xlsx, .csv, .zip and .folio
packages/ui/       tokens.ts (→ tokens.css), React Aria primitives, domain components
server/            Cloudflare Pages Functions on D1: Google sign-in, course sync, Folio credits and the model proxy, Stripe
functions/         the Pages entry point that hands /api/* to server/
```

The dependencies point one way: `core` ← `ai`/`export` ← `ui` ← `web`. ESLint enforces this: `core` imports nothing from the other packages, and none of `core`, `ai` or `export` imports React, storage or the app.

- **One source of truth.** A course is one Zod-validated document. Entities are records keyed by stable IDs, and every relationship is an ID, never an array position. Lesson count, minutes and quiz size are fields in the document, never words inside a prompt.
- **Commands, undo, history.** Every change, whether you typed it or the model proposed it, is a typed command applied with Immer patches. Undo checks that nothing changed the same content since, so you can undo any single entry in the history, not only the last one, and it refuses when undoing would clobber later work. Build steps appear in history but are skipped by `⌘Z`.
- **Ripple.** A generated section records hashes of the inputs it was built from: title, objectives, readings, minutes, quiz size, level, the plan, sources. If a hash no longer matches, the section is out of date, and the reason can be named.
- **Projections.** Each material is a pure function, `project(course, kind, { audience, lessonIds }) → SemanticDoc`. The screen's print view, the export preview and every exporter read the same projection.
- **Schema-first AI.** Jobs are small and typed: an outline, then per lesson a plan, slides, study guide, questions, an assignment with its rubric, discussions and FAQ. Each job asks for JSON against a Zod-derived schema, validates it, then runs deterministic checks: the answer must be one of the choices, choices must be distinct, arithmetic answers are recomputed from the model's working, and segment minutes must add up. It is allowed one repair call that quotes the problems. Anything still wrong is kept and marked *Please check*, never patched with a regex. A plan whose check could not run is saved as written and says so. Calls time out after ten minutes rather than hanging a build.
- **Local-first, synced when signed in.** Each change is written to IndexedDB (Dexie) within 300 ms. Undo history (the last 200 entries) is saved beside the course, so undo still works after a reload. Two tabs on one course never overwrite each other silently. Signed in, courses sync to the account; a conflict keeps both copies rather than choosing one. Word and PowerPoint files are made in a Web Worker.

## Design system

The look is "paper and ink": warm desk, paper sheets, one fountain-pen blue, and ten muted binder-tab colours that mark materials, and only mark them. Instrument Serif is the display face, Source Serif 4 the reading face on sheets (17/28), Instrument Sans the interface face, and JetBrains Mono is used sparingly. Every colour, size, radius, shadow and duration lives in [`packages/ui/src/tokens.ts`](packages/ui/src/tokens.ts). `pnpm tokens` generates the CSS variables and a Tailwind `@theme` from it, and the exporters read its light palette. Components may not use raw hex values or arbitrary Tailwind values; a lint rule checks this. Contrast is tested, not eyeballed: text is at least 4.5:1, and UI marks and control borders at least 3:1, in both themes.

## Quality

| Check | Command | Limit |
| --- | --- | --- |
| Types (strict) | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | no warnings; files ≤ 400 lines, functions ≤ 60 |
| Unit tests (one glob: packages, app and server) | `pnpm test` | all pass |
| End to end + axe (WCAG 2.2 AA) + CSP guard | `pnpm test:e2e` | all pass, desktop and phone |
| Budgets | `pnpm build && pnpm budget` | first-load JS ≤ 150 KB gzip, first-load CSS ≤ 20 KB |

`pnpm check` runs everything except the end-to-end tests; CI runs all of them on every push. The end-to-end tests run the production build under the production Content-Security-Policy, with a stand-in for the model APIs that answers each job from its prompt. Any CSP violation or uncaught error fails a test. `cd apps/web && FOLIO_TOUR=<folder> npx playwright test tour` takes a screenshot of every screen for design review.

## Testing against a real model

The end-to-end suite uses a stand-in model. To see what a real model does with Folio's prompts, schemas and checks:

```sh
node scripts/claude-bridge.mjs                # an Anthropic-style endpoint on :8787 that answers via `claude -p`
LIVE=en pnpm test:live build                  # build a whole course: en, stats, sources, vague or history
PROF=econ pnpm test:live professor            # a university course, every material screenshotted: econ, phil or psych
BRIDGE=direct FOLIO_ANTHROPIC_KEY=… PROF=econ pnpm test:live professor   # the app's own requests to the Anthropic API ($3 cap a run)
python3 scripts/token-report.py               # tokens and dollars per job
python3 scripts/score-live.py                 # answer positions, true/false balance, lengths, flags, timing, cost
```

Each run saves the course, every call and screenshots under `apps/web/live-results/`.

## Deploying

The site runs on Cloudflare Pages (project `folio`); a push to `main` deploys it. `main` is protected: it accepts only commits whose CI has passed, so work is pushed to a branch first and `main` is fast-forwarded to it. After a deploy, `/api/health` answers `{"ok":true}` when production's database has every table and column the code uses. The build command is `pnpm build`, the output directory `apps/web/dist`, and `PNPM_VERSION` is set to `10.33.0` (`.node-version` pins Node 22). The server keeps its data in a D1 database whose schema is [`server/schema.sql`](server/schema.sql); a schema change is applied to D1 by hand before the code that needs it ships, and `/api/health` names anything left out. Its secrets (the Anthropic and OpenAI keys, Stripe's keys) are set in the Pages project's settings, never in the repository. `public/_headers` carries a strict CSP (no `unsafe-inline`) along with `frame-ancestors 'none'` and immutable caching for assets. Google sign-in and Docs export use a public OAuth client ID set at build time (`VITE_GOOGLE_CLIENT_ID`); the client secret is never needed. The fonts are under the SIL Open Font License; `public/fonts-licence.txt` lists them.

## Deliberate choices

- **Plain-text fields instead of a rich-text editor.** The course is structured data, so each field is edited in place as text, which keeps the first load small. A field may carry light marks, typed as teachers already type them: `` `lm(y ~ x)` `` for code, `β̂_educ`, `t_{n−k−1}` and `R^2` for sub- and superscripts. Word and PowerPoint get real code runs and sub- and superscripts.
- **Typed message catalogues.** The interface text lives in TypeScript objects, so a missing string is a type error: `i18n/en.ts` for what every screen shares, and separate modules beside it (settings, export, the command bar, accounts, credits) for copy that loads only with its screens.
- **Generation runs on the main thread.** Model calls are network-bound, so only exports use a worker. A stopped or interrupted build resumes from the header ("Paused · 12 parts left · Resume").
- **PDF comes from the print view.** You get it with "Save as PDF": the sheet *is* the printout.
- **"On this device" means a local OpenAI-compatible server,** such as Ollama or LM Studio, rather than a 3 GB in-browser download.
