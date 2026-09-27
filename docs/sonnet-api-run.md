# One Folio course on Claude Sonnet 5 — real API run

Run: 2026-09-27, `BRIDGE=direct DIRECT_BUDGET_USD=3 PROF=econ pnpm test:live professor`.
The app's own requests went straight to the Anthropic API (model `claude-sonnet-5`, effort `medium`).
The test passed (`professor: econ`, 3.2 min). Raw data: [`sonnet-api-run/direct-econ.jsonl`](sonnet-api-run/direct-econ.jsonl), [`sonnet-api-run/course.json`](sonnet-api-run/course.json).

## Headline

| | |
|---|---|
| Total cost | **$0.63** (budget cap was $3) |
| API calls | 31 (29 first attempts + 2 repairs) |
| Build time (`marks.build`) | **161,062 ms ≈ 2 min 41 s** (outline alone: 20,073 ms) |
| Course | 4 lessons, 20 quiz questions, 8 discussion prompts, 4 assignments, 4 rubrics |

## `scripts/token-report.py`

```
31 calls · model claude-sonnet-5
job                    calls  in/call  out/call  answer  thinking  s/call        $
plan                       4     2927      3270    1634      50%    33.4     0.15
quiz                       4     4536      2620    1032      61%    25.1     0.13
slides                     4     3792      1670    1204      28%    15.7     0.09
assignment                 4     4159      1193     964      19%    13.5     0.07
study                      4     3666      1065     786      26%    11.7     0.06
faq                        4     2334       580     410      29%     7.2     0.03
discussions                4     2385       499     398      20%     7.4     0.03
plan (repair)              1     5174      2165    1657      23%    17.3     0.03
quiz (repair)              1     6311      1602    1028      36%    12.4     0.02
outline                    1     2705      1654     737      55%    18.2     0.02
total                     31   109385     49009   29139      41%             0.63
(in = without the CLI's own ~1060 tokens on Claude bridge calls; cost is what was billed)
```

## Cost per job type

| Job | Calls | Cost |
|---|---:|---:|
| plan | 4 | $0.1476 |
| quiz | 4 | $0.1285 |
| slides | 4 | $0.0862 |
| assignment | 4 | $0.0686 |
| study | 4 | $0.0615 |
| faq | 4 | $0.0316 |
| discussions | 4 | $0.0285 |
| plan (repair) | 1 | $0.0274 |
| quiz (repair) | 1 | $0.0240 |
| outline | 1 | $0.0220 |
| **total** | **31** | **$0.6259** |

Lesson plans and quizzes are 44% of the bill; the two repairs add 8%.

## Prompt caching

| Tokens | Sum over 31 calls |
|---|---:|
| Uncached input (`usage.in`) | 109,385 |
| Cache reads (`usage.cacheRead`) | 51,279 (22 calls) |
| Cache writes (`usage.cacheWrite`) | 18,784 (8 calls) |
| Output (`usage.out`) | 49,009 |

Reads outweigh writes about 2.7 : 1, so the cache paid for itself. Most input is still uncached: cache reads are about 29% of all input tokens.

## Repairs

2 of 31 calls were repairs (prompt contains "It has these problems:").

1. **plan** (call 10): `- The segments add up to 100 minutes, not 90.`
2. **quiz** (call 21): `- Item 3: The right answer is noticeably longer and more detailed than every wrong choice, so it can be picked by its length. Rewrite the wrong choices to be as long, specific and plausible as the ri…`

## Quality checks on the course

**Multiple-choice answer positions** (0-based index of `correct` among `choices`):

| Lesson | MC positions | True/false answers |
|---|---|---|
| 1 · Simple regression and OLS estimation | 0, 1 | True |
| 2 · Multiple regression: estimation in matrix form | 3, 2 | False, True |
| 3 · Properties of OLS: unbiasedness, Gauss–Markov and … | 2, 1 | True |
| 4 · Inference: t tests and confidence intervals | 2 | False, True |

Across all 7 MC questions: position 0 ×1, 1 ×2, 2 ×3, 3 ×1 — spread, no bias to one slot.
True/false: 4 True, 2 False.

**Rubric level labels** (all 4 rubrics identical): First (70) · Upper second (60) · Lower second (50) · Third (40) — UK degree classes, fitting the econometrics brief.

**"Passage [n]" left in lesson plans:** none (0 matches in lessons, 0 anywhere in the course).
