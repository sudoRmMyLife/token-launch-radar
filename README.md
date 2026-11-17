# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sudoRmMyLife/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sudoRmMyLife/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar ranks every protocol in the sealed DefiLlama snapshot that records no token — and is not a wrapped, staked or bridged product of one that trades — by the value a token would carry if it launched on the snapshot's own figures. The snapshot's watchlist is the floor, not the ceiling: all 40 of its protocols are ranked, along with 158 earlier rows below its $50M line, for a board of 198.

The model is a comparable-companies estimate, computed from the snapshot alone. The 119 protocols whose tokens already trade give, per category, a median market-cap-to-TVL multiple; each ratio is first capped at the market's 90th percentile (above it, a token's cap is set by something other than the protocol's TVL — one uncapped ratio in this snapshot is 400x), and each category median is shrunk toward the market-wide median with a prior of six phantom peers, so a thin category cannot price a board on two observations. Implied value is TVL times that multiple, adjusted for the week's TVL momentum, for the years the protocol has run with no token, and for chain breadth. Every row also carries the range the same arithmetic gives at the category's 25th and 75th percentile multiples, a confidence grade from the number of traded peers behind it, and a six-step farm plan generated from its own category, chains, TVL and age, with the cost and the time stated on every step.

The dashboard is a static page with no build step and no network: a sortable, filterable board (search, category, chain, TVL band), a live-token view kept apart from the ranking, the full methodology with the category evidence table, and a per-protocol detail view that recomputes the row's implied value and farm plan from the figures `data.js` carries and shows the check against `board.json`. Run `node tools/check-agreement.mjs` to verify that agreement over every row.

Layout: `main.ts` is the handoff program; `lib/model.ts` is the model; `dashboard/` is the page; `screenshots/` holds three renders of the page (board, one protocol's detail, one filtered view); `vendor/makefun-board.ts` is the dossier library the handoff writes with.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=2tnm35pq&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
