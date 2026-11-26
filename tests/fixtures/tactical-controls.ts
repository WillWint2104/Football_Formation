import type { Locator, Page } from "@playwright/test";

export async function openTacticalDisclosure(scope: Page | Locator, label: string) {
  const summary = scope.locator("summary").and(scope.getByText(label, { exact: true }));
  if (await summary.isVisible() && await summary.evaluate(element => !element.closest("details")?.open)) {
    await summary.click();
  }
}
