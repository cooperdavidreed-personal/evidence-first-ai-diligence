import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {File as NodeFile} from "node:buffer";
import {ExcelRoundTrip} from "./excel-round-trip";
import type {IntakeResult} from "./intake";
const prepare=vi.hoisted(()=>vi.fn());
vi.mock("./supported-revision",()=>({prepareWorkbookRevision:prepare}));
vi.mock("./workbook-diff",()=>({compareWorkbookCells:()=>({state:"COMPARED",changes:[],addedSheets:[],removedSheets:[],detail:"No cell content changes"})}));
vi.mock("./excel-change-review",()=>({ExcelChangeReview:()=> <p>Saved workbook comparison</p>}));
const result={deal:{company:"Northstar"},baselineApproval:{version:"V1"},sourcePayloads:[{name:"operating_model.xlsx",encoding:"BASE64",content:btoa("source bytes"),mediaType:"application/octet-stream"}]} as unknown as IntakeResult;
beforeEach(()=>vi.clearAllMocks());
async function selectFile(){const input=screen.getByText("Compare saved workbook").querySelector("input")!;fireEvent.change(input,{target:{files:[new NodeFile(["edited bytes"],"saved.xlsx")]}});await screen.findByText("Saved workbook comparison");}
it("prepares a validated candidate only after explicit action, without promoting source state",async()=>{
 const callback=vi.fn(),candidate={packageState:"READY",baselineApproval:null};prepare.mockResolvedValue(candidate);
 render(<ExcelRoundTrip result={result} onPrepareRevision={callback}/>);await selectFile();expect(callback).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Prepare supported revision"}));await screen.findByText(/validated as a source-package candidate/);expect(callback).toHaveBeenCalledWith(candidate);expect(result.baselineApproval?.version).toBe("V1");
});
it("shows admission rejection without exposing an unvalidated candidate",async()=>{
 const callback=vi.fn();prepare.mockRejectedValue(new Error("Formula edits require a complete source package."));render(<ExcelRoundTrip result={result} onPrepareRevision={callback}/>);await selectFile();fireEvent.click(screen.getByRole("button",{name:"Prepare supported revision"}));await screen.findByText("Formula edits require a complete source package.");expect(callback).not.toHaveBeenCalled();
});
