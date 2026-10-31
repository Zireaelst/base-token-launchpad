import { readBuilderCodes } from "@launchpad/sdk";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import type { Address } from "viem";
import { installWallet } from "./wallet";

/**
 * The definition-of-done flow on a Base fork, through the real UI and a real (forked) chain:
 * create → buy → sell → claim. Every transaction the app sent must carry our Builder Code.
 */
// Fresh creator and ticker per run, so state from earlier runs on the same fork cannot leak in.
const run = Date.now() % 1_000_000;
const creator = `0x00000000000000000000000000000000c0${run.toString(16).padStart(6, "0")}` as Address;
const ticker = `E${run}`;

test("create → buy → sell → claim", async ({ page }) => {
  const wallet = await installWallet(page, creator);
  const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#0052ff" } })
    .png()
    .toBuffer();

  // Create: one page, one button, one signature (with a first buy in the same tx).
  await page.goto("/create");
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("menuitem", { name: /Browser wallet|Injected/ }).click();
  await page
    .getByLabel("Token image")
    .setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: image });
  await expect(page.getByText("uploading")).toBeHidden();
  await page.getByLabel(/^Name/).fill("E2E Dot");
  await page.getByLabel(/^Ticker/).fill(ticker);
  await page.getByLabel(/^First buy/).fill("0.01");
  await page.getByRole("button", { name: `Launch $${ticker}` }).click();

  await page.waitForURL(/\/t\/0x[0-9a-fA-F]{40}\?launched=1/, { timeout: 120_000 });
  await expect(page.getByText(`$${ticker} IS LIVE`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Token rules" }).first()).toContainText(
    "1,000,000,000 (fixed, no mint)",
  );

  // Buy 0.05 ETH.
  const trade = page.getByRole("region", { name: `Trade $${ticker}` });
  await trade.getByRole("button", { name: "0.05" }).click();
  await expect(trade.getByText(/≈ .* \$/)).toBeVisible();
  await trade.getByRole("button", { name: `Buy $${ticker}` }).click();
  await expect(trade.locator('[aria-current="step"]')).toContainText("indexed", { timeout: 120_000 });

  // Sell 50%: first sell needs the one-time Permit2 approval, then the swap.
  await trade.getByRole("tab", { name: /Sell/ }).click();
  await trade.getByRole("button", { name: "50%" }).click();
  await expect(trade.getByText(/≈ .* ETH/)).toBeVisible();
  await trade.getByRole("button", { name: `Sell $${ticker}` }).click();
  await expect(trade.locator('[aria-current="step"]')).toContainText("indexed", { timeout: 120_000 });
  await expect(page.getByRole("region", { name: "Trades" })).toContainText("SELL");

  // Claim: creator fees from the first buy, the buy and the sell.
  await page.goto(`/u/${creator}`);
  const claim = page.getByRole("region", { name: "Claimable creator fees" });
  await expect(claim).not.toContainText("0 ETH", { timeout: 60_000 });
  await claim.getByRole("button", { name: "Claim all" }).click();
  await expect(claim.locator('[aria-current="step"]')).toContainText("indexed", { timeout: 120_000 });
  // The profile is server-rendered with a short cache; reload until the claim shows in the history.
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/claimed .* ETH/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  // Rule 3: every transaction the app sent carries our Builder Code.
  expect(wallet.sent.length).toBeGreaterThanOrEqual(5); // launch, buy, approve, sell, collect, claim
  for (const data of wallet.sent) expect(readBuilderCodes(data)).toEqual(["bc_test"]);
});
