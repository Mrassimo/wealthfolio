# Australia CGT Addon

Australia CGT is a Wealthfolio addon for estimating Australian capital gains
outcomes from portfolio activity history.

It is a planning and reconciliation tool, not tax advice. The addon surfaces the
assumptions used for every scenario, including current-law 50 percent CGT
discount treatment and the 2026-27 Budget transition to CPI indexation and a 30
percent minimum tax on real capital gains from 1 July 2027.

## Development

```bash
pnpm --filter australia-cgt-addon test
pnpm --filter australia-cgt-addon type-check
pnpm --filter australia-cgt-addon build
```

Full app acceptance should use Wealthfolio's repo-native E2E harness:

```bash
pnpm test:e2e -- e2e/14-australia-cgt-addon.spec.ts
```
