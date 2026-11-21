"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { TacticalScene, TrainingArea } from "@/lib/domain/tactical-scene";
import { posePreview } from "@/lib/tactical/animation";
import { evaluateScene } from "@/lib/tactical/evaluate";
import { drawScene } from "@/lib/tactical/drawing";
import { boundsAsArea, gridDepth, gridPlan, gridWidth, planInventory, type GridArrangement, type GridPlan,
  type GridStation, type InventoryItem } from "@/lib/tactical/grid-plan";
import { screenRectangle, type Bounds } from "@/lib/tactical/viewport";
import { renderDrawingNode } from "./DrawingNodes";
import "./flat-ground.css";

type StationDetails = { label?: string; group?: string };
type Dimensions = { overall: boolean; spacing: boolean; practice: boolean };
type PlanSettings = {
  identity: string;
  open: boolean;
  count: number;
  spacing: number;
  arrangement: GridArrangement;
  focused: string;
  details: Partial<Record<string, StationDetails>>;
  presentation: "ground" | "overview";
  dimensions: Dimensions;
};
const meter = (n: number) => Number(n.toFixed(2)).toString();
const dimensions = (region: Bounds) => meter(gridWidth(region)) + " × " + meter(gridDepth(region)) + " m";
const stationType = { source:"Saved setup", repeat:"Illustrative copy", authored:"Authored area" };

type SourceProps = {
  scene: TacticalScene;
  seconds: number;
  savedSeconds: number;
  stage?: string;
  area?: TrainingArea;
};

type PlannerProps = SourceProps & {
  active: boolean;
  identity: string;
  equipment: readonly InventoryItem[];
  children: (controls?: ReactNode, overlay?: ReactNode, caption?: string) => ReactNode;
};

export function TrainingGridPlanner(props: PlannerProps) {
  const { active, identity, scene, seconds, stage, savedSeconds, area, equipment, children } = props;
  const defaults: PlanSettings = {
    identity, open:false, count:1, spacing:3, arrangement:"row", focused:"", details:{},
    presentation:"ground", dimensions:{overall:true,spacing:true,practice:false},
  };
  const [state, setState] = useState<PlanSettings>(defaults);
  const stationPicker = useRef<HTMLSelectElement>(null);
  const settings = state.identity === identity ? state : defaults;
  const open = active && settings.open;
  const change = (values: Partial<PlanSettings>) =>
    setState(current=>({ ...(current.identity===identity?current:defaults), ...values }));
  const pose = useMemo(()=>open ? evaluateScene(stage ? posePreview(scene, stage, seconds) : scene, seconds) : undefined,
    [open, scene, seconds, stage]);
  const plan = useMemo(()=>pose ? gridPlan(scene, pose, area, settings.count, settings.arrangement, settings.spacing) : undefined,
    [scene, pose, area, settings.count, settings.arrangement, settings.spacing]);
  if (!active) return children();

  const displayLabel = (station: GridStation) => settings.details[station.id]?.label?.trim() || station.label;
  const selected = plan?.stations.find(station=>station.id===settings.focused);
  const inventory = planInventory(equipment, plan && !plan.authored ? plan.stations.length : 1);
  const inventoryTitle = plan?.authored ? "Recorded setup" : plan && plan.stations.length > 1 ? "Repeated setup estimate" : "Saved setup";
  const setDetail = (id: string, key: keyof StationDetails, value: string) =>
    change({ details:{ ...settings.details, [id]:{ ...settings.details[id], [key]:value } } });
  function inspectStation(id: string) {
    change({ focused:id });
    stationPicker.current?.focus();
  }
  const controls = <>
    <div className="p6a-choices" role="group" aria-label="Training grid view">
      <button type="button" aria-pressed={!open} onClick={()=>change({open:false})}>SVG diagram</button>
      <button type="button" aria-pressed={open} onClick={()=>change({open:true})}>Grid plan</button>
    </div>
    {plan && <div className="p6c-controls" aria-label="Station planning controls">
      {!plan.authored && <>
        <label>Stations <select aria-label="Station count" value={settings.count} onChange={e=>change({count:Number(e.target.value),focused:""})}>
          {[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
        </select></label>
        {settings.count>1 && <>
          <label><span className="sr-only">Station arrangement</span><select aria-label="Station arrangement" value={settings.arrangement}
            onChange={e=>change({arrangement:e.target.value as GridArrangement,focused:""})}>
            <option value="row">Side by side</option><option value="grid">Grid layout</option>
          </select></label>
          <label>Clear gap <input aria-label="Clear spacing in metres" type="number" min={0} max={20} step={.5} value={settings.spacing}
            onChange={e=>change({spacing:Math.min(20,Math.max(0,Number(e.target.value)))})} /><span>m</span></label>
        </>}
      </>}
      {plan.stations.length>1 && <label><span className="sr-only">Inspect station</span><select ref={stationPicker} aria-label="Inspect station" value={selected?.id??""}
        onChange={e=>change({focused:e.target.value})}>
        <option value="">All {plan.authored ? "areas" : "stations"}</option>
        {plan.stations.map(s=><option key={s.id} value={s.id}>{displayLabel(s)}</option>)}
      </select></label>}
      {plan.stations.length>1 && <div className="p6e-station-focus" role="group" aria-label="Station quick focus">
        <button type="button" aria-pressed={!selected} onClick={()=>change({focused:""})}>All stations</button>
        {plan.stations.map((station,index)=><button key={station.id} type="button" aria-pressed={selected?.id===station.id}
          aria-label={"Focus "+displayLabel(station)} title={displayLabel(station)+" · "+stationType[station.kind]}
          onClick={()=>change({focused:station.id})}>{String.fromCharCode(65+index)}</button>)}
      </div>}
      {selected && <span className="p6e-focused-provenance" role="status">{displayLabel(selected)} · {stationType[selected.kind]}</span>}
      {!plan.authored && plan.stations.length>1 && <div className="p6a-choices" role="group" aria-label="Station presentation">
        <button type="button" aria-pressed={settings.presentation==="ground"} onClick={()=>change({presentation:"ground",focused:""})}>Ground Layout</button>
        <button type="button" aria-pressed={settings.presentation==="overview"} onClick={()=>change({presentation:"overview",focused:""})}>Coaching Overview</button>
      </div>}
      <details className="p6c-panel p6d-display">
        <summary>Display</summary>
        <div role="group" aria-label="Dimension visibility">
          {([["overall","Overall footprint"],["spacing","Station spacing"],["practice","Individual practice dimensions"]] as const).map(([key,label])=>
            <label key={key}><input type="checkbox" checked={settings.dimensions[key]} onChange={e=>change({dimensions:{...settings.dimensions,[key]:e.target.checked}})}/>{label}</label>)}
        </div>
      </details>
      <details className="p6c-panel">
        <summary>Equipment</summary>
        <div>
          <strong>{inventoryTitle}</strong>
          {inventory.length ? <table><thead><tr><th>Item</th><th>{plan.authored ? "Total recorded" : "Per setup"}</th>
            {!plan.authored&&plan.stations.length>1&&<th>Plan total</th>}</tr></thead><tbody>
            {inventory.map((item,i)=><tr key={i}><th scope="row">{item.name}</th><td>{item.quantity??"Unknown"}</td>
              {!plan.authored&&plan.stations.length>1&&<td>{item.total??"Unknown"}</td>}</tr>)}
          </tbody></table> : <p>Equipment quantities are unrecorded.</p>}
        </div>
      </details>
      {!plan.authored && plan.stations.length>1 && <details className="p6c-panel p6c-names">
        <summary>Labels</summary>
        <div>
          <strong>Planning labels</strong>
          {plan.stations.map(station=><div key={station.id} className="p6c-names-row">
            <label>{station.label}<input aria-label={station.label+" label"} maxLength={34} value={settings.details[station.id]?.label??""} placeholder={station.label}
              onChange={e=>setDetail(station.id,"label",e.target.value)} /></label>
            <label>Group label<input aria-label={station.label+" group label"} maxLength={28} value={settings.details[station.id]?.group??""} placeholder="Unassigned"
              onChange={e=>setDetail(station.id,"group",e.target.value)} /></label>
          </div>)}
        </div>
      </details>}
    </div>}
  </>;
  if (!plan || !pose) return children(controls);
  const caption = plan.authored
    ? (selected ? "Authored area inspection" : plan.stations.length+" authored areas") + " · " + dimensions(plan.extent) + " ground extent"
    : (selected ? "Station inspection · " : "") + dimensions(plan.extent) + " ground footprint" +
      (plan.clearance===null ? "" : " · "+meter(plan.clearance)+" m clear gap");
  const showingOverview = settings.presentation==="overview" && !selected && !plan.authored && plan.stations.length>1;
  const drawing = showingOverview
    ? <div className="p6d-overview" data-station-overview data-footprint={dimensions(plan.extent)}>
        <p>Physical footprint {dimensions(plan.extent)} · {meter(plan.clearance??0)} m clear gaps · Panels fitted independently</p>
        <div className="p6d-overview-panels">
          {plan.stations.map(station=><section key={station.id} className="p6d-overview-panel">
            <header><strong>{displayLabel(station)}</strong><span>{stationType[station.kind]}</span></header>
            <div className="p6d-panel-board p6c-practice-surface"><GridPlanBoard scene={scene} stage={stage} seconds={seconds} savedSeconds={savedSeconds}
              plan={plan} selected={station} displayLabel={displayLabel} details={settings.details}
              focus={inspectStation} dimensions={{overall:false,spacing:false,practice:settings.dimensions.practice}} panel/></div>
          </section>)}
        </div>
      </div>
    : <GridPlanBoard scene={scene} stage={stage} seconds={seconds} savedSeconds={savedSeconds}
        plan={plan} selected={selected} displayLabel={displayLabel} details={settings.details}
        focus={inspectStation} dimensions={settings.dimensions}/>;
  return children(controls, drawing, caption);
}

function GridPlanBoard({ scene, stage, seconds, savedSeconds, plan, selected, displayLabel, details, focus, dimensions:visibleDimensions, panel=false }: SourceProps & {
  plan: GridPlan;
  selected?: GridStation;
  displayLabel: (station: GridStation) => string;
  details: PlanSettings["details"];
  focus: (id: string) => void;
  dimensions: Dimensions;
  panel?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [size,setSize] = useState<{ width:number; height:number }>();
  const id = "station-" + useId().replace(/[^\w-]/g,"");
  useEffect(()=>{
    const observer = new ResizeObserver(([{contentRect}])=>{
      const width=Math.min(8192,Math.floor(contentRect.width)),height=Math.min(8192,Math.floor(contentRect.height));
      setSize(old=>old?.width===width&&old.height===height?old:{width,height});
    });
    if(el.current) observer.observe(el.current);
    return ()=>observer.disconnect();
  },[]);
  const fitBounds = selected ? plan.authored ? selected.extent : plan.source : plan.extent;
  const visibleStations = selected ? [selected] : plan.stations;
  const isOverview = !selected && visibleStations.length>1;
  const drawing = useMemo(()=>{
    if(!size || size.width<120 || size.height<120) return undefined;
    // Fit in screen space once, then place every repetition by translation at exactly that metre scale.
    const pad = 24;
    try {
      const customArea=boundsAsArea(fitBounds);
      return drawScene(scene,{...size,fit:"custom",customArea,padding:pad,seconds,poseStageId:stage||undefined,
        surface:"transparent",areaLabels:!plan.authored,markings:"none",rotation:0,paths:"stage",labels:true,paint:"coaching-light",
        screen:{id,mode:"expanded",sizingSeconds:savedSeconds,viewer:true}});
    } catch { return undefined; }
  },[size,scene,stage,seconds,savedSeconds,fitBounds,id,plan.authored]);
  if(!drawing||!size) return <div className="p6c-grid-board" ref={el} data-ready="false" />;
  const {view}=drawing;
  const rect=(b:Bounds)=>screenRectangle({x:b.minX,y:b.minY},gridWidth(b),gridDepth(b),view);
  const frame=rect(fitBounds);
  const displayRect = (station: GridStation, playArea=false) => {
    const b=playArea && station.area ? {
      minX:station.area.origin.x, minY:station.area.origin.y,
      maxX:station.area.origin.x+station.area.length,maxY:station.area.origin.y+station.area.width,
    } : (selected&&!plan.authored)?plan.source:station.extent;
    const r=rect(b);
    return playArea&&station.area&&!selected&&!plan.authored
      ? {...r,x:r.x+station.offset.x*view.scale,y:r.y+station.offset.y*view.scale}
      : r;
  };
  const gapMarks: {x1:number;x2:number;y1:number;y2:number}[]=[];
  if (isOverview && !plan.authored && plan.clearance) {
    const first=displayRect(visibleStations[0]);
    const adjacent=visibleStations.find(s=>s.offset.x>0&&s.offset.y===0);
    const below=visibleStations.find(s=>s.offset.x===0&&s.offset.y>0);
    if(adjacent&&plan.clearance*view.scale>=16)gapMarks.push({ x1:first.x+first.width,x2:displayRect(adjacent).x,y1:first.y+first.height/2,y2:first.y+first.height/2 });
    if(below&&plan.clearance*view.scale>=16)gapMarks.push({x1:first.x+first.width/2,x2:first.x+first.width/2,y1:first.y+first.height,y2:displayRect(below).y});
  }
  const crop = selected && plan.authored;
  const boundaryRects=visibleStations.map(station=>displayRect(station,true));
  const boundaryBox={
    x:Math.min(...boundaryRects.map(r=>r.x)), y:Math.min(...boundaryRects.map(r=>r.y)),
    right:Math.max(...boundaryRects.map(r=>r.x+r.width)),bottom:Math.max(...boundaryRects.map(r=>r.y+r.height)),
  };
  const data = {
    sceneId:drawing.sceneId,revision:drawing.revision,seconds:drawing.seconds,
    stage:drawing.stage,width:size.width,height:size.height, scale:view.scale, footprint:plan.extent,
    occupation:{width:frame.width/size.width,height:frame.height/size.height},
    boundaryOccupation:{width:(boundaryBox.right-boundaryBox.x)/size.width,height:(boundaryBox.bottom-boundaryBox.y)/size.height,
      area:boundaryRects.reduce((sum,r)=>sum+r.width*r.height,0)/(size.width*size.height)},
    gutter:view.padding,labelCollisions:drawing.labelCollisions,overlappingPlayers:drawing.screen?.playerOverlaps,
    plan:plan.stations, clearance:plan.clearance, specific:selected?.id??null, authored:plan.authored,
    marker:drawing.screen?.playerDiameter,number:drawing.screen?.numberSize,
    clipping:crop?null:drawing.clippedEntities+drawing.croppedDetails,anchors:drawing.anchors,
  };
  return <div className="p6c-grid-board" ref={el} data-ready="true" data-plan-metrics={JSON.stringify(data)}>
    <svg role="img" aria-label={plan.authored ? "Authored training areas to metre scale" : "Training station plan to metre scale"}
      width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}>
      <defs>
        <g id={id+"-scene"}>{drawing.nodes.map(renderDrawingNode)}</g>
        {crop&&<clipPath id={id+"-inspect"}><rect x={frame.x-22} y={frame.y-22} width={frame.width+44} height={frame.height+44}/></clipPath>}
      </defs>
      {visibleStations.map(station=>{
        const r=displayRect(station,true);
        return <rect key={station.id} {...r} rx={3} className="p6c-grid-area" data-area-source={station.kind}/>;
      })}
      {visibleDimensions.spacing && gapMarks.map((mark,i)=><g key={i} className="p6c-gap" data-measurement="spacing">
        <line {...mark}/><circle cx={mark.x1} cy={mark.y1} r={2}/><circle cx={mark.x2} cy={mark.y2} r={2}/>
        <text x={(mark.x1+mark.x2)/2+(mark.x1===mark.x2?16:0)} y={(mark.y1+mark.y2)/2+(mark.x1===mark.x2?3:-5)}>{meter(plan.clearance!)} m</text>
      </g>)}
      {plan.authored ? <g clipPath={crop?`url(#${id}-inspect)`:undefined}><use href={"#"+id+"-scene"}/></g> :
        visibleStations.map(station=><use key={station.id} data-station-drawing={station.id} href={"#"+id+"-scene"}
          x={selected?0:station.offset.x*view.scale} y={selected?0:station.offset.y*view.scale}/>)}
      {visibleDimensions.overall && <g className="p6d-measurement" data-measurement="overall">
        <line x1={frame.x} x2={frame.x+frame.width} y1={Math.max(12,frame.y-12)} y2={Math.max(12,frame.y-12)}/>
        <text x={frame.x+frame.width/2} y={Math.max(10,frame.y-17)}>{meter(gridWidth(fitBounds))} m</text>
        <line x1={Math.max(12,frame.x-13)} x2={Math.max(12,frame.x-13)} y1={frame.y} y2={frame.y+frame.height}/>
        <text x={Math.max(24,frame.x-19)} y={frame.y+frame.height/2}>{meter(gridDepth(fitBounds))} m</text>
      </g>}
      {visibleDimensions.practice && visibleStations.filter(station=>station.area).map(station=>{
        const r=displayRect(station,true);
        return <text key={station.id} className="p6d-measurement-label" data-measurement="practice"
          x={r.x+r.width/2} y={r.y+r.height-9}>{meter(station.area!.length)} × {meter(station.area!.width)} m</text>;
      })}
    </svg>
    {!panel && !selected && visibleStations.map(station=>{
      const r=displayRect(station);
      const label=displayLabel(station);
      const group=details[station.id]?.group?.trim();
      const shortLabel = r.width<155&&!plan.authored&&label===station.label ? label.replace(/^Station /,"") : label;
      return <button type="button" className="p6c-map-tag" data-station-kind={station.kind}
        key={station.id} style={{left:r.x,top:Math.max(3,r.y-25),maxWidth:Math.max(114,r.width+9)}}
        title={label+" · "+stationType[station.kind]+(group?" · "+group:"")}
        aria-label={(selected?"Return to all from ":"Inspect ")+label}
        disabled={plan.stations.length===1} onClick={()=>focus(selected?"":station.id)}>
        <strong>{shortLabel}</strong><span>{stationType[station.kind]}{group&&" · "+group}</span>
      </button>;
    })}
    {panel && selected && <button className="p6d-panel-inspect" type="button" onClick={()=>focus(selected.id)}
      aria-label={"Inspect "+displayLabel(selected)}>Inspect</button>}
  </div>;
}

