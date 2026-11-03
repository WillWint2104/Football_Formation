import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { buildSync } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { attachmentExample } from "../fixtures/attachments";
import type {} from "../fixtures/companion-browser";

const bundle=buildSync({entryPoints:["tests/fixtures/companion-browser.ts"],bundle:true,write:false,format:"iife",platform:"browser",target:"es2022"}).outputFiles[0].text;
const status=(p:Page)=>p.getByRole("region",{name:"Local diagram workspace",exact:true});
const plan=(p:Page)=>p.getByLabel("Branded session plan",{exact:true});
function fixture(long=false) {
  const p=attachmentExample(),a=p.document.session.activities[0];p.document.session.name=long?"Long coaching instructions":"Diagram-rich coaching activities";
  p.document.branding={...p.document.branding,clubName:"Verification Club",primaryColor:"#17324D",secondaryColor:"#18334B",accentColor:"#D7B46A"};
  a.playerCount=7;a.area={origin:{x:20,y:15},length:12,width:12};a.equipment=[{name:"Cones",quantity:4},{name:"Balls",quantity:2},{name:"Bibs",quantity:null}];
  a.instructions=["Mark a 12 x 12 m area and organise five attackers against two defenders.","Keep possession using short passes and useful support angles.","Rotate defenders after each two-minute block."];
  a.coachingPoints=["Scan before receiving.","Open the body to see the next pass.","Move to support the ball carrier."];
  a.progressions=["Reduce the allowed touches when the group is ready."];a.variations=["Increase the area while keeping the same player roles."];
  const full=p.document.session.activities[1];full.playerCount=22;full.durationMinutes=25;full.area={origin:{x:0,y:0},length:105,width:68};full.equipment=[{name:"Ball",quantity:1},{name:"Goals",quantity:2}];
  full.instructions=["Organise both teams in the saved full-pitch shape.","Build through midfield and support the next line."];full.coachingPoints=["Maintain width and depth.","React together when possession changes."];
  const multi=structuredClone(a);multi.id="activity-3";multi.name="Rondo - diagram sequence";multi.diagrams=[{scene:{id:"example-rondo",revision:1},representativeSeconds:0},{scene:{id:"example-rondo",revision:1},representativeSeconds:4},{scene:{id:"example-rondo",revision:2},representativeSeconds:8}];
  p.document.session.activities.push(multi);
  if(long){p.document.session.activities=[a];a.instructions=Array.from({length:70},(_,i)=>`DELIVERY ${String(i+1).padStart(2,"0")}: Keep scanning before receiving, move into a clear passing lane and support the next player while the defenders react.`);a.coachingPoints=Array.from({length:14},(_,i)=>`COACHING ${i+1}: Observe body position and the next passing option.`);}
  return p;
}
async function open(p:Page,input=fixture()) {
  const saved=await p.evaluate(pkg=>window.companionTest.browserCompanionRepository().create(pkg),input);if(!saved.ok)throw Error(saved.error.message);
  await status(p).getByRole("button",{name:"Browse local plans",exact:true}).click();await status(p).getByText(/Saved local plans \(/).click();
  await status(p).getByRole("button",{name:`Review plan ${saved.value.documentId}`,exact:true}).click();p.once("dialog",d=>d.accept());await p.getByRole("button",{name:"Open reviewed plan as independent copy",exact:true}).click();
  await expect(p.getByRole("button",{name:"Edit Diagram",exact:true})).toBeEnabled();return new URL(p.url()).searchParams.get("localPlan")!;
}
async function preview(p:Page){await p.getByRole("button",{name:"Branded preview",exact:true}).click();await expect(plan(p)).toBeVisible();}
async function output(p:Page,info:TestInfo,name:string){
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:info.outputPath(`${name}-${info.project.name}.png`)});
  await p.screenshot({path:info.outputPath(`${name}-${info.project.name}-full.png`),fullPage:true});
  await p.emulateMedia({media:"print"});
  await writeFile(info.outputPath(`${name}-layout.json`),JSON.stringify(await plan(p).locator("article, figure").evaluateAll(nodes=>nodes.map(n=>({class:n.className,height:n.getBoundingClientRect().height,breakBefore:getComputedStyle(n).breakBefore,breakInside:getComputedStyle(n).breakInside,page:getComputedStyle(n).page}))),null,2));
  const bytes=await p.pdf({...(info.project.name==="desktop"?{path:info.outputPath(`${name}.pdf`)}:{}),preferCSSPageSize:true,printBackground:true});
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(1);expect(pdf.getPageCount()).toBeLessThan(16);
  for(const page of pdf.getPages()){expect(page.getWidth()).toBeCloseTo(595.28,0);expect(page.getHeight()).toBeCloseTo(841.89,0);
    const contents=page.node.Contents(), refs=contents && "asArray" in contents?contents.asArray():[contents];
    const operators=refs.filter(Boolean).map(ref=>pdf.context.lookup(ref!)).filter((stream):stream is PDFRawStream=>stream instanceof PDFRawStream).map(stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString()).join("");
    expect(operators,"Every activity/continuation page must contain text, not a blank page").toContain("BT");
  }
  await p.emulateMedia({media:"print"});await p.screenshot({path:info.outputPath(`${name}-${info.project.name}-print-full.png`),fullPage:true});await p.emulateMedia({media:"screen"});return pdf.getPageCount();
}
test.beforeEach(async({page,context})=>{await context.addInitScript({content:bundle});await context.route("**/*",r=>["127.0.0.1","localhost"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());await page.goto("/session-designer",{waitUntil:"domcontentloaded"});await expect(page.getByRole("button",{name:"Edit session",exact:true})).toBeEnabled();});

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
  }
  const pages=await output(page,info,variant);if(variant==="long-content"){expect(pages).toBeGreaterThan(3);await expect(plan(page)).toContainText("DELIVERY 70:");}
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
