import {render,screen,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect,it} from "vitest";
import {ReviewTable} from "./review-table";
it("sorts numeric values, announces direction and returns to supplied order",async()=>{
 const rows=[{id:"a",name:"A",amount:20},{id:"b",name:"B",amount:3}];
 render(<ReviewTable label="Test records" rows={rows} rowKey={r=>r.id} columns={[{id:"name",label:"Name",render:r=>r.name},{id:"value",label:"Value",render:r=>r.amount,sortValue:r=>r.amount,numeric:true}]}/>);
 const user=userEvent.setup(),button=screen.getByRole("button",{name:"Sort by Value"});
 await user.click(button);expect(button.closest("th")).toHaveAttribute("aria-sort","ascending");expect(within(screen.getAllByRole("row")[1]).getByText("B")).toBeInTheDocument();
 await user.click(button);expect(button.closest("th")).toHaveAttribute("aria-sort","descending");
 await user.click(button);expect(button.closest("th")).toHaveAttribute("aria-sort","none");expect(within(screen.getAllByRole("row")[1]).getByText("A")).toBeInTheDocument();
});
