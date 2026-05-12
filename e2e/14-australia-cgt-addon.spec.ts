import { expect, Page, test } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { BASE_URL, createAccount, loginIfNeeded } from "./helpers";

test.describe.configure({ mode: "serial" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "australia-cgt-addon.csv");
const ACCOUNT_NAME = "Australian Taxable";

async function completeAudOnboardingIfNeeded(page: Page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  const continueButton = page.getByRole("button", { name: "Continue" });
  const loginInput = page.getByPlaceholder("Enter your password");
  const dashboardHeading = page.getByRole("heading", { name: "Dashboard" });
  const accountsHeading = page.getByRole("heading", { name: "Accounts" });

  await expect(continueButton.or(loginInput).or(dashboardHeading).or(accountsHeading)).toBeVisible({
    timeout: 120000,
  });

  if (await loginInput.isVisible()) {
    await loginIfNeeded(page);
    return;
  }

  if (!(await continueButton.isVisible())) return;

  await continueButton.click();
  await expect(page.getByTestId("currency-aud-button")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("currency-aud-button").click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("theme-light-button")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("theme-light-button").click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("onboarding-finish-button")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("onboarding-finish-button").click();

  await page.waitForURL(new RegExp(`${BASE_URL}/settings/accounts`), { timeout: 15000 });
}

async function selectImportAccount(page: Page, accountName: string) {
  const selectorTrigger = page.getByRole("combobox", { name: /Select an account/i });
  await expect(selectorTrigger).toBeVisible({ timeout: 5000 });
  await selectorTrigger.click();

  const searchInput = page.getByPlaceholder("Search accounts...");
  await searchInput.fill(accountName);

  const accountOption = page.getByRole("option", { name: new RegExp(accountName, "i") }).first();
  await expect(accountOption).toBeVisible({ timeout: 5000 });
  await accountOption.click();
}

async function importCgtFixture(page: Page) {
  await page.goto(`${BASE_URL}/import`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Import Activities/i })).toBeVisible({
    timeout: 10000,
  });

  await selectImportAccount(page, ACCOUNT_NAME);

  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByText("CSV Preview")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/3 row/i)).toBeVisible({ timeout: 5000 });

  await page.getByRole("button", { name: /Configure Mapping/i }).click();
  await expect(page.getByRole("button", { name: /Review Assets/i })).toBeEnabled({
    timeout: 10000,
  });
  await page.getByRole("button", { name: /Review Assets/i }).click();

  await expect(page.getByRole("button", { name: /Review Activities/i })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole("button", { name: /Review Activities/i }).click();

  await expect(page.getByRole("button", { name: /Continue to Import/i })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole("button", { name: /Continue to Import/i }).click();

  const importButton = page.getByRole("button", { name: /Import \d+ Activit/i });
  await expect(importButton).toBeEnabled({ timeout: 10000 });
  await importButton.click();

  await expect(page.getByText("Import Complete")).toBeVisible({ timeout: 60000 });
}

test.describe("Australia CGT addon", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("loads from addon dev mode and reports imported AUD CGT lots", async () => {
    test.setTimeout(240000);
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(error.message);
    });

    await completeAudOnboardingIfNeeded(page);
    await createAccount(page, ACCOUNT_NAME, "AUD", "Transactions");
    await importCgtFixture(page);

    await page.goto(`${BASE_URL}/addons/australia-cgt`, { waitUntil: "domcontentloaded" });
    const cgtHeading = page.getByRole("heading", { name: "Australia CGT" });
    const errorHeading = page.getByRole("heading", { name: "Something went wrong" });
    await expect(cgtHeading.or(errorHeading)).toBeVisible({ timeout: 30000 });
    if (await errorHeading.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Show error details" }).click();
      const bodyText = await page.locator("body").innerText();
      throw new Error(
        `Australia CGT route rendered app error.\n\n${bodyText}\n\nBrowser errors:\n${browserErrors.join("\n")}`,
      );
    }
    await expect(cgtHeading).toBeVisible();

    await expect(page.getByText("2025-26")).toBeVisible();
    await expect(page.getByText("VAS").first()).toBeVisible();
    await expect(page.getByText("$296").first()).toBeVisible();

    const exportButton = page.getByRole("button", { name: /Export CSV/i });
    await expect(exportButton).toBeEnabled();
  });
});
