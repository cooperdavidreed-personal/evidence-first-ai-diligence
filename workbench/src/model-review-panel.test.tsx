import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {ModelReviewPanel} from "./model-review-panel";
import type {ModelChallengeRequest} from "./model-workflow";

const evidence = [{id: "runway", title: "Runway", displayValue: "17.3 months", summary: "Cash divided by recent burn."}];

describe("model review panel", () => {
  it("shows an honest unavailable state without runtime configuration", () => {
    render(<ModelReviewPanel dealId="test-deal" evidence={evidence} />);
    expect(screen.getByRole("heading", {name: "Challenge selected evidence"})).toBeInTheDocument();
    expect(screen.getByText(/no runtime credentials configured/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Challenge evidence"})).not.toBeInTheDocument();
  });

  it("requires evidence selection and confirmation before producing a proposal", async () => {
    const user = userEvent.setup();
    const transport = vi.fn(async (request: ModelChallengeRequest) => ({deal_id: request.deal_id, request_digest_sha256: request.request_digest_sha256, model_family: "test-reviewer", challenges: [{claim: "Burn window may be too short", evidence_refs: ["runway"], severity: "HIGH", management_question: "Which committed costs are absent?"}], gaps: [], memo_drafts: []}));
    render(<ModelReviewPanel dealId="test-deal" evidence={evidence} transport={transport} />);
    const challenge = screen.getByRole("button", {name: "Challenge evidence"});
    expect(challenge).toBeDisabled();
    await user.click(screen.getByRole("checkbox", {name: /Runway/}));
    expect(challenge).toBeEnabled();
    await user.click(challenge);
    expect(screen.getByText("Confirm selected evidence transfer")).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {name: "Send selected evidence"}));
    expect(await screen.findByRole("heading", {name: "Burn window may be too short"})).toBeInTheDocument();
    expect(screen.getByText("Hosted reviewer proposed")).toBeInTheDocument();
    const accept = screen.getByRole("button", {name: "Accept proposal"});
    expect(accept).toBeDisabled();
    const editor = screen.getByRole("textbox", {name: "Edit Burn window may be too short"});
    await user.clear(editor);
    await user.type(editor, "Reconcile committed costs against the signed plan.");
    await user.type(screen.getByRole("textbox", {name: "Human reviewer"}), "Avery Chen");
    await user.click(accept);
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.tagName === "FOOTER" && Boolean(node.textContent?.includes("Edited and accepted by Avery Chen")))).toBeInTheDocument();
    await user.click(screen.getByText("Compare human-reviewed text to model draft"));
    expect(screen.getByText("Which committed costs are absent?")).toBeInTheDocument();
    expect(screen.getAllByText("Reconcile committed costs against the signed plan.")).toHaveLength(2);
  });

  it("does not present portable proposal origin as authenticated model provenance", () => {
    render(<ModelReviewPanel dealId="test-deal" evidence={evidence} proposals={[{proposalId: "portable-1", kind: "CHALLENGE", state: "ACCEPTED", title: "Imported challenge", body: "Reconcile the burn window.", evidenceRefs: ["runway"], dealId: "test-deal", origin: "PORTABLE_IMPORT_UNVERIFIED", requestEvidence: evidence, requestDigestSha256: "a".repeat(64), humanActor: "Avery Chen", reviewedAt: "2026-09-01T01:00:00.000Z", limitations: "Imported portable state preserves the proposal and named human disposition, but does not authenticate the original model or provider."}]} />);
    expect(screen.getByText("Imported proposal · source unverified")).toBeInTheDocument();
    expect(screen.getByText(/Portable import/)).toBeInTheDocument();
    expect(screen.queryByText(/claude|grok|chatgpt/i)).not.toBeInTheDocument();
  });

  it("does not offer a fake hosted control for an unregistered uploaded package", () => {
    render(<ModelReviewPanel dealId="local-other-package" evidence={evidence} transport={async () => ({})} hostedEligible={false} unavailableReason="Hosted review is enabled for the included Northstar sample only." />);
    expect(screen.getByText(/included Northstar sample only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Challenge evidence"})).not.toBeInTheDocument();
  });
});
