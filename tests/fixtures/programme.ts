import { libraryPreviewExample } from "./library-preview";
import { domainBundleSchema } from "../../lib/domain/validation";
import { wallTimeCandidates } from "../../lib/calendar/schedule";
import type { SessionKind } from "../../lib/domain/session";

/** Synthetic native graph for Concept 01 review; never a seed or a production schedule. */
export function programmeExample() {
  const bundle = libraryPreviewExample(), source = bundle.sessions.find(s => s.id === "sample-3")!;
  const activitySource = structuredClone(source.content.activities);
  const entries: [string, SessionKind, string, string, string[], number[], string, string][] = [
    ["sample-1", "recovery", "Mobility & activation", "Rehearse controlled movement and simple ball circulation.", ["Mobility", "Recovery"], [15,30], "17:00", "17:45"],
    ["sample-3", "technical", "First touch & support play", "Improve receiving angles and support around the ball.", ["First touch", "Support play"], [15,20,30,10], "17:00", "18:15"],
    ["sample-5", "goalkeeper", "Distribution drills", "Practice accurate distribution into support.", ["Distribution"], [15,20,10], "18:30", "19:15"],
    ["sample-9", "tactical", "Pressing & defensive shape", "Compactness and coordinated pressing.", ["Defensive shape", "Transitions"], [15,25,25,15], "17:00", "18:20"],
    ["sample-11", "tactical", "Corners & free kicks", "Rehearse attacking and defensive restart responsibilities.", ["Set pieces"], [10,15,15,5], "17:00", "17:45"],
  ];
  for (const [id,kind,title,objective,focus,durations,start,end] of entries) {
    const session=bundle.sessions.find(s=>s.id===id)!,event=bundle.events.find(e=>e.session?.id===id)!;
    session.content={title,kind,objective,focus,activities:activitySource.slice(0,durations.length).map((a,i)=>({...structuredClone(a),durationMinutes:durations[i],content:{...structuredClone(a.content),diagrams:id==="sample-3"?structuredClone(a.content.diagrams):[]}}))};
    event.kind="training";event.title=title;event.status="confirmed";
    event.startsAt=wallTimeCandidates(event.localDate,start,event.timeZone)[0];event.endsAt=wallTimeCandidates(event.localDate,end,event.timeZone)[0];
  }
  bundle.events=bundle.events.filter(e=>e.localDate!=="2026-11-04");
  const original=bundle.events[0];
  bundle.events.push({...structuredClone(original),id:"concept-fixture",kind:"fixture",title:"Riverside FC vs Western United",localDate:"2026-11-07",status:"confirmed",session:null,venue:"Main Pitch",areaLabel:null,
    startsAt:wallTimeCandidates("2026-11-07","15:00","Australia/Sydney")[0],endsAt:wallTimeCandidates("2026-11-07","17:00","Australia/Sydney")[0]});
  return domainBundleSchema.parse(bundle);
}
