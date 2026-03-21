import { test, expect } from "@playwright/test";

test("placeholder — playwright config is valid", async ({ page }) => {
  // This test verifies that Playwright infrastructure is correctly set up.
  // It will be replaced by the smoke test in a subsequent feature.
  await page.goto("/");
  await expect(page).toHaveTitle(/Glade/);
});
