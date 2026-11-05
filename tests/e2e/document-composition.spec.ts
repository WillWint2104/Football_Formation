import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { printExample } from "../fixtures/print-session";
import { openPrintPlan, previewPrintPlan, capturePrintOutput, preparePrintPage } from "../fixtures/print-browser";

test.beforeEach(async({page,context})=>preparePrintPage(page,context));
for(const variant of ["short-activity","small-sided","full-pitch","five-activities","brand-crest","short-text-activities"])test(`B5b coaching composition: ${variant}`,async({page},info)=>{
  test.setTimeout(60000);const p=printExample(),a=p.document.session.activities[0],full=p.document.session.activities[1];
  if (variant === "short-text-activities") {
    a.diagrams=[];a.instructions=["Move and pass at a comfortable pace."];a.coachingPoints=["Keep the next passing option visible."];a.progressions=[];a.variations=[];
    p.document.session.activities=[a,{...structuredClone(a),id:"cool-down",name:"Cool-down and review",role:"cool-down",durationMinutes:5}];
  } else if(variant==="full-pitch"){
    p.document.session.activities=[full];p.document.session.name="Full-pitch team organisation";
    p.document.branding={...p.document.branding,primaryColor:"#1D503A",secondaryColor:"#FFFFFF",accentColor:"#C8DB74"};
  }else if(variant==="five-activities"){
    p.document.session.activities[2].diagrams.push({scene:{id:"example-rondo",revision:2},representativeSeconds:4});
    const warm={...structuredClone(a),id:"warm-up",name:"Warm-up - passing & movement",role:"warm-up" as const,durationMinutes:10};
    const cool={...structuredClone(a),id:"cool-down",name:"Cool-down - mobility & review",role:"cool-down" as const,durationMinutes:5,diagrams:[],equipment:[],instructions:["Reduce intensity with light passing and mobility.","Review the supporting angles practised during the session."],coachingPoints:["Move comfortably and reflect on the session."],progressions:[],variations:[]};
    p.document.session.activities=[warm,...p.document.session.activities,cool];p.document.session.durationMinutes=80;p.document.session.playerCount=22;p.document.session.team="First team (verification)";p.document.session.type="possession";
    p.document.session.name="Possession into team shape";p.document.session.objectives=["Create useful support angles around the ball.","Maintain width and depth when building through midfield."];p.document.session.focus=["Support play","Positional awareness"];
  }else{
    p.document.session.activities=[a];p.document.session.name=variant==="short-activity"?"Quick passing practice":"Rondos & support play";
    if(variant==="short-activity"){
      a.instructions=["Keep possession and move to offer the next passing option."];a.coachingPoints=["Scan before receiving."];a.progressions=[];a.variations=[];
      p.document.branding={...p.document.branding,primaryColor:"#F4EEDD",secondaryColor:"#FFFFFF",accentColor:"#FFFFFF"};
    }
    if(variant==="brand-crest"){
      const png=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><path d="M16 8H144V48L80 76L16 48Z" fill="#16395b" stroke="#d2b16d" stroke-width="4"/><text x="80" y="48" text-anchor="middle" font-size="32" fill="white" font-family="Arial">VC</text></svg>')).png().toBuffer();
      p.document.branding={...p.document.branding,clubName:"Verification Club - crest edition",primaryColor:"#EEEBD9",secondaryColor:"#FFFFFF",accentColor:"#17324D",logo:{name:"verification-crest.png",mimeType:"image/png",width:160,height:80,dataUrl:`data:image/png;base64,${png.toString('base64')}`}};
    }
  }
  const id=await openPrintPlan(page,p),before=await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),id);await previewPrintPlan(page);
  const plan=page.getByLabel("Branded session plan",{exact:true});await expect(plan.locator("article")).toHaveCount(p.document.session.activities.length);
  await expect(plan).toContainText(p.document.session.activities.length > 1 ? "Equipment overview" : "Equipment");await expect(plan).not.toContainText("A. Carter");await expect(plan).not.toContainText("Main Pitch C");
  if(variant==="brand-crest"){await expect(plan.getByRole("img",{name:"Verification Club - crest edition crest",exact:true})).toBeVisible();await expect(plan.locator('.designer-plan-header')).toHaveCSS('color','rgb(0, 0, 0)');}
  if(variant==="full-pitch")await expect(plan.locator('.designer-plan-split')).toHaveCount(0);
  if(variant==="five-activities"){await expect(plan.locator('.designer-plan-diagram-pair')).toHaveCount(2);await expect(plan).toContainText("80 known minutes");await expect(plan).toContainText("Bibs: quantity unknown");}
  const pages=await capturePrintOutput(page,info,variant);if(variant==="short-activity" || variant==="short-text-activities")expect(pages).toBe(1);
  if(variant==="short-text-activities"){await expect(plan.locator(".designer-plan-compact")).toHaveCount(2);await expect(plan).toContainText("Cool-down and review");}
  expect(await page.evaluate(id=>window.companionTest.browserCompanionRepository().read(id),id)).toEqual(before);
});
