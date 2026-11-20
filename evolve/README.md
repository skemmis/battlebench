# Design rounds

A loop for exploring what can be built. Each round, a designer (a model, or a person) reads the state of play,
writes new machines into `designs/`, and a short ladder of tests decides which join the league.

```
npm run round -- league          # the table as it stands
npm run round -- brief           # writes evolve/brief.md: rules, league, what earlier rounds tried, fight accounts
npm run round -- design 6        # asks a model for 6 new machines (Opus 5.5 unless ROUND_MODEL is set)
npm run round -- test            # runs the ladder on every design not yet tested
npm run round:page               # builds dist/evolve.html: the viewer with admitted designs added
```

`design` needs an Anthropic credential: `ANTHROPIC_API_KEY` in the environment, or `ant auth login`. Without one,
write the files yourself from the brief; `test` does not care who wrote them.

The ladder, cheapest first:

1. **Build check.** Budget, size and part limits.
2. **Movement.** Six seconds alone on open ground. Out if it covers under a metre or sheds parts untouched. Its top speed is recorded.
3. **One fight** against the current champion. Out if knocked out.
4. **Three more fights**, against the machine it names as its target and others from the top and middle of the table.

A design is admitted if it beats the champion or wins two of its four fights. Admitted designs become opponents
in later rounds. Every fight is appended to `results.jsonl` with a short written account (who said what, what
came off whom, how near each got to the edge, how it ended), and each round's report is in `rounds/`. The
accounts are what the next round's designer reads in place of watching the fights.

A design file exports `build`, `program`, an `idea` (what is new about it) and optionally a `target`. It can use
any helper from `src/bots.js` through `kit.js`.
