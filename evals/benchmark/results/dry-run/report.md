# PD-24a benchmark — dry-run

- Started 2026-11-05T10:20:16.634Z, finished 2026-11-05T10:20:16.975Z
- Spending cap 0 USD, spent 0.0000 USD
- Stopped early: no
- Real-site annotations: 0 reviewed, 28 draft

| Config | Cases | Gates                             | Unsupported | Forbidden | Exclusion | 1st-attempt valid | Lost | Recall | Cost USD | Mean / p95 per real site | p95 latency s |
| ------ | ----: | --------------------------------- | ----------: | --------: | --------: | ----------------: | ---: | -----: | -------: | ------------------------ | ------------: |
| FAKE   |    39 | fail (forbidden, exclusion, lost) |       0.8 % |         2 |    87.2 % |            97.3 % |    2 | 11.2 % |   0.0000 | 0.0000 / 0.0000          |           0.0 |

## Details

### FAKE — fake provider (dry run, zero cost)

Models: D5 `fake-extraction-1`, D6 `fake-verification-1`.

- `adv-discontinued`: forbidden: plan Starter; forbidden: plan Growth
- `buttondown`: unsupported: number not in quote — pricing:Buttondown: Buttondown $4,971 /mo
- `frase`: exclusion none (expected eligible); error: SCHEMA_INVALID: pricing_plans.10.quote: Too small: expected string to have >=3 characters
- `convertflow`: exclusion none (expected eligible); error: SCHEMA_INVALID: pricing_plans.14.quote: Too small: expected string to have >=3 characters
- `growsurf`: exclusion eligible (expected needs_review)
- `rewardful`: unsupported: number not in quote — pricing:Up to: Up to $7,500/month in affiliate-attributed revenue; unsupported: number not in quote — pricing:Up to: Up to $7,500/month in affiliate-attributed revenue; exclusion eligible (expected excluded)
- `firstpromoter`: exclusion eligible (expected excluded)
- `outseta`: unsupported: number not in quote — pricing:Plan 2: $49,835; unsupported: number not in quote — pricing:Plan 10: $1,836/yr.
