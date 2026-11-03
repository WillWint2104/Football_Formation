import { attachmentExample } from "./attachments";

export function printExample(long=false) {
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
