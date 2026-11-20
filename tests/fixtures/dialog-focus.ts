import { expect, type Page, type Locator } from "@playwright/test";

/** Exercise every enabled control with real Tab presses, then verify both modal wrap directions. */
export async function assertDialogTabCycle(page: Page, dialog: Locator) {
  const controls = dialog.locator('button:enabled, select:enabled, input:enabled, summary, [tabindex="0"]').filter({ visible: true });
  const count = await controls.count();
  expect(count).toBeGreaterThan(2);
  await expect(controls.first()).toBeFocused();
  for (let i = 1; i < count; i++) { await page.keyboard.press("Tab"); await expect(controls.nth(i)).toBeFocused(); }
  await page.keyboard.press("Tab"); await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(controls.last()).toBeFocused();
  await page.keyboard.press("Tab"); await expect(controls.first()).toBeFocused();
}
