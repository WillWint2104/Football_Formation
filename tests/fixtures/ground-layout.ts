import type { Page } from "@playwright/test";
import { domainBundleSchema } from "../../lib/domain/validation";
import baseline from "./ground-layout/synthetic-session.json";
import authored from "./ground-layout/authored-stations-test-fixture.json";

export async function groundLayoutFixture(page: Page, neutral=false) {
  const bundle=domainBundleSchema.parse({...baseline,sessions:[...baseline.sessions,authored.session],scenes:[...baseline.scenes,authored.scene]});
  if(neutral)bundle.scenes.find(scene=>scene.id==="example-rondo"&&scene.revision===1)!.context={kind:"neutral",boundary:true};
  const original=JSON.stringify(bundle);
  const session=bundle.sessions.find(session=>session.id==="sample-3")!;
  let writes=0,served=bundle;
  await page.context().route("**/*",route=>["127.0.0.1","localhost"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.route("**/api/**",route=>{if(route.request().method()!=="GET")writes++;return route.abort();});
  await page.route("**/api/organizations",route=>route.fulfill({json:{organizations:[{id:bundle.organizationId,name:"Synthetic ground-layout club",version:4}]}}));
  await page.route("**/api/organizations/*/snapshot",route=>{
    if(route.request().method()!=="GET"){writes++;return route.abort();}
    return route.fulfill({json:{version:4,bundle:served}});
  });
  const url="/sessions/view?"+new URLSearchParams({organization:bundle.organizationId,session:session.id,revision:String(session.revision),
    booking:"sample-4",bookingRevision:"1",activity:session.content.activities[0].id,diagram:"1",q:"Break",type:"possession"});
  return {url,bundle,session,original,writes:()=>writes,withoutScene(){served={...served,scenes:served.scenes.filter(scene=>scene.id!=="example-rondo")};}};
}
