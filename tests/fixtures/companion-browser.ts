import * as companion from "../../lib/designer/companion";
import * as indexed from "../../lib/designer/companion-indexeddb";
import * as drafts from "../../lib/designer/drafts";
import * as packages from "../../lib/designer/package";
import { companionExample, maximumCompanionPackage } from "./companion";

/** Only bundled into a Playwright-owned page; never imported by an application route. */
const harness = { ...companion, ...indexed, ...drafts, ...packages, companionExample, maximumCompanionPackage };
declare global { interface Window { companionTest: typeof harness } }
window.companionTest = harness;
