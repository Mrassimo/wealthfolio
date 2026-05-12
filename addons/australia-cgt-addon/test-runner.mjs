import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const addonRoot = new URL(".", import.meta.url);
const engineUrl = new URL("src/lib/cgt-engine.ts", addonRoot);
const tempDir = await mkdtemp(path.join(tmpdir(), "australia-cgt-addon-"));
const compiledEnginePath = path.join(tempDir, "cgt-engine.mjs");

async function importEngine() {
  const source = await (await import("node:fs/promises")).readFile(engineUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  await writeFile(compiledEnginePath, compiled.outputText, "utf8");
  return import(`file://${compiledEnginePath}`);
}

const {
  buildCgtReport,
  calculateCurrentLawTaxableGain,
  calculateIndexedGain,
  calculateMinimumTaxTopUp,
  calculateTransitionGain,
  exportReportCsv,
} = await importEngine();

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("current law halves an eligible long-held gain after losses", () => {
  const result = calculateCurrentLawTaxableGain({
    grossGain: 60,
    capitalLosses: 0,
    acquisitionDate: "2024-07-01",
    disposalDate: "2026-07-02",
    eligibleForDiscount: true,
  });

  assert.equal(result.taxableGain, 30);
  assert.equal(result.discountApplied, 30);
});

test("current law does not discount a short-held gain", () => {
  const result = calculateCurrentLawTaxableGain({
    grossGain: 60,
    capitalLosses: 0,
    acquisitionDate: "2026-01-01",
    disposalDate: "2026-06-30",
    eligibleForDiscount: true,
  });

  assert.equal(result.taxableGain, 60);
  assert.equal(result.discountApplied, 0);
});

test("current law applies capital losses before the discount", () => {
  const result = calculateCurrentLawTaxableGain({
    grossGain: 100,
    capitalLosses: 40,
    acquisitionDate: "2024-07-01",
    disposalDate: "2026-07-02",
    eligibleForDiscount: true,
  });

  assert.equal(result.netGainBeforeDiscount, 60);
  assert.equal(result.taxableGain, 30);
});

test("indexation taxes the real gain after CPI uplift", () => {
  const result = calculateIndexedGain({
    costBase: 100,
    proceeds: 125,
    indexationFactor: 1.13,
  });

  assert.equal(result.indexedCostBase, 113);
  assert.equal(result.realCapitalGain, 12);
});

test("transition assets split pre-2027 discount and post-2027 indexation components", () => {
  const result = calculateTransitionGain({
    originalCostBase: 800000,
    transitionValueAt2027: 1131371,
    proceeds: 1600000,
    acquisitionDate: "2022-07-01",
    disposalDate: "2032-07-01",
    post2027IndexationFactor: 1.131407822898059,
  });

  assert.equal(result.preCommencement.taxableGain, 165685.5);
  assert.equal(Math.round(result.postCommencement.realCapitalGain), 319958);
  assert.equal(Math.round(result.totalTaxableGain), 485644);
});

test("minimum tax tops low-rate capital gain tax up to 30 percent unless exempt", () => {
  const result = calculateMinimumTaxTopUp({
    realCapitalGain: 10000,
    taxOnGainBeforeTopUp: 1400,
    receivesIncomeSupport: false,
  });

  assert.equal(result.minimumTaxRequired, 3000);
  assert.equal(result.topUpTax, 1600);

  const exempt = calculateMinimumTaxTopUp({
    realCapitalGain: 10000,
    taxOnGainBeforeTopUp: 1400,
    receivesIncomeSupport: true,
  });

  assert.equal(exempt.topUpTax, 0);
});

test("report matches FIFO lots, includes fees, groups by Australian income year, and exports CSV", () => {
  const activities = [
    {
      id: "buy-1",
      activityType: "BUY",
      date: new Date("2024-07-01T10:00:00Z"),
      quantity: "10",
      unitPrice: "100",
      fee: "10",
      amount: "1000",
      currency: "AUD",
      assetSymbol: "VAS.AX",
      assetName: "Vanguard Australian Shares",
      accountName: "Australian Taxable",
    },
    {
      id: "buy-2",
      activityType: "BUY",
      date: new Date("2026-03-01T10:00:00Z"),
      quantity: "10",
      unitPrice: "120",
      fee: "10",
      amount: "1200",
      currency: "AUD",
      assetSymbol: "VAS.AX",
      assetName: "Vanguard Australian Shares",
      accountName: "Australian Taxable",
    },
    {
      id: "sell-1",
      activityType: "SELL",
      date: new Date("2026-08-01T10:00:00Z"),
      quantity: "12",
      unitPrice: "150",
      fee: "12",
      amount: "1800",
      currency: "AUD",
      assetSymbol: "VAS.AX",
      assetName: "Vanguard Australian Shares",
      accountName: "Australian Taxable",
    },
  ];

  const report = buildCgtReport(activities);

  assert.equal(report.closedLots.length, 2);
  assert.equal(report.closedLots[0].quantity, 10);
  assert.equal(report.closedLots[0].taxableGain, 240);
  assert.equal(report.closedLots[1].quantity, 2);
  assert.equal(report.closedLots[1].taxableGain, 56);
  assert.equal(report.incomeYears[0].incomeYear, "2026-27");
  assert.equal(report.incomeYears[0].taxableGain, 296);

  const csv = exportReportCsv(report);
  assert.match(csv, /incomeYear,symbol,account,quantity,acquisitionDate,disposalDate/);
  assert.match(csv, /"2026-27","VAS\.AX","Australian Taxable","10"/);
});

test("report accepts API timestamp date strings", () => {
  const report = buildCgtReport([
    {
      id: "buy-api",
      activityType: "BUY",
      date: "2024-07-01T10:00:00.000Z",
      quantity: "1",
      unitPrice: "100",
      fee: "0",
      amount: "100",
      currency: "AUD",
      assetSymbol: "API.AX",
      accountName: "Australian Taxable",
    },
    {
      id: "sell-api",
      activityType: "SELL",
      date: "2026-05-01T10:00:00.000Z",
      quantity: "1",
      unitPrice: "160",
      fee: "0",
      amount: "160",
      currency: "AUD",
      assetSymbol: "API.AX",
      accountName: "Australian Taxable",
    },
  ]);

  assert.equal(report.incomeYears[0].incomeYear, "2025-26");
  assert.equal(report.closedLots[0].acquisitionDate, "2024-07-01");
  assert.equal(report.closedLots[0].disposalDate, "2026-05-01");
  assert.equal(report.closedLots[0].taxableGain, 30);
});

test("income year summary applies capital losses before discount", () => {
  const report = buildCgtReport([
    {
      id: "gain-buy",
      activityType: "BUY",
      date: "2024-07-01",
      quantity: "1",
      unitPrice: "100",
      fee: "0",
      amount: "100",
      currency: "AUD",
      assetSymbol: "GAIN.AX",
      accountName: "Australian Taxable",
    },
    {
      id: "loss-buy",
      activityType: "BUY",
      date: "2024-07-01",
      quantity: "1",
      unitPrice: "100",
      fee: "0",
      amount: "100",
      currency: "AUD",
      assetSymbol: "LOSS.AX",
      accountName: "Australian Taxable",
    },
    {
      id: "gain-sell",
      activityType: "SELL",
      date: "2026-05-01",
      quantity: "1",
      unitPrice: "200",
      fee: "0",
      amount: "200",
      currency: "AUD",
      assetSymbol: "GAIN.AX",
      accountName: "Australian Taxable",
    },
    {
      id: "loss-sell",
      activityType: "SELL",
      date: "2026-05-01",
      quantity: "1",
      unitPrice: "60",
      fee: "0",
      amount: "60",
      currency: "AUD",
      assetSymbol: "LOSS.AX",
      accountName: "Australian Taxable",
    },
  ]);

  assert.equal(report.incomeYears[0].grossGain, 60);
  assert.equal(report.incomeYears[0].capitalLossesApplied, 40);
  assert.equal(report.incomeYears[0].discountApplied, 30);
  assert.equal(report.incomeYears[0].taxableGain, 30);
});

test("report surfaces unmatched sell quantities for review", () => {
  const report = buildCgtReport([
    {
      id: "buy-one",
      activityType: "BUY",
      date: "2025-01-01",
      quantity: "1",
      unitPrice: "100",
      fee: "0",
      amount: "100",
      currency: "AUD",
      assetSymbol: "SHORT.AX",
      accountName: "Australian Taxable",
    },
    {
      id: "sell-two",
      activityType: "SELL",
      date: "2026-05-01",
      quantity: "2",
      unitPrice: "150",
      fee: "0",
      amount: "300",
      currency: "AUD",
      assetSymbol: "SHORT.AX",
      accountName: "Australian Taxable",
    },
  ]);

  assert.equal(report.closedLots.length, 1);
  assert.equal(report.unmatchedSells.length, 1);
  assert.equal(report.unmatchedSells[0].symbol, "SHORT.AX");
  assert.equal(report.unmatchedSells[0].quantity, 1);
});

let failures = 0;

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

await rm(tempDir, { recursive: true, force: true });

if (failures > 0) {
  process.exitCode = 1;
}
