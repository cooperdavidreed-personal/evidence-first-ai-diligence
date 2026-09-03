import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, {parseRoute} from "./App";
import {loadCase} from "./case-data";
import "./styles.css";

const initialRoute = parseRoute();
const initialCase = await loadCase(initialRoute.caseId === "local" || initialRoute.caseId === "public-record" ? "atlasgrid" : initialRoute.caseId);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initialCase={initialCase} initialRoute={initialRoute} />
  </StrictMode>,
);
