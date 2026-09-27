# Handoff: where Folio stands and what's next

Written for the next working session. Branch: `claude/nice-fermat-6why6q`. Reply to the user in Chinese; they care a lot about UI/UX and taste.

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

## Next

1. **DeepSeek for cheap testing.** The user set `DEEPSEEK_API_KEY` in the environment and allowed `api.deepseek.com`. They asked for **DeepSeek-V4.1-Flash**; confirm the exact id with `GET https://api.deepseek.com/models`. The budget is $19. Stop at $15 in total and about $3 per run.
   - Keep the key safe:
     - Read it only from `process.env.DEEPSEEK_API_KEY`, inside the test harness (a Playwright route handler or a small local proxy adds the `Authorization` header).
     - Never write it to files, logs, localStorage, screenshots or commits.
     - Never echo it, and never print `env`.
   - Add DeepSeek as a real provider in `packages/ai` (the OpenAI-compatible adapter in `adapters/openai.ts`, plus `DEFAULT_MODELS`, `ProviderFields`, i18n). It helps Chinese teachers.
   - Check whether the API accepts `response_format: json_schema`. If it only takes `json_object`, put the JSON Schema in the system prompt and rely on the existing validate, check and repair pipeline.
   - Also check whether browsers can call it directly (CORS). If they can't, say so in the provider note.
   - Log usage per call like the bridge does: `prompt_tokens`, `completion_tokens`, cache hits. Extend `token-report.py` or write a similar report, and keep a running spend total that stops the run at the cap.
2. **Run the professor scenarios on the cheap model.** Score them with `scripts/score-live.py` and `token-report.py`, and compare with the Opus baseline. The goal from the user: *good results without the most expensive model.* Tune the prompts where the cheap model falls short. Then consider making Sonnet 5 (`claude-sonnet-5`) the Anthropic default instead of `claude-opus-5` (`DEFAULT_MODELS` in `packages/ai/src/inference.ts`), and update the pricing note in en.ts and zh.ts.
3. Keep assessing classroom readiness from a lecturer's view: readings, grading, seminar presentations, code and maths display, and exports opened in Word and PowerPoint.

## Keep costs down (the user asked for this explicitly)

- Most of the earlier cost was this agent's own context: up to 780k tokens, re-read on every tool call. Keep context small:
  - View screenshots shrunk to about 800px wide JPEGs, and only the region that matters.
  - Don't dump big files or logs.
  - Batch shell commands.
- Sub-agents: use `model: 'sonnet'` for mechanical work and give each a narrow scope.
- Live tests: four-lesson courses, one scenario at a time, and a token report after each run. Don't re-record demo videos unless asked.
