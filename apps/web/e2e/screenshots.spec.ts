import { expect, test } from "@playwright/test";

/**
 * Evidence screenshots (M3): 375px and 1440px, light and dark, from the local fork stack.
 * Run after the e2e flow so the board shows real (fork) launches: SCREENSHOTS=1 npx playwright test screenshots
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to capture");

const OUT = "../../docs/screenshots/m3";
const viewports = [
  { name: "375", width: 375, height: 812 },
  { name: "1440", width: 1440, height: 900 },
] as const;

for (const scheme of ["light", "dark"] as const) {
  for (const vp of viewports) {
    test(`screens ${vp.name} ${scheme}`, async ({ page, request }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "no-preference" });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const tokens = (await (await request.get("/api/indexer/tokens?tab=new&limit=1")).json()) as {
        items: { address: string; creator: string }[];
      };
      const token = tokens.items[0];
      expect(token, "run the e2e flow first so there is a launched token").toBeTruthy();

      const pages = [
        ["board", "/"],
        ["create", "/create"],
        ["token", `/t/${token?.address}`],
        ["profile", `/u/${token?.creator}`],
      ] as const;
      for (const [name, path] of pages) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1_500); // hero canvas and polled data settle
        await page.screenshot({ path: `${OUT}/${name}-${vp.name}-${scheme}.png`, fullPage: true });
      }
    });
  }
}
