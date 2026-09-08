import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, it} from "vitest";
import {ModelReviewPanel} from "./model-review-panel";
import {digestChallengePayloadSync, type ModelProposal} from "./model-workflow";

it("keeps a local proposal inspectable but prevents acceptance when its evidence changes", async () => {
  const evidence = [{id: "runway", title: "Runway", displayValue: "17 months", summary: "Cash divided by burn"}];
  const proposal: ModelProposal = {proposalId: "local-fixture", dealId: "helios", kind: "CHALLENGE", state: "PROPOSED", origin: "LOCAL_MCP_REVIEW", title: "Challenge runway", body: "Which costs are committed?", evidenceRefs: ["runway"], requestEvidence: evidence, requestDigestSha256: digestChallengePayloadSync("helios", evidence), responseDigestSha256: "a".repeat(64)};
  const {rerender} = render(<ModelReviewPanel dealId="helios" evidence={evidence} proposals={[proposal]} />);
  await userEvent.setup().type(screen.getByRole("textbox", {name: "Human reviewer"}), "Cooper");
  expect(screen.getByRole("button", {name: "Accept proposal"})).toBeEnabled();
  rerender(<ModelReviewPanel dealId="helios" evidence={[{...evidence[0], displayValue: "12 months"}]} proposals={[proposal]} />);
  expect(screen.getByRole("button", {name: "Accept proposal"})).toBeDisabled();
  expect(screen.getByText(/Evidence or review basis changed/)).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Reject"})).toBeEnabled();
});
