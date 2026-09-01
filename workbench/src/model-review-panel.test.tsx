import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {ModelReviewPanel} from "./model-review-panel";
import type {ModelChallengeRequest} from "./model-workflow";

const evidence = [{id: "runway", title: "Runway", displayValue: "17.3 months", summary: "Cash divided by recent burn."}];

describe("model review panel", () => {
  it("shows an honest unavailable state without runtime configuration", () => {
    render(<ModelReviewPanel evidence={evidence} />);
    expect(screen.getByRole("heading", {name: "Challenge selected evidence"})).toBeInTheDocument();
    expect(screen.getByText(/no runtime credentials configured/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Challenge evidence"})).not.toBeInTheDocument();
  });

  it("requires evidence selection and confirmation before producing a proposal", async () => {
    const user = userEvent.setup();
    const transport = vi.fn(async (request: ModelChallengeRequest) => ({request_digest_sha256: request.request_digest_sha256, challenges: [{claim: "Burn window may be too short", evidence_refs: ["runway"], severity: "HIGH", management_question: "Which committed costs are absent?"}], gaps: [], memo_drafts: []}));
    render(<ModelReviewPanel evidence={evidence} transport={transport} />);
    const challenge = screen.getByRole("button", {name: "Challenge evidence"});
    expect(challenge).toBeDisabled();
    await user.click(screen.getByRole("checkbox", {name: /Runway/}));
    expect(challenge).toBeEnabled();
    await user.click(challenge);
    expect(screen.getByText("Confirm selected evidence transfer")).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {name: "Send selected evidence"}));
    expect(await screen.findByRole("heading", {name: "Burn window may be too short"})).toBeInTheDocument();
    expect(screen.getByText("Model proposed")).toBeInTheDocument();
    const accept = screen.getByRole("button", {name: "Accept proposal"});
    expect(accept).toBeDisabled();
    await user.type(screen.getByRole("textbox", {name: "Human reviewer"}), "Avery Chen");
    await user.click(accept);
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.tagName === "FOOTER" && Boolean(node.textContent?.includes("accepted by Avery Chen")))).toBeInTheDocument();
  });
});
