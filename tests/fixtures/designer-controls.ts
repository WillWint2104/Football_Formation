import type { Page } from "@playwright/test";

/** Open a real disclosure while preserving its state for an already visible command. */
export async function openDesignerDisclosure(page: Page, label: "Session files" | "Manage diagrams" | "Session tools") {
  const summary = page.locator("summary").filter({ hasText: label });
  if (await summary.evaluate(element => !element.closest("details")?.open)) await summary.click();
}

export async function openDesignerSessionTools(page: Page) {
  if (await page.locator(".recovery-session-tools > summary").isVisible()) {
    await openDesignerDisclosure(page, "Session tools");
  }
}

export async function openDesignerCoachingEditor(page: Page) {
  const show = page.getByRole("button", { name: "Coaching information", exact: true });
  if (await show.isVisible()) await show.click();
  const edit = page.getByRole("button", { name: "Edit coaching information", exact: true });
  if (await edit.isVisible()) await edit.click();
}
