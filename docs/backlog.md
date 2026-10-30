# Backlog

Items deliberately deferred from the MVP. Each needs an explicit decision before it is picked up.

| # | Item | Context | Constraint |
|---|---|---|---|
| B1 | Revisit the token-side fee split | MVP ships T1: token fees (paid on sells) split 60% creator / 40% treasury Safe. Alternatives: T2 (100% creator) or T3 (60% creator, 40% burned). See `decisions.md` §4. | `FeeSplitter` splits are immutable. Changing them means deploying a new `FeeSplitter` + `InstantLaunchStrategy`; existing tokens keep the old split forever. |
| B2 | Server-side keeper for `FeeSplitter.collectFees` | Would cut EOA claims to one signature per token. Rejected for MVP because it needs a hot key (`decisions.md` §8). | Use a CDP server wallet or similar, never a raw key in env. |
