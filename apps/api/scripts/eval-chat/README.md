# Chat Eval Criteria

Use these scripts to test chat quality before changing prompts, model settings, search behavior, or tool routing.

## What We Score

`criteria.json` defines weighted dimensions:

- `routing`: intent, sub-intent, and funnel stage accuracy.
- `response`: concise replies with expected wording and no forbidden wording.
- `commerce`: product cards, tool usage, stock handling, budget limits, and SKU/category relevance.
- `engagement`: suggested actions and a focused next question.
- `reliability`: non-empty responses and successful API calls.

Each case in `cases.json` still uses `expect` fields. The assertions produce both a pass/fail result and a weighted score from `0` to `100`.

## Run The Golden Eval

Start the API, then run:

```sh
API_URL=http://localhost:3001 WIDGET_API_KEY=pk_live_... npm run eval:chat
```

Useful thresholds:

```sh
EVAL_MIN_PASS_PCT=90 EVAL_MIN_SCORE=88 npm run eval:chat
```

## Run Retrieval-Focused Evals

These cases check whether the right context was retrieved before judging the final answer. The runner prints the top retrieved chunks for each case so failures can be triaged as recall, ranking, or generation problems.

```sh
API_URL=http://localhost:3001 WIDGET_API_KEY=pk_live_... npm run eval:retrieval
```

You can also point the runner at any compatible case file:

```sh
EVAL_CASES_PATH=apps/api/scripts/eval-chat/retrieval-cases.json npm run eval:chat
```

## Run Model Or Prompt Experiments

Copy the example variants and edit models, temperature, token limits, or prompt patches:

```sh
cp apps/api/scripts/eval-chat/variants.example.json apps/api/scripts/eval-chat/variants.local.json
```

Then run:

```sh
API_URL=http://localhost:3001 \
WIDGET_API_KEY=pk_live_... \
ADMIN_ACCESS_TOKEN=ey... \
EVAL_VARIANTS=apps/api/scripts/eval-chat/variants.local.json \
EVAL_RESULTS_PATH=tmp/chat-experiment-results.json \
npm run eval:chat:experiments
```

`ADMIN_ACCESS_TOKEN` is required for variants with `configPatch`. The runner patches tenant config for one variant at a time, runs all eval cases, then restores the original config.

## Choosing A Winner

Prefer the variant with the best weighted score only if it does not regress must-pass cases. For shopping behavior, treat `commerce` and `engagement` as high-risk dimensions: lower scores there usually mean the bot is either recommending the wrong products, showing cards too early, or failing to ask the next useful question.
