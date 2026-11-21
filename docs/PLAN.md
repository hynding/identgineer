# Plan

Identgineer is delivered as 14 features, in order. Each is a GitHub issue.

| #   | Feature                                                                                              | Depends on |
| --- | ---------------------------------------------------------------------------------------------------- | ---------- |
| 1   | [Monorepo foundation, README and security baseline](https://github.com/hynding/identgineer/issues/1) | none       |
| 2   | [Design tokens and eight themes](https://github.com/hynding/identgineer/issues/2)                    | 1          |
| 3   | [Eight design languages and eight UX modes](https://github.com/hynding/identgineer/issues/3)         | 2          |
| 4   | [Stencil component library](https://github.com/hynding/identgineer/issues/4)                         | 2, 3       |
| 5   | [Eight interchangeable layouts](https://github.com/hynding/identgineer/issues/5)                     | 4          |
| 6   | [Variation runtime and switcher](https://github.com/hynding/identgineer/issues/6)                    | 2, 3, 5    |
| 7   | [CMS content model with camis](https://github.com/hynding/identgineer/issues/7)                      | 1          |
| 8   | [Identity domain](https://github.com/hynding/identgineer/issues/8)                                   | 4, 7       |
| 9   | [Tracking domain](https://github.com/hynding/identgineer/issues/9)                                   | 4, 7, 8    |
| 10  | [Project website](https://github.com/hynding/identgineer/issues/10)                                  | 4, 6       |
| 11  | [Sandbox/testbed](https://github.com/hynding/identgineer/issues/11)                                  | 4, 6, 10   |
| 12  | [Framework wrappers and package publishing](https://github.com/hynding/identgineer/issues/12)        | 4, 6, 8, 9 |
| 13  | [Security hardening](https://github.com/hynding/identgineer/issues/13)                               | 8, 9       |
| 14  | [Deployment to shared hosting](https://github.com/hynding/identgineer/issues/14)                     | 7, 10, 13  |

Dependencies are on features being merged. Features with no shared dependency (for example 7 and 2) can proceed in either order.

## Working process

1. One GitHub issue per feature, with acceptance criteria.
2. One pull request per feature, or per stacked task when a feature is large. Each branch is
   created from the previous one so every pull request stays small and reviewable.
3. Tests come first; every pull request passes format, lint, typecheck and test in CI.
4. Each pull request is reviewed and revised until the review is clean, then merged.
