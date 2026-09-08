import {WorkspaceOpening} from "./workspace-opening";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, {parseRoute} from "./App";
import {loadCase} from "./case-data";
import "./styles.css";
import "./review-system.css";
import "./desk-workpaper.css";

const root=createRoot(document.getElementById("root")!);
root.render(<WorkspaceOpening/>);
try {
if (window.location.hash === "#/design-directions") {
  const {default: DesignDirections} = await import("./design-directions");
  root.render(<DesignDirections data={await loadCase("atlasgrid")}/>);
} else if (window.location.hash === "#/design-system") {
  const {default: DesignSpecimen} = await import("./design-specimen");
  root.render(<StrictMode><DesignSpecimen /></StrictMode>);
} else {
  const initialRoute = parseRoute();
  const initialCase = await loadCase(initialRoute.caseId === "local" || initialRoute.caseId === "public-record" ? "atlasgrid" : initialRoute.caseId);
  root.render(<StrictMode><App initialCase={initialCase} initialRoute={initialRoute} /></StrictMode>);
}

} catch {root.render(<WorkspaceOpening failed onRetry={()=>window.location.reload()}/>);}
