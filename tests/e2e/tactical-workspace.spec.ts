import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { buildSync } from "esbuild";
import { writeFile } from "node:fs/promises";
import { attachmentExample } from "../fixtures/attachments";
import type {} from "../fixtures/companion-browser";
const phase = process.env.B4B_EVIDENCE_PHASE ?? "after";
const bundle = buildSync({ entryPoints: ["tests/fixtures/companion-browser.ts"], bundle: true, write: false, format: "iife", platform: "browser", target: "es2022" }).outputFiles[0].text;
const panel = (p: Page) => p.getByRole("region", { name: "Activity tactical diagrams", exact: true });
const attached = (p: Page) => panel(p).locator(".activity-diagram-canvas .scene-diagram");
async function open(p: Page) {
  const pkg = attachmentExample(); pkg.document.session.activities[0].diagrams.push({ scene: { id: "example-rondo", revision: 2 }, representativeSeconds: 4 });
  const r = await p.evaluate((pkg) => window.companionTest.browserCompanionRepository().create(pkg), pkg); if (!r.ok) throw Error(r.error.message);
  const status = p.getByRole("region", { name: "Local diagram workspace", exact: true });
  await status.getByRole("button", { name: "Browse local plans", exact: true }).click(); await status.getByText(/Saved local plans \(/).click();
  await status.getByRole("button", { name: `Review plan ${r.value.documentId}`, exact: true }).click(); p.once("dialog", d=>d.accept());
  await p.getByRole("button", { name: "Open reviewed plan as independent copy", exact: true }).click(); await expect(attached(p)).toBeVisible();
}
async function capture(p: Page, info: TestInfo, name: string, diagram = attached(p)) {
  await expect.poll(async()=>Math.abs(Number(await diagram.getAttribute("data-height")) - (await diagram.boundingBox())!.height)).toBeLessThan(2);
  await p.evaluate(()=>scrollTo(0,0)); const image = info.outputPath(`${phase}-${name}-${info.project.name}.png`); await p.screenshot({path:image}); await info.attach(name,{path:image,contentType:"image/png"});
  const canvas = await diagram.boundingBox(), area = await diagram.locator('[data-annotation-id="zone"] rect').first().boundingBox();
  const metrics={phase,name,viewport:info.project.use.viewport,canvas,exerciseBoundary:area,scale:await diagram.getAttribute("data-scale"),scene:await diagram.getAttribute("data-scene-id"),revision:await diagram.getAttribute("data-revision"),seconds:await diagram.getAttribute("data-time")};
  const file=info.outputPath(`${phase}-${name}-${info.project.name}.json`); await writeFile(file,JSON.stringify(metrics,null,2)); await info.attach("measurement",{path:file,contentType:"application/json"});
  return metrics;
}
test.beforeEach(async({page,context})=>{await context.addInitScript({content:bundle});await context.route("**/*",r=>["127.0.0.1","localhost"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());await page.goto("/session-designer");await expect(page.getByRole("button",{name:"Edit session",exact:true})).toBeEnabled();});
test("actual B4a and B4b workspace comparisons with rendered exercise measurements",async({page},info)=>{
  await open(page); const measurement=await capture(page,info,"activity");
  if(phase === "after") { expect(measurement.exerciseBoundary!.height).toBeGreaterThan(200); expect(measurement.canvas!.y+measurement.canvas!.height).toBeLessThanOrEqual(page.viewportSize()!.height); expect(measurement.exerciseBoundary!.width/measurement.exerciseBoundary!.height).toBeCloseTo(1,4); }
  await panel(page).getByRole("button",{name:"Expand diagram",exact:true}).click(); const modal=page.getByRole("dialog",{name:"Expanded activity diagram",exact:true}); await expect(modal).toBeVisible();
  await capture(page,info,"focused",modal.locator(".scene-diagram"));await page.keyboard.press("Escape");
  await panel(page).getByRole("button",{name:/Diagram 2 .*example-rondo/}).click();await expect(attached(page)).toHaveAttribute("data-time","4");await capture(page,info,"multiple");
  await panel(page).getByRole("button",{name:"Edit Diagram",exact:true}).click(); await expect(page.getByRole("region",{name:"Local tactical editor",exact:true})).toBeVisible(); await capture(page,info,"local-editor",page.locator(".editor-surface .scene-diagram"));
});

test("diagram selection survives activity navigation; coaching panels scroll independently and preserve unsaved text", async({page},info)=>{
  await open(page); const planId=new URL(page.url()).searchParams.get("localPlan")!;
  const before=await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),planId);
  await panel(page).getByRole("button",{name:/Diagram 2 .*example-rondo/}).click();
  const rail=page.getByRole("navigation",{name:"Session activities",exact:true});
  await rail.getByRole("button",{name:/11v11 Team Shape/}).click();await rail.getByRole("button",{name:/5v2 Rondo/}).click();
  await expect(attached(page)).toHaveAttribute("data-time","4"); await expect(attached(page)).toHaveAttribute("data-revision","2");
  await page.getByRole("button",{name:"Coaching information",exact:true}).focus();await page.keyboard.press("Enter");
  const guidance=page.getByRole("region",{name:"Activity coaching information",exact:true});
  await guidance.getByLabel("Activity name",{exact:true}).fill("Rondo · unsaved coaching text");
  await guidance.getByLabel("Setup & delivery instructions",{exact:true}).fill(Array.from({length:60},(_,i)=>`Coaching instruction ${i+1}`).join("\n"));
  const canvasBefore=(await attached(page).boundingBox())!;
  await guidance.getByText("Notes",{exact:true}).focus(); await page.keyboard.press("Enter");
  expect(await guidance.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  const canvasAfter=(await attached(page).boundingBox())!;expect(canvasAfter.height).toBe(canvasBefore.height);expect(canvasAfter.y).toBe(canvasBefore.y);
  await page.getByRole("button",{name:"Hide coaching information",exact:true}).click();await expect(guidance).toBeHidden();
  await page.getByRole("button",{name:"Hide activities",exact:true}).click();await expect(rail).toBeHidden();
  const toggle=page.getByRole("button",{name:"Show activities",exact:true});await toggle.focus();await page.keyboard.press("Enter");await expect(rail).toBeVisible();
  await page.getByRole("button",{name:"Coaching information",exact:true}).click();await expect(guidance.getByLabel("Activity name",{exact:true})).toHaveValue("Rondo · unsaved coaching text");
  await expect(guidance.getByLabel("Setup & delivery instructions",{exact:true})).toHaveValue(/Coaching instruction 60/);
  expect(await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),planId)).toEqual(before);
  await capture(page,info,"coaching-panel");
});

test("focused presentation contains coaching guidance, traps keyboard focus and preserves the exact pin",async({page},info)=>{
  await open(page);await panel(page).getByRole("button",{name:"Expand diagram",exact:true}).click();
  const modal=page.getByRole("dialog",{name:"Expanded activity diagram",exact:true});
  await page.keyboard.press("Tab");await expect(modal.getByText("Coaching guidance",{exact:true})).toBeFocused();await page.keyboard.press("Enter");
  await expect(modal.getByText("Receive with an open body shape.",{exact:true})).toBeVisible();
  await page.keyboard.press("Tab");await page.keyboard.press("Tab");await expect(modal.getByRole("button",{name:"Close diagram · Esc",exact:true})).toBeFocused();
  await expect(modal.locator(".scene-diagram")).toHaveAttribute("data-time","2");await capture(page,info,"focused-guidance",modal.locator(".scene-diagram"));
  await page.keyboard.press("Escape");await expect(panel(page).getByRole("button",{name:"Expand diagram",exact:true})).toBeFocused();
});

test("local authoring uses the visible projection, optional properties, unsaved navigation guards and native candidate recovery",async({page},info)=>{
  await open(page);await panel(page).getByRole("button",{name:"Edit Diagram",exact:true}).click();
  const host=page.getByRole("region",{name:"Local tactical editor",exact:true}), diagram=host.locator(".editor-surface .scene-diagram");
  await expect(host.getByRole("complementary",{name:"Contextual properties",exact:true})).toBeHidden();
  await host.getByRole("button",{name:"Properties",exact:true}).click();await expect(host.getByRole("complementary",{name:"Contextual properties",exact:true})).toBeVisible();
  await host.getByLabel("Grid spacing",{exact:true}).selectOption("1");
  await host.getByRole("button",{name:"Hide properties",exact:true}).click();
  await expect.poll(async()=>Math.abs(Number(await diagram.getAttribute("data-width"))-(await diagram.boundingBox())!.width)).toBeLessThan(2);
  const player=diagram.locator('g[data-entity-id="a1"]');
  const id="a3";
  const target=id?diagram.locator(`g[data-entity-id="${id}"]`):player;
  const old=Number(await target.getAttribute("data-world-x")), y=Number(await target.getAttribute("data-world-y"));
  const circle=await target.locator("circle").first().boundingBox();expect(circle).not.toBeNull();
  await page.mouse.click(circle!.x+circle!.width/2,circle!.y+circle!.height/2);await host.getByRole("region",{name:"Tactical diagram editor",exact:true}).press("ArrowRight");
  await expect.poll(async()=>Number(await target.getAttribute("data-world-x"))).toBeCloseTo(old+1,5);await expect(target).toHaveAttribute("data-world-y",String(y));
  const heldScale=Number(await diagram.getAttribute("data-scale")), outer=diagram.locator('g[data-entity-id="a5"]'), outerX=Number(await outer.getAttribute("data-world-x"));
  let edge=(await outer.locator("circle").first().boundingBox())!;await page.mouse.click(edge.x+edge.width/2,edge.y+edge.height/2);
  await host.getByRole("region",{name:"Tactical diagram editor",exact:true}).press("Shift+ArrowRight");
  await expect.poll(async()=>Number(await outer.getAttribute("data-world-x"))).toBeCloseTo(outerX+5,5);expect(Number(await diagram.getAttribute("data-scale"))).toBe(heldScale);
  edge=(await outer.locator("circle").first().boundingBox())!;await page.mouse.move(edge.x+edge.width/2,edge.y+edge.height/2);await page.mouse.down();await page.mouse.move(edge.x+edge.width/2+heldScale,edge.y+edge.height/2,{steps:4});await page.mouse.up();
  await expect.poll(async()=>Number(await outer.getAttribute("data-world-x"))).toBeCloseTo(outerX+6,5);expect(Number(await diagram.getAttribute("data-scale"))).toBe(heldScale);
  page.once("dialog",d=>{expect(d.message()).toContain("discard unsaved");void d.dismiss();});await host.getByRole("button",{name:"Cancel",exact:true}).click();await expect(host).toBeVisible();
  page.once("dialog",d=>{expect(d.message()).toContain("discard unsaved");void d.dismiss();});await page.getByRole("navigation",{name:"Main navigation",exact:true}).getByRole("link",{name:"Tactics",exact:true}).click();await expect(host).toBeVisible();await expect(page).toHaveURL(/session-designer/);
  const initialScale=Number(await diagram.getAttribute("data-scale"));await host.getByRole("button",{name:"Zoom in",exact:true}).click();await expect.poll(async()=>Number(await diagram.getAttribute("data-scale"))).toBeGreaterThan(initialScale);
  await capture(page,info,"local-unsaved",diagram);
  await host.getByRole("button",{name:"Save Local Copy",exact:true}).click();await expect(host.locator(".local-authoring-message")).toContainText("Local copy saved");
  await page.reload();await page.getByRole("button",{name:"Recover Saved Candidate",exact:true}).click();await expect(host.getByRole("heading",{name:"Review local diagram",exact:true})).toBeVisible();
  await expect(host.getByRole("button",{name:"Accept Diagram",exact:true})).toBeEnabled();await capture(page,info,"candidate-review",host.locator(".scene-diagram"));
});
