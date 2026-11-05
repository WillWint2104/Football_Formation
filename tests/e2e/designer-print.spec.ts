import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { printExample as fixture } from "../fixtures/print-session";
import { openPrintPlan as open, previewPrintPlan as preview, capturePrintOutput as output, preparePrintPage } from "../fixtures/print-browser";
const status=(p:import("@playwright/test").Page)=>p.getByRole("region",{name:"Local diagram workspace",exact:true});
const plan=(p:import("@playwright/test").Page)=>p.getByLabel("Branded session plan",{exact:true});
test.beforeEach(async({page,context})=>preparePrintPage(page,context));


for(const variant of ["diagram-activities","long-content","missing-source","corrupt-source"])test(`real Chromium A4 document: ${variant}`,async({page},info)=>{
  test.setTimeout(60000);const requests:string[]=[];page.on("request",r=>{if(new URL(r.url()).pathname.startsWith("/api/"))requests.push(r.url());});
  const id=await open(page,fixture(variant==="long-content"));
  const before=await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),id);
  if(variant==="missing-source"){
    await page.getByRole("button",{name:"Coaching information",exact:true}).click();await page.getByText("Exact diagram references",{exact:true}).click();await page.getByLabel("Revision 1",{exact:true}).fill("99");
  }
  if(variant==="corrupt-source")await page.evaluate(async id=>{await window.companionTest.indexedDbCompanionStorage().transact("readwrite",records=>{const record=records.find(r=>(r as {documentId:string}).documentId===id) as {snapshots:{packageJson:string}[]};record.snapshots[0].packageJson="{";return {value:null,put:record as never};});},id);
  await preview(page);await expect(plan(page)).toContainText("Verification Club");
  const svg=plan(page).locator(".designer-print-scene");
  if(variant==="corrupt-source"){await expect(svg).toHaveCount(0);await expect(plan(page).getByText("Diagram unavailable - not included",{exact:true})).toHaveCount(5);}
  else if(variant==="missing-source"){await expect(svg).toHaveCount(4);await expect(plan(page)).toContainText("revision 99");await expect(plan(page).getByText("Diagram unavailable - not included",{exact:true})).toHaveCount(1);}
  else {await expect(svg).toHaveCount(variant==="long-content"?1:5);await expect(svg.first()).toHaveAttribute("data-time","2");await expect(svg.first()).toHaveAttribute("data-revision","1");await expect(svg.first()).toHaveAttribute("data-namespace","renderer-examples");
    if(variant==="diagram-activities"){
      expect(await svg.evaluateAll(nodes=>nodes.map(n=>[n.getAttribute("data-scene-id"),n.getAttribute("data-revision"),n.getAttribute("data-time")]))).toEqual([["example-rondo","1","2"],["example-11v11","1","3"],["example-rondo","1","0"],["example-rondo","1","4"],["example-rondo","2","8"]]);
      const field=svg.nth(1).locator('[data-field-marking="touchlines"]');expect(Number(await field.getAttribute("width"))/Number(await field.getAttribute("height"))).toBeCloseTo(105/68,6);
    }
    await expect(svg.first()).toHaveAttribute("data-clipped","0");
    await expect(plan(page).locator("figure")).not.toContainText("Namespace:");
    const sources = plan(page).getByRole("region", { name: "Diagram source details" });
    await expect(sources).toContainText("Scene example-rondo · revision 1 · 2 seconds · Namespace: renderer-examples");
  }
  const pages=await output(page,info,variant);if(variant==="diagram-activities")expect(pages).toBeLessThanOrEqual(3);if(variant==="long-content"){expect(pages).toBeGreaterThan(3);await expect(plan(page)).toContainText("DELIVERY 70:");}
  if(variant!=="corrupt-source")expect(await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),id)).toEqual(before);
  expect(requests).toEqual([]);
});

test("current edits replace stale preview data, native print uses verified vectors, and both exports retain exact source revisions",async({page})=>{
  const id=await open(page);await preview(page);await expect(plan(page).locator(".designer-print-scene")).toHaveCount(5);
  await page.getByRole("button",{name:"Edit session",exact:true}).click();await page.getByRole("button",{name:"Coaching information",exact:true}).click();await page.getByLabel("Setup & delivery instructions",{exact:true}).fill("Current instructions for the printed plan.");
  await preview(page);await expect(plan(page)).toContainText("Current instructions for the printed plan.");
  await page.evaluate(()=>{window.print=()=>{document.documentElement.dataset.printInvoked="yes";};});await page.getByRole("button",{name:"Print / Save as PDF",exact:true}).click();await expect(page.locator("html")).toHaveAttribute("data-print-invoked","yes");await expect(plan(page).locator(".designer-print-scene")).toHaveCount(5);
  const download=page.waitForEvent("download");await status(page).getByRole("button",{name:"Download complete package",exact:true}).click();const pkg=JSON.parse(await readFile((await(await download).path())!,"utf8"));
  expect(pkg.document.session.activities[0].instructions).toEqual(["Current instructions for the printed plan."]);expect(pkg.scenes).toEqual(fixture().scenes);
  expect(new URL(page.url()).searchParams.get("localPlan")).toBe(id);
});

test("a newer repository owner cannot be silently adopted by print",async({page})=>{
  const id=await open(page);const remote=fixture();remote.document.session.name="Another tab saved this title";
  await page.evaluate(async({id,remote})=>{const r=await window.companionTest.browserCompanionRepository().save(id,1,remote);if(!r.ok)throw Error(r.error.message);},{id,remote});
  await preview(page);await expect(plan(page)).toContainText("changed in another tab");await expect(plan(page).locator(".designer-print-scene")).toHaveCount(0);await expect(plan(page)).not.toContainText("Another tab saved this title");
});
