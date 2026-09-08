import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {ExcelChangeReview} from "./excel-change-review";
import {downloadText} from "./download";
import type {WorkbookSemanticDiff} from "./workbook-diff";
vi.mock("./download", () => ({downloadText:vi.fn()}));
const diff:WorkbookSemanticDiff = {state:"COMPARED", addedSheets:[], removedSheets:[], detail:"Stored cells only", changes:[{sheet:"Model",address:"B2",kind:"FORMULA_CHANGED", before:{type:"number",value:"20",formula:"A2*2"},after:{type:"number",value:"30",formula:"A2*3"}},{sheet:"Model",address:"A2",kind:"VALUE_CHANGED",before:{type:"number",value:"10",formula:null},after:{type:"number",value:"12",formula:null}}]};
describe("Excel review actions", () => {
  it("filters cells while exporting the complete unapproved comparison", async () => {
    const user=userEvent.setup(); render(<ExcelChangeReview diff={diff} sourceName="source.xlsx" candidateName="saved.xlsx" />);
    await user.selectOptions(screen.getByLabelText("Excel change type"),"FORMULA_CHANGED");
    expect(screen.getByText("Model · B2")).toBeInTheDocument(); expect(screen.queryByText("Model · A2")).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"),"missing"); expect(screen.getByText("No cell changes match this view.")).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"Download full cell review"}));
    const content=JSON.parse(vi.mocked(downloadText).mock.calls.at(-1)![1]); expect(content.humanApproved).toBe(false); expect(content.comparison.changes).toHaveLength(2); expect(content.sourceName).toBe("source.xlsx");
  });
  it("reveals changes beyond the first hundred without discarding them", async () => {
    render(<ExcelChangeReview diff={{...diff,changes:Array.from({length:101},(_,i)=>({...diff.changes[0],address:`B${i+1}`}))}} sourceName="source.xlsx" candidateName="saved.xlsx" />);
    expect(screen.queryByText("Model · B101")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button",{name:"Show 100 more changes"}));
    expect(screen.getByText("Model · B101")).toBeInTheDocument();
  });
});
