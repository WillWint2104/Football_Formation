import type { Page } from "@playwright/test";

/** Open a real disclosure while preserving its state for an already visible command. */
export async function openDesignerDisclosure(page: Page, label: "Session files" | "Manage diagrams") {
  const summary = page.locator("summary").filter({ hasText: label });
  if (await summary.evaluate(element => !element.closest("details")?.open)) await summary.click();
}
