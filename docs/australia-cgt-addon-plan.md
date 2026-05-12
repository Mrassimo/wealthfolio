# Australia CGT Addon Goal

## Goal

Build a Wealthfolio addon that helps Australian resident investors estimate
capital gains outcomes from Wealthfolio activity history, with explicit support
for current CGT settings and the 2026-27 Budget CGT transition rules.

The addon must be useful as a planning and reconciliation tool, not as tax
advice. Every calculation screen and export should make assumptions visible:
resident individual/trust/partnership treatment, income year, marginal tax rate,
Medicare levy handling, income-support minimum-tax exemption, valuation method
for 1 July 2027 transition assets, and whether a residential property is a new
build.

## Current Rule Baseline

For eligible Australian resident individuals under current settings:

- Capital gains are included in assessable income rather than taxed as a
  separate standalone tax.
- Capital losses are applied before any CGT discount.
- The 50 percent CGT discount applies to eligible gains where the asset has been
  held for at least 12 months.
- CGT timing follows the CGT event date; for sales, this is generally contract
  date rather than settlement date.

## 2026-27 Budget Rule Track

The Budget measure announced on 12 May 2026 changes the future track from 1 July
2027:

- Replace the 50 percent CGT discount for individuals, trusts, and partnerships
  with CPI cost-base indexation and a 30 percent minimum tax rate on real
  capital gains.
- Apply the new CGT treatment only to gains accruing after 1 July 2027.
- For assets owned before 1 July 2027 and sold after that date, split the gain:
  pre-commencement gain uses current 50 percent discount treatment, and
  post-commencement gain uses indexation plus minimum-tax treatment.
- Allow the 1 July 2027 value to come from a quoted market value or a specified
  apportionment formula once ATO tooling/guidance is available.
- Keep pre-1985 gains accrued before 1 July 2027 exempt.
- Preserve the main-residence exemption, small-business CGT concessions, and the
  existing 60 percent affordable-housing discount.
- Let new residential build investors choose between the 50 percent CGT discount
  and the new indexation/minimum-tax method when they sell.

## Product Scope

The first useful addon should include:

- A sidebar item and route, `Australia CGT`.
- Read-only ingestion from Wealthfolio accounts, activities, holdings, exchange
  rates, and asset metadata where available.
- Per-asset lot matching with FIFO by default, plus a visible method selector.
- Realized-gain report by Australian income year.
- Unrealized-gain preview for currently held lots.
- A 2027 transition worksheet that separates pre- and post-1 July 2027 gains.
- Scenario controls for marginal tax rate, Medicare levy inclusion, CPI path,
  income-support exemption, and new-build eligibility.
- CSV export suitable for accountant review, including lot-level assumptions.

Defer until after the first working version:

- Lodgement-ready ATO forms.
- Complex trust distribution modelling.
- DRP-specific reconstruction where Wealthfolio does not already hold the
  underlying reinvestment transactions.
- Corporate-action inference beyond explicit split activities.

## Calculation Engine

Put the tax engine in pure TypeScript functions under the addon so it can be
tested independently from React:

- Normalize activities into asset lots.
- Match disposals to acquisition lots.
- Include brokerage/fees in cost base and disposal proceeds according to the
  direction of the activity.
- Preserve currency and FX assumptions on every lot.
- Apply capital losses before discounts or indexation.
- Gate the 12-month discount on acquisition and disposal dates.
- Split transition assets at 1 July 2027 using either quoted value or
  apportionment input.
- Apply minimum tax only to post-1 July 2027 real capital gains when the
  scenario requires it.

## E2E Acceptance Path

Use the repo-native Playwright web E2E harness, not a mocked shortcut:

```bash
pnpm test:e2e
```

For iteration on this addon, add a focused spec such as
`e2e/14-australia-cgt-addon.spec.ts` that runs against the real frontend and
backend with a fresh SQLite database.

The focused E2E should cover:

- Onboarding into AUD as the base currency.
- Creating an Australian taxable account.
- Importing or creating buy, sell, dividend, fee, split, and transfer-like
  activity fixtures through the same UI/API paths used by Wealthfolio.
- Loading the addon route through the Wealthfolio addon runtime.
- Confirming the sidebar item appears and the addon reads real activities via
  `ctx.api.activities.getAll`.
- Verifying a current-law realized gain: FIFO lot, fees included, loss applied
  before the 50 percent discount, and income-year grouping.
- Verifying a no-discount disposal held for less than 12 months.
- Verifying a post-1 July 2027 share sale using indexed cost base and the 30
  percent minimum-tax top-up for a low-income scenario.
- Verifying a transition asset bought before 1 July 2027 and sold after, with
  pre-commencement and post-commencement components shown separately.
- Verifying CSV export includes the same totals shown in the UI.

## Unit And Fixture Tests

The E2E test should be backed by deterministic engine tests:

- Current law, long-held gain: buy for 100, sell for 160 after 12 months,
  taxable gain is 30 before income-tax-rate application.
- Current law, short-held gain: buy for 100, sell for 160 inside 12 months,
  taxable gain is 60 before income-tax-rate application.
- Loss ordering: a capital loss offsets gross gains before the discount.
- CPI indexation: buy 100 on 1 July 2027, sell 125 on 1 July 2032, indexed cost
  base 113, taxable real gain 12.
- Transition split: pre-2027 cost base, 1 July 2027 value, and later disposal
  produce separate old/new treatment components.
- Minimum-tax top-up: low ordinary-income scenario pays extra tax to bring tax
  on real capital gain to 30 percent unless exempt.
- Pre-CGT legacy asset: pre-1 July 2027 gain remains exempt, post-1 July 2027
  gain remains calculable under the new rules.

## Environment Gaps Found

This workspace has Node available, but `pnpm` and Rust are not currently on
PATH. Before implementation verification, install or expose:

- `pnpm`
- Rust toolchain with `rustc` and `cargo`
- Chrome for Playwright, if not already installed

After that, run:

```bash
pnpm install
pnpm --filter australia-cgt-addon type-check
pnpm --filter australia-cgt-addon build
pnpm test:e2e -- e2e/14-australia-cgt-addon.spec.ts
pnpm test:e2e
```
