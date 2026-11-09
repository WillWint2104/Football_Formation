import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SessionPreview } from "../../components/calendar/SessionPreview";

const {bundle,event}=JSON.parse(readFileSync(0,"utf8"));
process.stdout.write(renderToStaticMarkup(React.createElement(SessionPreview,{bundle,event,demo:false,disabled:false,onClose(){},onSchedule(){},onBrowse(){}})));
