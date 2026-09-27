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
