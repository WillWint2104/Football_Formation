import { expect, type Page, type TestInfo, type BrowserContext } from "@playwright/test";
import { buildSync } from "esbuild";
import { writeFile } from "node:fs/promises";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { printExample as fixture } from "./print-session";
import type {} from "./companion-browser";

const bundle=buildSync({entryPoints:["tests/fixtures/companion-browser.ts"],bundle:true,write:false,format:"iife",platform:"browser",target:"es2022"}).outputFiles[0].text;
const status=(p:Page)=>p.getByRole("region",{name:"Local diagram workspace",exact:true});
const plan=(p:Page)=>p.getByLabel("Branded session plan",{exact:true});
export async function openPrintPlan(p:Page,input=fixture()) {
  const saved=await p.evaluate(pkg=>window.companionTest.browserCompanionRepository().create(pkg),input);if(!saved.ok)throw Error(saved.error.message);
  await status(p).getByRole("button",{name:"Browse local plans",exact:true}).click();await status(p).getByText(/Saved local plans \(/).click();
  await status(p).getByRole("button",{name:`Review plan ${saved.value.documentId}`,exact:true}).click();p.once("dialog",d=>d.accept());await p.getByRole("button",{name:"Open reviewed plan as independent copy",exact:true}).click();
  await expect(p.getByRole("button",{name:input.document.session.activities[0]?.diagrams.length?"Edit Diagram":"Create Diagram",exact:true})).toBeEnabled();return new URL(p.url()).searchParams.get("localPlan")!;
}
export async function previewPrintPlan(p:Page){await p.getByRole("button",{name:"Branded preview",exact:true}).click();await expect(plan(p)).toBeVisible();}
export async function capturePrintOutput(p:Page,info:TestInfo,name:string){
  await p.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.designer-print img')).map(img=>img.decode()));});
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:info.outputPath(`${name}-${info.project.name}.png`)});
  await p.screenshot({path:info.outputPath(`${name}-${info.project.name}-full.png`),fullPage:true});
  await plan(p).locator('article').first().scrollIntoViewIfNeeded();await p.screenshot({path:info.outputPath(`${name}-${info.project.name}-activity.png`)});await p.evaluate(()=>scrollTo(0,0));
  await p.emulateMedia({media:"print"});
  await writeFile(info.outputPath(`${name}-layout.json`),JSON.stringify(await plan(p).locator("article, figure").evaluateAll(nodes=>nodes.map(n=>({class:n.className,height:n.getBoundingClientRect().height,breakBefore:getComputedStyle(n).breakBefore,breakInside:getComputedStyle(n).breakInside,page:getComputedStyle(n).page}))),null,2));
  const bytes=await p.pdf({...(info.project.name==="desktop"?{path:info.outputPath(`${name}.pdf`)}:{}),preferCSSPageSize:true,printBackground:true});
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(0);expect(pdf.getPageCount()).toBeLessThan(16);
  for(const page of pdf.getPages()){expect(page.getWidth()).toBeCloseTo(595.28,0);expect(page.getHeight()).toBeCloseTo(841.89,0);
    const contents=page.node.Contents(), refs=contents && "asArray" in contents?contents.asArray():[contents];
    const operators=refs.filter(Boolean).map(ref=>pdf.context.lookup(ref!)).filter((stream):stream is PDFRawStream=>stream instanceof PDFRawStream).map(stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString()).join("");
    expect(operators,"Every activity/continuation page must contain text, not a blank page").toContain("BT");
  }
  await p.emulateMedia({media:"print"});await p.screenshot({path:info.outputPath(`${name}-${info.project.name}-print-full.png`),fullPage:true});await p.emulateMedia({media:"screen"});return pdf.getPageCount();
}

export async function preparePrintPage(page:Page,context:BrowserContext){await context.addInitScript({content:bundle});await context.route("**/*",r=>["127.0.0.1","localhost"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());await page.goto("/session-designer",{waitUntil:"domcontentloaded"});await expect(page.getByRole("button",{name:"Edit session",exact:true})).toBeEnabled();}
