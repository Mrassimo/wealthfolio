import { QueryClientProvider, useQuery, type QueryClient } from "@tanstack/react-query";
import type { ActivityDetails, AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import { Button, Icons, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import React, { useMemo, useState } from "react";
import {
  buildCgtReport,
  calculateMinimumTaxTopUp,
  exportReportCsv,
  type CgtReport,
} from "./lib/cgt-engine";

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function downloadCsv(report: CgtReport) {
  const csv = exportReportCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wealthfolio-australia-cgt-report.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function AustraliaCgtPage({ ctx }: { ctx: AddonContext }) {
  const [ordinaryIncomeTaxOnGain, setOrdinaryIncomeTaxOnGain] = useState(1400);
  const [minimumTaxExempt, setMinimumTaxExempt] = useState(false);

  const activitiesQuery = useQuery<ActivityDetails[]>({
    queryKey: ["australia-cgt", "activities"],
    queryFn: () => ctx.api.activities.getAll(),
    staleTime: 60_000,
  });

  const report = useMemo(
    () => buildCgtReport((activitiesQuery.data ?? []) as Parameters<typeof buildCgtReport>[0]),
    [activitiesQuery.data],
  );
  const latestIncomeYear = report.incomeYears.at(-1);
  const minimumTax = calculateMinimumTaxTopUp({
    realCapitalGain: latestIncomeYear?.taxableGain ?? 0,
    taxOnGainBeforeTopUp: ordinaryIncomeTaxOnGain,
    receivesIncomeSupport: minimumTaxExempt,
  });

  const header = (
    <PageHeader
      actions={
        <Button
          disabled={report.closedLots.length === 0}
          onClick={() => downloadCsv(report)}
          variant="outline"
        >
          <Icons.Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icons.Percent className="text-primary h-5 w-5" />
          <h1 className="text-xl font-semibold">Australia CGT</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Current-law CGT estimates with 2026-27 Budget transition assumptions surfaced for review.
        </p>
      </div>
    </PageHeader>
  );

  if (activitiesQuery.isLoading) {
    return (
      <Page>
        {header}
        <PageContent>
          <div className="flex min-h-[40vh] items-center justify-center">
            <Icons.Loader className="text-primary h-8 w-8 animate-spin" />
          </div>
        </PageContent>
      </Page>
    );
  }

  if (activitiesQuery.error) {
    return (
      <Page>
        {header}
        <PageContent>
          <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-4 text-sm">
            Failed to load Wealthfolio activities: {(activitiesQuery.error as Error).message}
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      {header}
      <PageContent>
        <div className="flex flex-col gap-6">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">Closed lots</p>
              <p className="mt-2 text-2xl font-semibold">{report.closedLots.length}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">Proceeds</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatAud(report.incomeYears.reduce((sum, year) => sum + year.proceeds, 0))}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">Gross gains</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatAud(report.incomeYears.reduce((sum, year) => sum + year.grossGain, 0))}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">Losses applied</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatAud(
                  report.incomeYears.reduce((sum, year) => sum + year.capitalLossesApplied, 0),
                )}
              </p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-muted-foreground text-xs font-medium uppercase">Taxable gains</p>
              <p className="mt-2 text-2xl font-semibold">
                {formatAud(report.incomeYears.reduce((sum, year) => sum + year.taxableGain, 0))}
              </p>
            </div>
          </section>

          {report.unmatchedSells.length > 0 ? (
            <section className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <div className="flex items-start gap-3">
                <Icons.AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h2 className="font-semibold">Unmatched sells need review</h2>
                  <p className="mt-1">
                    {report.unmatchedSells.length} disposal
                    {report.unmatchedSells.length === 1 ? "" : "s"} could not be fully matched to
                    earlier buy lots. Totals exclude the unmatched quantity until the missing
                    acquisition history is added.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-md border p-4">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="text-base font-semibold">Budget 2026-27 Scenario</h2>
              <p className="text-muted-foreground text-sm">
                From 1 July 2027, planned settings replace the 50 percent discount with CPI
                indexation plus a 30 percent minimum tax on real capital gains.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm">
                Tax on gain before minimum-tax top-up
                <input
                  className="rounded-md border bg-transparent px-3 py-2"
                  inputMode="decimal"
                  type="number"
                  value={ordinaryIncomeTaxOnGain}
                  onChange={(event) => setOrdinaryIncomeTaxOnGain(Number(event.target.value))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={minimumTaxExempt}
                  type="checkbox"
                  onChange={(event) => setMinimumTaxExempt(event.target.checked)}
                />
                Income-support minimum-tax exemption
              </label>
              <div className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-900">
                <p className="text-muted-foreground">Estimated top-up on latest income year</p>
                <p className="mt-1 text-lg font-semibold">{formatAud(minimumTax.topUpTax)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-md border">
            <div className="border-b p-4">
              <h2 className="text-base font-semibold">Income Year Summary</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Income year</th>
                    <th className="px-4 py-3 text-right font-medium">Proceeds</th>
                    <th className="px-4 py-3 text-right font-medium">Cost base</th>
                    <th className="px-4 py-3 text-right font-medium">Gross gain</th>
                    <th className="px-4 py-3 text-right font-medium">Losses applied</th>
                    <th className="px-4 py-3 text-right font-medium">Discount</th>
                    <th className="px-4 py-3 text-right font-medium">Taxable gain</th>
                  </tr>
                </thead>
                <tbody>
                  {report.incomeYears.map((year) => (
                    <tr key={year.incomeYear} className="border-t">
                      <td className="px-4 py-3 font-medium">{year.incomeYear}</td>
                      <td className="px-4 py-3 text-right">{formatAud(year.proceeds)}</td>
                      <td className="px-4 py-3 text-right">{formatAud(year.costBase)}</td>
                      <td className="px-4 py-3 text-right">{formatAud(year.grossGain)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatAud(year.capitalLossesApplied)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatAud(year.discountApplied)}</td>
                      <td className="px-4 py-3 text-right">{formatAud(year.taxableGain)}</td>
                    </tr>
                  ))}
                  {report.incomeYears.length === 0 ? (
                    <tr>
                      <td className="text-muted-foreground px-4 py-8 text-center" colSpan={7}>
                        No matched BUY/SELL lots found yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border">
            <div className="border-b p-4">
              <h2 className="text-base font-semibold">Matched Lots</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 text-right font-medium">Quantity</th>
                    <th className="px-4 py-3 font-medium">Acquired</th>
                    <th className="px-4 py-3 font-medium">Disposed</th>
                    <th className="px-4 py-3 text-right font-medium">Gain</th>
                    <th className="px-4 py-3 text-right font-medium">Discount</th>
                    <th className="px-4 py-3 text-right font-medium">Taxable</th>
                  </tr>
                </thead>
                <tbody>
                  {report.closedLots.map((lot, index) => (
                    <tr
                      key={`${lot.symbol}-${lot.acquisitionDate}-${lot.disposalDate}-${index}`}
                      className="border-t"
                    >
                      <td className="px-4 py-3 font-medium">{lot.symbol}</td>
                      <td className="px-4 py-3">{lot.account}</td>
                      <td className="px-4 py-3 text-right">{lot.quantity}</td>
                      <td className="px-4 py-3">{lot.acquisitionDate}</td>
                      <td className="px-4 py-3">{lot.disposalDate}</td>
                      <td
                        className={
                          lot.grossGain < 0
                            ? "px-4 py-3 text-right text-red-600"
                            : "px-4 py-3 text-right"
                        }
                      >
                        {formatAud(lot.grossGain)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatAud(lot.discountApplied)}</td>
                      <td className="px-4 py-3 text-right">{formatAud(lot.taxableGain)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </PageContent>
    </Page>
  );
}

const enable: AddonEnableFunction = (ctx) => {
  ctx.api.logger.info("Australia CGT addon is being enabled");

  const sidebarItem = ctx.sidebar.addItem({
    id: "australia-cgt-addon",
    label: "Australia CGT",
    icon: <Icons.Percent className="h-5 w-5" />,
    route: "/addons/australia-cgt",
    order: 210,
  });

  const AustraliaCgtWrapper = () => {
    const sharedQueryClient = ctx.api.query.getClient() as QueryClient;
    return (
      <QueryClientProvider client={sharedQueryClient}>
        <AustraliaCgtPage ctx={ctx} />
      </QueryClientProvider>
    );
  };

  ctx.router.add({
    path: "/addons/australia-cgt",
    component: React.lazy(() => Promise.resolve({ default: AustraliaCgtWrapper })),
  });

  ctx.onDisable(() => {
    sidebarItem.remove();
    ctx.api.logger.info("Australia CGT addon disabled");
  });
};

export default enable;
