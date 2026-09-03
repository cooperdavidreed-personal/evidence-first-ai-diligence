# Episode 12 — workspace version and human evidence

State: `VERIFIED`

## Coherent result

The browser-local deal workspace now uses `underwriting.deal-workspace/v3`. A supported v2 state is migrated to v3 and persisted under the new key without discarding the original v2 record. Invalid saved state remains untouched and receives a visible recovery preview with two explicit actions: download the rejected bytes or start a fresh workspace from the unchanged canonical case. Starting fresh removes only the exact rejected storage key and clears the attention state.

Human evidence now retains:

- author and date;
- analyst observation, management meeting, expert call, founder/CEO observation, commercial reference, or negotiation update type;
- human-observation or external-reference classification;
- related investment question or diligence issue;
- private or shared visibility;
- unreviewed, reviewed, or disputed status; and
- qualitative thesis effect: supports, challenges, context only, or no change.

No numeric confidence field exists or is derived.

## Verification

- `pnpm test`: `120/120 PASS` across 13 files.
- `pnpm build`: `PASS` with TypeScript and Vite production output.
- Migration regression: v2 investment observation becomes a v3 analyst observation with explicit conservative defaults.
- Recovery regression: invalid legacy JSON remains present until the analyst selects `Start fresh`; the recovery UI then clears the exact rejected key.
- Existing retained case, finance, intake, model, policy, evidence, and portable-state contracts remain passing.

## Limitations and next state

- The current intake still does not parse XLSX or PDF.
- The current local deal still does not establish a separately approved Version 1 baseline or admit a Version 2 revision.
- Proceed to the imperfect XLSX/CSV/PDF admission contract and baseline-approval event.
