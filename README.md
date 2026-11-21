# csv-reader-speed

[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/muherilobak-web/csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/muherilobak-web/csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0. `solve.js` answers every case
exactly like the reference — same `{columns, rows, errors}`, same error
order, same broken-row policy — only much faster.

How it gets there: a record line with no quote and no stray CR is cut
in one go (one slice, one split on commas); an unquoted field is found
by locating the next line break and looking for a comma or a CR inside
that one line only; a quoted field is found by locating its closing
quote and taking the text between the quotes in a single slice when it
holds no doubled quote and no line break. Nothing is built one
character at a time, nothing is cached between cases, and the result
depends only on the input.

## Running it

The harness runs `node /bot/main.ts` (Node 22). It reads the cases
from `/input/cases.json` — or `$MAKEFUN_INPUT_DIR/cases.json` outside a
container — answers each one alone with `run()` from `solve.js`, and
writes the answers in order to `/output/answers.json` (or
`$MAKEFUN_OUTPUT_DIR/answers.json`).

```sh
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out node main.ts
```

No dependencies, no install step, no network, no native code.

## Layout

- `solve.js` — the fast reader. ES module, exports `run(input)`.
- `main.ts` — the driver: reads the cases, writes the answers.
- `LICENSE` — MIT.

---

Built for [make.fun](https://make.fun/?ref=bt57jd3y).
