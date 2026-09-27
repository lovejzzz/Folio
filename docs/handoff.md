# Handoff: where Folio stands and what's next

Written for the next working session. Branch: `claude/hopeful-edison-5oki79` (continues `claude/jolly-wozniak-rdu0k3`). Reply to the user in Chinese; they care a lot about UI/UX and taste.

## Done

- The whole app: brief → outline → plan screen → build → map, lesson, material views; ⌘K course changes; selection actions; exports (Word, PDF print, PowerPoint, spreadsheet, ZIP, .folio); en and zh-CN interfaces; persistence with conflict handling. `pnpm check` and `pnpm test:e2e` pass.
- Five rounds of live testing against a real model through `scripts/claude-bridge.mjs` (answers via `claude -p`). The fixes are in: balanced answer positions, true/false order set by Folio, no stand-out right answers, sentence case, the teacher's locale, curly quotes, and concise ⌘K plans.
- Token savings (`c3fdfab`):
  - Effort is set per job (`SECTION_EFFORT` in `packages/ai/src/prompts.ts`): plan and quiz use medium, everything else low.
  - The course background and sources go in one cacheable block (`CompletionRequest.context`, sent with `cache_control`).
  - A quiz with a question too many is trimmed locally (`trimQuiz`).
- Brief parsing reads hours and 学时. Graduate courses count as university level (`fb0187a`).
- University features: weekly readings per lesson, and a grading scheme in the syllabus.
  - Readings sit on `Lesson.readings`. They can be edited on the plan and lesson screens and appear in the syllabus schedule.
  - The grading scheme sits on `Course.grading`. It can be edited on the syllabus screen and appears in the syllabus assessment section.
  - The outline fills both from the brief and must not invent sources.

## Professor test (Opus 5.5, stopped halfway to save money)

Three university briefs are in `apps/web/e2e-live/professor.spec.ts`: econometrics with attached notes, a political philosophy seminar, and cognitive psychology in Chinese. Run one with:

```
PROF=econ pnpm test:live professor
```

It builds the course and screenshots every material into `live-results/prof-<name>/`.

**The Opus content was classroom-ready:**
- Correct derivations, R code and wage1 figures.
- Rubrics a lecturer could use.
- Seminar plans built on the actual chapters.
- Chinese quizzes with sound distractors.

**Gaps found:**
- "Two-hour seminars" became 50 minutes. Fixed.
- The reading list and the grading weights were lost. Fixed by the readings and grading work above.
- Maths is plain Unicode (β0, not β₀). Acceptable, but the prompt could ask for Unicode subscripts.
- R code in slides isn't set in monospace. There is no code styling yet.

**Opus baseline** (medium effort everywhere, per call):

| Job | Output tokens | Share that is thinking |
|---|---|---|
| Plan | ~3,800 | ~49% |
| Slides | ~3,400 | ~44% |
| Quiz | ~2,800 | ~53% |

Overall, about 47% of output tokens were thinking. `python3 scripts/token-report.py --grep econometrics` prints the table.

## DeepSeek status

- **The key works once its first letter is a lowercase `s`.** The environment still holds it with a capital `S`: fix it in the environment settings, or prefix commands with `export DEEPSEEK_API_KEY="s${DEEPSEEK_API_KEY:1}"`.
- **Model and API.** The model is `deepseek-flash` (DeepSeek-V4.1-Flash, 1M context). Peak prices per million tokens: $0.30 input, $0.006 cached input, $1.20 output; off-peak is half.
  - It does not accept `json_schema`, so the adapter uses `json_object` and puts the schema at the end of the system prompt.
  - It thinks by default. `thinking: {type: 'disabled'}` turns thinking off; `reasoning_effort` takes `low`, `high` or `max`.
  - Browsers can call it directly (CORS allows it).
- **In the app.** Jobs with effort `medium` (plan, quiz, outline) send `reasoning_effort: 'low'`; all other jobs turn thinking off. `DEFAULT_MODELS.deepseek` is `deepseek-flash`.
- **`scripts/deepseek-bridge.mjs`.** Drop-in for `claude-bridge.mjs`. It maps effort to thinking the same way the app does (`DS_THINK_LOW`, `DS_THINK_MEDIUM`). It keeps a ledger in `live-results/deepseek-spend.json` and caps spending at $3 per run and $15 in total.
- **Runs**, each a four-lesson course (logs and courses under `apps/web/live-results/*-ds*`):

| Run | Thinking | Calls | Repairs | Cost | Build |
|---|---|---|---|---|---|
| econ 1 | low on plan, quiz, outline | 29 | 0 | $0.078 | 89 s |
| econ 2 | off everywhere | 36 | 7 | $0.056 | 56 s |
| psych (zh) 3 | as econ 1, with the local fixes | 31 | 2 | $0.074 | 95 s |

  Opus 5.5 cost about $1.30 per course, so DeepSeek is roughly 17× cheaper. Real spend so far is $0.17 (balance $19.97 → $19.80).
- **Quality.** Classroom-ready in English and Chinese:
  - The econometrics maths, t statistics and wage1 figures are correct.
  - The Chinese psychology course cites the classic studies accurately (Sperling, Craik and Tulving, Godden and Baddeley).
  - The distractors target real misconceptions.
  - Readings and the grading scheme come through from the brief.
- **Fixed from these runs** (all applied locally, without a repair call; see `packages/ai/src/tidy.ts`):
  - A true/false question returned with no choices now gets the course language's True/False (正确/错误).
  - Numbers the model wrote into assignment steps are removed, because the page numbered them again ("1. 1. …").
  - Follow-up questions past three are dropped.
  - Lesson titles the model wrapped in quotation marks (“知觉：…”) lose the marks.
  - The assignment prompt now says "two to six steps".
- **Open.**
  - Without thinking, the cheap model makes more arithmetic slips and more "right answer stands out" quiz items. The checks catch these and each costs one repair; that is why the quiz keeps low thinking.
  - The econ plan and the quiz used different standard errors for educ (0.007 and 0.0074). Each job invents what the sources don't give.
  - One psych spacing-effect question had a defensible second answer ("5 h weekly for 5 weeks"). The checks can't catch this; the quiz prompt could ask that exactly one choice is defensible.

- **Focus: English courses.** The user doesn't need Chinese courses; test English scenarios only (the zh interface strings stay).
- **Loop log** (one line per round):
  - Round 5, assist and zh interface: 33 calls, $0.044. Text actions came back blank on 4 of 8 calls, because "Return only the replacement text" fought DeepSeek's JSON mode. Reworded to 'Put only the replacement text in "text"': 0 blank in 12 tries. Missing question fields (choices, expression, source passage) now default instead of costing a repair.
  - Round 6, vague brief ("teach my kids about money"): 33 calls, $0.069. Sensible KS2 course. Lesson 1's slides failed outright: a slide had six bullets, and the repair sent back the same slide. Slides with more than five bullets are now split into two ("… (continued)") locally.
  - Round 7, attached sources (plant history notes): 15 calls, 0 repairs, $0.031. Faithful to the notes: 9 of 10 questions cite a passage, and the figures match.
  - Round 8, UI pass on the DeepSeek courses: the pages look right. Speaker notes and plans said "the first lesson" and "over the next two hours", because every request opened with "This is lesson N". Requests now name the lesson by title only, and the rule lists the phrasings seen. "The next lesson" persists; ripple already marks such sections out of date when the order or length changes.
  - Round 9, stats: 23 calls, 1 repair, $0.052. The only lesson reference left was "This lesson" (earlier English courses had 5 to 12).
  - Round 10, econ again: 30 calls, 1 repair, $0.084. Lesson number and length mentions fell from 12 to 2 ("next session", and "Week 3" from the notes' file name). UI pass: rubrics were five words wide in a portrait sheet, so the rubric material now uses a landscape sheet (1020px, A4 proportions) and prints landscape.
  - Round 11, en (photosynthesis): 32 calls, 3 repairs, $0.058. Discussions twice came back without follow-ups: "at most three" read as optional, so the prompt now asks for two or three. UI pass:
    - The map dropped from six material columns to four once built, because the slide thumbnail's row of boxes set the column width. Thumbnails no longer size their column.
    - The syllabus cells all said "On the schedule"; they now show the lesson's reading count.
    - "Add objective" is now "Add an objective", like every other add button.
  - Round 12, phil again: 30 calls, 1 repair, $0.086. Confirmed: the map keeps six columns once built, syllabus cells read "1 reading", and every discussion has follow-ups. UI pass: the syllabus and course-map tables headed a one-lesson-per-row column "Lessons"; it now reads "Lesson".
  - Round 13, assist (English): blank text actions are gone (11 calls, 0 repairs, $0.007). Fixes from this round:
    - ⌘K rewrote a title the teacher dictated, translating "集中趋势与离散程度" into English in 4 of 8 replays. Dictated wording is now kept exactly: 8 of 8.
    - The Accept/Reject bar for a rewrite floated in the top-left corner, anchored to the field hidden behind the suggestion. It now sits under the highlighted text, and the e2e test checks its position.
    - The ⌘K preview said each change twice: the model's summary, then "This will: …". The model now adds a `note` only when the plan departs from the request ("… already covers sampling bias, so no new lesson is added"). The preview shows that note and the list; the summary only labels the history entry.
    - "Then update 4 sections that depend on it" now reads "Then update the 4 sections built on what changes".
  - Round 14, UI pass on export, changes and library (sample course, no model calls):
    - The export drawer's Download button sat below the preview, off a laptop screen. It is now pinned to the drawer's bottom.
    - In the Changes drawer, "…shows up here" and "…appear here" read as the same sentence twice. The two empty states now say what each section is for, and "History · 0" drops the zero.
  - Round 15, phone pass (sample course): each lesson card on the phone map carried ten grey icons that meant nothing without hover. Cards now name only the materials that need something ("Quiz ◆", "Slides" not built yet) and show nothing when all is ready. The phone slide caption repeats the lesson title on purpose (the slide's own footer is about 9px there). One full e2e run had 2 `toHaveText` failures that didn't recur in the next four runs: worth watching.
  - Round 16, GCSE history (new scenario): 31 calls, 2 repairs, $0.078. Accurate and GCSE-shaped: Bismarck's alliances and the Reinsurance Treaty, source work, an essay question. Every true/false answer was "True". The model had followed Folio's order exactly; the lesson-id hash that picks each quiz's first answer came up "true" four times. Lessons now alternate by position. Numeric questions are asked for only when the lesson involves calculation ("How many years from 1882 to 1907?" in a history quiz).
  - Round 17, history again: true/false now alternates (True, False, True, False) and there are no numeric questions (12 choice, 4 true/false, 4 short). UI pass on the print view: its bar said "Opens the print view" while on it, and the button said "PDF". It now says to choose "Save as PDF" in the print dialog. The objectives table column is "Objective". Also: the most common repair was "the right answer stands out by length" (2 to 3 per course). Replaying 16 real quiz requests: 9 of 36 choice questions stood out with the old wording, 0 of 44 with the new one ("draft the right answer, then write each wrong choice with about as many words and the same kind of detail"), and output tokens fell 16%.
  - Round 18, en again: 29 calls (the minimum: an outline plus seven sections for each of four lessons), 0 repairs, $0.059. Thinking is now the largest cost (74% of the quiz's output, 86% of the outline's). Replaying 11 maths-heavy quizzes with thinking off cut output tokens 82%, and the arithmetic stayed right. But quartile answers then followed an unstated convention (Q1 of 3, 5, 7, 8, 10, 12, 15 given as 6; the usual school method gives 5), so quizzes keep low thinking. The quiz prompt now asks questions with competing conventions (quartiles, percentiles, rounding) to name the method. Replayed, they do ("split the eight values into two halves…"), and the answers check out.
  - Round 19, stats again: the quartile questions now name their method, and every answer checks out by hand. One quiz call spent all 8,000 output tokens thinking and returned nothing; the repair succeeded. That is 1 in 460 calls (thinking per call: median 2,558, p99 6,608). Raising the cap would only let a runaway think longer, so it stays at 8,000. The plan screen UI pass found nothing to fix.
  - Round 20, vague brief again: 29 calls, 0 repairs, $0.069. Every lesson has its slides; the map keeps its columns. This was the second round in a row with nothing to fix, so the loop stopped here.
- **Where it ended.** A four-lesson English course on deepseek-flash takes the minimum 29 calls, with 0 to 1 repairs, for about $0.06 to $0.07. Round 1 had cost $0.078 with 0 repairs but no local fixes, and Opus 5.5 cost about $1.30. Real DeepSeek spend over the whole session: $0.92 (balance $19.97 → $19.05).
- **University work, verified on DeepSeek** (four runs, $0.38 in all; logs under `apps/web/live-results/*-ds.jsonl`):
  - phil 1: 30 calls, 1 repair, 104 s. Seminars were 120 minutes, the suggested reading was real and distinct per lesson, and there were no invented quotations. But no plan gave the weekly student presentation a place: the brief states no weight for it, so `course.grading` was empty and nothing carried it to the sections. The teacher's brief now goes into the cached course background (`briefLine` in `prompts.ts`), with "anything the brief or the grading has happen in class needs a place in the lesson plans", "leave the brief's counts and durations out", and "a seminar runs on discussion of the reading".
  - phil 2: 29 calls, 0 repairs, 92 s. Every seminar has a 20–35 minute presentation slot, and the closing segments set up the 3,000-word essay. One slide note opened "Two-hour graduate seminar."; that led to the "counts and durations" line.
  - econ 1: 30 calls, 1 repair, 111 s. Rubric levels read First (70+) … Third (40–49) with 70/60/50/40. Maths is Unicode (β̂₀, ûᵢ, Σ); only word subscripts use `_` (β_educ). Plan, quiz and assignment share the standard errors (0.0074, 0.0017, 0.0031; discussions and FAQ round to 0.007). But Stock and Watson, Kennedy, and Angrist and Pischke were suggested for three lessons out of four. Each work is now suggested once per course, never when assigned (`courseFromOutline`), and the prompt asks for works on the lesson's topic.
  - econ 2: 31 calls, 2 repairs, 125 s. One distinct, apt book per lesson (Goldberger; Kleiber and Zeileis for the R lesson), no "90-minute" leaks. The model had sentence-cased the book titles ("Introduction to econometrics.") because of the sentence-case rule: the rule now keeps the published capitalisation of cited works, and a reading's trailing full stop is dropped locally.
  - UI: on the plan screen, the suggestion's Add button sat 2px above its line (smaller line height); it now takes the line's leading.
  - Build times ran 92–125 s with the quiz and assignment waiting for the plan (was 75–110 s).

## Model or pipeline? DeepSeek against Sonnet 5, same brief

The econ brief (with the week 3 notes), run twice on each model: once before the fixes below and once after. Logs: `apps/web/live-results/cmp*-{ds,sonnet}.jsonl`. `scripts/token-report.py --log <file>` prints each run's costs.

| | deepseek-flash | claude-sonnet-5 (CLI bridge) |
|---|---|---|
| Build | 102–114 s | 277–284 s |
| Calls (29 is the minimum) | 30–31 | 30–33 |
| Cost | $0.09–0.10 | $1.02 billed; the app talking to the API should be ~$0.7–1 |
| Accuracy | every figure checks out | every figure checks out |
| Character | richer R labs (`cbind`, `qr(X)$rank`, `solve(t(X) %*% X)`) and chapter numbers (correct this time) | tighter theory, cleaner maths (β̂ⱼ, never LaTeX), suggests a chapter only by topic when unsure |

**Pipeline (both models showed it), fixed:**
- The right answer was never D. `balanceChoices` started every quiz at A, and a quiz here has two or three multiple-choice questions. Each quiz now starts at a random letter.
- Plan notes ended "Passage [2]." The plan request asked for passage numbers in a field that plans don't have. Plans now name sources by title, and leftover numbers are removed locally.
- Rubric levels came back as both "First (70+)" and "First", because the prompt's example carried the ranges. The prompt now names the levels exactly, and ranges are removed locally.
- The true/false `choices` field was described as "options", and Sonnet put the statement in it. It now says `["True", "False"]`.
- "The fourth option" in an explanation didn't stop the choices being reordered. The guard now knows ordinals.
- Overlong lists (5 FAQ entries, 7 steps) each cost a repair. The extras are dropped, or up to 8 steps are accepted.
- The course summary ignored the rule against naming the length ("A four-week module", Sonnet in 2 of 2 runs). The outline prompt now names counts too, and `withoutSpan` removes the phrase locally.

**Word subscripts, done:** both models wrote `β_educ`, because the prompt forbade `_` and gave no other way to write a named subscript. `_word`, `_{…}` and `^…` after a single letter are now marks like code: set small on the page, sized to meet the face's own ₀ and ², and written as real subscripts and superscripts in Word and PowerPoint. The prompt asks for this form where Unicode has none. snake_case words and code are left alone.

**Harness, not the app:**
- The Claude bridge's `--json-schema` made the CLI answer three times per call (text, then a tool call), doubling output and time. It now puts the schema in the system prompt and answers in one turn.
- Without constrained decoding, Sonnet's quiz sometimes gave `"sourcePassage": "3"` as a string, or broken JSON (3 of its 4 repairs in the second run). The API's structured outputs rule both out.

**Model:**
- DeepSeek: "This is a 90-minute lecture" in speaker notes (both runs); `t_{n−k−1}` and `e^0.092` once; a quiz whose thinking ran out the token budget (one repair).
- Sonnet 5: "last week / this week" framing, from the weekly brief. Right answers longer than the distractors: two items still stood out after the one repair allowed.
- Sonnet 5 isn't much cheaper per course than Opus 5.5 was (~$1.30), because it writes more. It is the default for its lower per-token price and good quality, but DeepSeek is 10× cheaper for similar accuracy.

### Round 2: GCSE history, grade 11 statistics, the philosophy seminar

| | DeepSeek | Sonnet 5 |
|---|---|---|
| history (4 × 60 min) | 29 calls, 66 s, $0.06 | 33 calls, 205 s, $0.76 |
| stats (3 × 50 min) | 22 calls, 66 s, $0.06 | 23 calls, 145 s, $0.57 |
| phil (4 × 120 min) | 32 calls, 150 s, $0.10 | 32 calls, $0.8 |

**Accuracy.** Every numeric answer in both statistics quizzes checks out by hand. The history courses invent no quotations: Sonnet's one quote, "We want eight and we won't wait", is real, and DeepSeek names real extracts for the teacher to hand out (Fischer 1961, Clark 2012). Seminars on both models give the weekly presentation 20–35 minutes and have no school routines.

**Pipeline, fixed:**
- Rubric scales changed from lesson to lesson (four in one history course), because each assignment is written alone. School courses now get one scale ("Excellent / Good / Developing / Beginning", 4–1; 优秀 / 良好 / 发展中 / 起步 in Chinese). A course that has a rubric passes its levels on, so a teacher's renaming carries.
- DeepSeek counts its thinking against the output cap. Two-hour seminar plans were cut off at 8K twice in one course, so the cap is now 16K (app and bridge).
- A raw line break inside a JSON string is now read as meant (for models without constrained decoding).
- "The next lesson" and "last week" were written by both models; they are now named in the rule.

**Verified after the fixes** (DeepSeek history, seminar, stats and econ, and Sonnet history): one rubric scale per course; no cut-offs on the seminar (29 calls, 0 repairs); the econ course at the minimum 29 calls with 0 repairs, strict true/false alternation and answers spread over A–D. One more pipeline fix came out of it: the quiz prompt still said true/false "answer" repeats "the correct choice", and DeepSeek echoed the statement too. It now says "True" or "False". "A four-topic course" now loses its span as well. Sonnet still writes "the next lesson" (4 in a course, against DeepSeek's 0–1), so that is its habit now.

**Model:**
- Sonnet 5 writes the right answer longer than the distractors in 2–3 quizzes per course (0 on DeepSeek). The check is fair (68 characters against 43–45), so it stays.
- Sonnet 5 follows the true/false order loosely (T, T in one lesson). Over a course it stays balanced.
- DeepSeek follows instructions more literally; Sonnet writes tighter.

## Next

1. **Sonnet 5 through the API.** The costs above come from the CLI bridge. A run with a real API key would settle the pricing note ("about $1").
2. **Sonnet's long right answers.** They cost 2–3 repairs a course. Worth trying: a line in the quiz prompt that shows a bad example, measured on replays.
3. **Source analysis without sources.** A GCSE brief asked for source work but attached nothing, so the models could only name extracts. The brief screen could suggest attaching sources when the brief mentions them.

**DeepSeek key.**
- The key the user first gave was revoked on 2026-09-27, after a *different* key of theirs (named "Test") leaked and was drained of $19.20. Folio's own key had spent $0.80 by then. A code audit found no path in Folio that could run up cost unattended:
  - Every model call goes through `runJob`: one call plus at most one repair.
  - The Anthropic SDK retries at most twice; the DeepSeek adapter doesn't retry.
  - Builds and outlines start only from a click.
- The user has made a new key and put it in the environment, and it reaches new sessions only. Use it as `DEEPSEEK_API_KEY` and never print or write it anywhere.
- The bridge's spend ledger lives in the gitignored `live-results/`, so a fresh container starts it at $0. Keep to about $3 per run.

## Keep costs down (the user asked for this explicitly)

- Most of the earlier cost was this agent's own context: up to 780k tokens, re-read on every tool call. Keep context small:
  - View screenshots shrunk to about 800px wide JPEGs, and only the region that matters.
  - Don't dump big files or logs.
  - Batch shell commands.
- Sub-agents: use `model: 'sonnet'` for mechanical work and give each a narrow scope.
- Live tests: four-lesson courses, one scenario at a time, and a token report after each run. Don't re-record demo videos unless asked.
