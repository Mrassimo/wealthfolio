export interface CurrentLawGainInput {
  grossGain: number;
  capitalLosses: number;
  acquisitionDate: string | Date;
  disposalDate: string | Date;
  eligibleForDiscount: boolean;
}

export interface CurrentLawGainResult {
  grossGain: number;
  capitalLossesApplied: number;
  netGainBeforeDiscount: number;
  discountEligible: boolean;
  discountApplied: number;
  taxableGain: number;
}

export interface IndexedGainInput {
  costBase: number;
  proceeds: number;
  indexationFactor: number;
}

export interface IndexedGainResult {
  costBase: number;
  proceeds: number;
  indexationFactor: number;
  indexedCostBase: number;
  realCapitalGain: number;
}

export interface TransitionGainInput {
  originalCostBase: number;
  transitionValueAt2027: number;
  proceeds: number;
  acquisitionDate: string | Date;
  disposalDate: string | Date;
  post2027IndexationFactor: number;
}

export interface TransitionGainResult {
  preCommencement: CurrentLawGainResult;
  postCommencement: IndexedGainResult;
  totalTaxableGain: number;
}

export interface MinimumTaxInput {
  realCapitalGain: number;
  taxOnGainBeforeTopUp: number;
  receivesIncomeSupport: boolean;
}

export interface MinimumTaxResult {
  minimumTaxRequired: number;
  topUpTax: number;
  exempt: boolean;
}

export interface WealthfolioCgtActivity {
  id: string;
  activityType: string;
  date: string | Date;
  quantity: string | number | null;
  unitPrice: string | number | null;
  amount: string | number | null;
  fee: string | number | null;
  currency: string;
  assetSymbol: string;
  assetName?: string;
  accountName: string;
  fxRate?: string | number | null;
}

export interface ClosedLot {
  symbol: string;
  assetName?: string;
  account: string;
  incomeYear: string;
  acquisitionDate: string;
  disposalDate: string;
  quantity: number;
  proceeds: number;
  costBase: number;
  grossGain: number;
  taxableGain: number;
  discountApplied: number;
  discountEligible: boolean;
  method: "FIFO";
}

export interface IncomeYearSummary {
  incomeYear: string;
  proceeds: number;
  costBase: number;
  grossGain: number;
  grossCapitalGains: number;
  capitalLossesApplied: number;
  discountApplied: number;
  taxableGain: number;
}

export interface CgtReport {
  closedLots: ClosedLot[];
  incomeYears: IncomeYearSummary[];
  unmatchedSells: UnmatchedSell[];
}

export interface UnmatchedSell {
  symbol: string;
  account: string;
  date: string;
  quantity: number;
  proceeds: number;
}

interface OpenLot {
  symbol: string;
  assetName?: string;
  account: string;
  acquisitionDate: string;
  remainingQuantity: number;
  unitCostBase: number;
}

interface IncomeYearAccumulator extends IncomeYearSummary {
  capitalLosses: number;
  nonDiscountGains: number;
  discountEligibleGains: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(`${value.slice(0, 10)}T00:00:00`);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function positive(value: number): number {
  return Math.max(0, value);
}

function numberValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isoDate(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAustralianIncomeYear(date: string | Date): string {
  const parsed = toDate(date);
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  const endYearShort = String(startYear + 1).slice(-2);
  return `${startYear}-${endYearShort}`;
}

function isHeldAtLeastTwelveMonths(acquisitionDate: string | Date, disposalDate: string | Date) {
  const acquisition = toDate(acquisitionDate);
  const disposal = toDate(disposalDate);
  return disposal.getTime() - acquisition.getTime() >= 365 * DAY_MS;
}

export function calculateCurrentLawTaxableGain(input: CurrentLawGainInput): CurrentLawGainResult {
  const grossGain = positive(input.grossGain);
  const lossesApplied = Math.min(grossGain, positive(input.capitalLosses));
  const netGainBeforeDiscount = roundCurrency(grossGain - lossesApplied);
  const discountEligible =
    input.eligibleForDiscount &&
    netGainBeforeDiscount > 0 &&
    isHeldAtLeastTwelveMonths(input.acquisitionDate, input.disposalDate);
  const discountApplied = discountEligible ? roundCurrency(netGainBeforeDiscount * 0.5) : 0;
  const taxableGain = roundCurrency(netGainBeforeDiscount - discountApplied);

  return {
    grossGain,
    capitalLossesApplied: lossesApplied,
    netGainBeforeDiscount,
    discountEligible,
    discountApplied,
    taxableGain,
  };
}

export function calculateIndexedGain(input: IndexedGainInput): IndexedGainResult {
  const indexedCostBase = roundCurrency(input.costBase * input.indexationFactor);
  const realCapitalGain = roundCurrency(positive(input.proceeds - indexedCostBase));

  return {
    costBase: input.costBase,
    proceeds: input.proceeds,
    indexationFactor: input.indexationFactor,
    indexedCostBase,
    realCapitalGain,
  };
}

export function calculateTransitionGain(input: TransitionGainInput): TransitionGainResult {
  const preCommencement = calculateCurrentLawTaxableGain({
    grossGain: input.transitionValueAt2027 - input.originalCostBase,
    capitalLosses: 0,
    acquisitionDate: input.acquisitionDate,
    disposalDate: "2027-07-01",
    eligibleForDiscount: true,
  });
  const postCommencement = calculateIndexedGain({
    costBase: input.transitionValueAt2027,
    proceeds: input.proceeds,
    indexationFactor: input.post2027IndexationFactor,
  });

  return {
    preCommencement,
    postCommencement,
    totalTaxableGain: roundCurrency(preCommencement.taxableGain + postCommencement.realCapitalGain),
  };
}

export function calculateMinimumTaxTopUp(input: MinimumTaxInput): MinimumTaxResult {
  const minimumTaxRequired = roundCurrency(positive(input.realCapitalGain) * 0.3);
  const exempt = input.receivesIncomeSupport || minimumTaxRequired === 0;
  const topUpTax = exempt
    ? 0
    : roundCurrency(positive(minimumTaxRequired - positive(input.taxOnGainBeforeTopUp)));

  return {
    minimumTaxRequired,
    topUpTax,
    exempt,
  };
}

export function buildCgtReport(activities: WealthfolioCgtActivity[]): CgtReport {
  const sortedActivities = [...activities].sort(
    (a, b) => toDate(a.date).getTime() - toDate(b.date).getTime(),
  );
  const lotsBySymbol = new Map<string, OpenLot[]>();
  const closedLots: ClosedLot[] = [];
  const unmatchedSells: UnmatchedSell[] = [];

  for (const activity of sortedActivities) {
    if (activity.activityType !== "BUY" && activity.activityType !== "SELL") {
      continue;
    }

    const symbol = activity.assetSymbol;
    const quantity = positive(numberValue(activity.quantity));
    if (!symbol || quantity === 0) continue;

    const fee = positive(numberValue(activity.fee));
    const unitPrice = positive(numberValue(activity.unitPrice));
    const totalAmount = positive(numberValue(activity.amount)) || unitPrice * quantity;
    const symbolLots = lotsBySymbol.get(symbol) ?? [];

    if (activity.activityType === "BUY") {
      symbolLots.push({
        symbol,
        assetName: activity.assetName,
        account: activity.accountName,
        acquisitionDate: isoDate(activity.date),
        remainingQuantity: quantity,
        unitCostBase: (totalAmount + fee) / quantity,
      });
      lotsBySymbol.set(symbol, symbolLots);
      continue;
    }

    let quantityToSell = quantity;
    const unitProceeds = (totalAmount - fee) / quantity;

    while (quantityToSell > 0 && symbolLots.length > 0) {
      const lot = symbolLots[0];
      const matchedQuantity = Math.min(quantityToSell, lot.remainingQuantity);
      const proceeds = roundCurrency(matchedQuantity * unitProceeds);
      const costBase = roundCurrency(matchedQuantity * lot.unitCostBase);
      const grossGain = roundCurrency(proceeds - costBase);
      const currentLawGain = calculateCurrentLawTaxableGain({
        grossGain,
        capitalLosses: 0,
        acquisitionDate: lot.acquisitionDate,
        disposalDate: activity.date,
        eligibleForDiscount: true,
      });

      closedLots.push({
        symbol,
        assetName: lot.assetName ?? activity.assetName,
        account: lot.account,
        incomeYear: getAustralianIncomeYear(activity.date),
        acquisitionDate: lot.acquisitionDate,
        disposalDate: isoDate(activity.date),
        quantity: roundCurrency(matchedQuantity),
        proceeds,
        costBase,
        grossGain,
        taxableGain: currentLawGain.taxableGain,
        discountApplied: currentLawGain.discountApplied,
        discountEligible: currentLawGain.discountEligible,
        method: "FIFO",
      });

      lot.remainingQuantity = roundCurrency(lot.remainingQuantity - matchedQuantity);
      quantityToSell = roundCurrency(quantityToSell - matchedQuantity);
      if (lot.remainingQuantity === 0) {
        symbolLots.shift();
      }
    }

    if (quantityToSell > 0) {
      unmatchedSells.push({
        symbol,
        account: activity.accountName,
        date: isoDate(activity.date),
        quantity: roundCurrency(quantityToSell),
        proceeds: roundCurrency(quantityToSell * unitProceeds),
      });
    }
  }

  const summaries = new Map<string, IncomeYearAccumulator>();
  for (const lot of closedLots) {
    const summary = summaries.get(lot.incomeYear) ?? {
      incomeYear: lot.incomeYear,
      proceeds: 0,
      costBase: 0,
      grossGain: 0,
      grossCapitalGains: 0,
      capitalLossesApplied: 0,
      discountApplied: 0,
      taxableGain: 0,
      capitalLosses: 0,
      nonDiscountGains: 0,
      discountEligibleGains: 0,
    };
    summary.proceeds = roundCurrency(summary.proceeds + lot.proceeds);
    summary.costBase = roundCurrency(summary.costBase + lot.costBase);
    summary.grossGain = roundCurrency(summary.grossGain + lot.grossGain);

    if (lot.grossGain < 0) {
      summary.capitalLosses += Math.abs(lot.grossGain);
    } else if (lot.discountEligible) {
      summary.discountEligibleGains += lot.grossGain;
    } else {
      summary.nonDiscountGains += lot.grossGain;
    }

    summaries.set(lot.incomeYear, summary);
  }

  for (const summary of summaries.values()) {
    const capitalLosses = positive(summary.capitalLosses);
    const nonDiscountGains = positive(summary.nonDiscountGains);
    const discountEligibleGains = positive(summary.discountEligibleGains);
    const lossesAppliedToNonDiscountGains = Math.min(nonDiscountGains, capitalLosses);
    const remainingLosses = capitalLosses - lossesAppliedToNonDiscountGains;
    const lossesAppliedToDiscountGains = Math.min(discountEligibleGains, remainingLosses);
    const remainingNonDiscountGains = nonDiscountGains - lossesAppliedToNonDiscountGains;
    const remainingDiscountGains = discountEligibleGains - lossesAppliedToDiscountGains;

    summary.grossCapitalGains = roundCurrency(nonDiscountGains + discountEligibleGains);
    summary.capitalLossesApplied = roundCurrency(
      lossesAppliedToNonDiscountGains + lossesAppliedToDiscountGains,
    );
    summary.discountApplied = roundCurrency(remainingDiscountGains * 0.5);
    summary.taxableGain = roundCurrency(remainingNonDiscountGains + remainingDiscountGains * 0.5);
  }

  const incomeYears = [...summaries.values()]
    .map(
      ({
        capitalLosses: _capitalLosses,
        nonDiscountGains: _nonDiscountGains,
        discountEligibleGains: _discountEligibleGains,
        ...summary
      }) => summary,
    )
    .sort((a, b) => a.incomeYear.localeCompare(b.incomeYear));

  return {
    closedLots,
    incomeYears,
    unmatchedSells,
  };
}

export function exportReportCsv(report: CgtReport): string {
  const header = [
    "incomeYear",
    "symbol",
    "account",
    "quantity",
    "acquisitionDate",
    "disposalDate",
    "proceeds",
    "costBase",
    "grossGain",
    "capitalLossesApplied",
    "discountApplied",
    "taxableGain",
    "method",
  ];
  const rows = report.closedLots.map((lot) =>
    [
      lot.incomeYear,
      lot.symbol,
      lot.account,
      lot.quantity,
      lot.acquisitionDate,
      lot.disposalDate,
      lot.proceeds,
      lot.costBase,
      lot.grossGain,
      lot.grossGain < 0 ? Math.abs(lot.grossGain) : 0,
      lot.discountApplied,
      lot.taxableGain,
      lot.method,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}
