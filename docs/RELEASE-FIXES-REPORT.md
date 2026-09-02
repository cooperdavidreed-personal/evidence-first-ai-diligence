# Underwriting Lab release-fix verification report

> Historical release record only. This report describes the retired pre-Desk public experience and is preserved for provenance; it is not the current product, URL, deployment, demonstration, or release claim. Open the canonical [Underwriting Desk](https://underwriting-desk-delta.vercel.app/) and current root README instead.

Status: `RELEASE_CANDIDATE_VERIFIED`

Bound source candidate: `a0ae46c11d3faf4d2885e19c54583c285f8cd69f`

Public release commit and deployment result are recorded in the completion email because a commit cannot truthfully contain its own final SHA.

Canonical workbench: <https://underwriting-desk-delta.vercel.app/>. GitHub Pages is retained only as a release-artifact mirror whose root redirects to the canonical product.

## Completed release work

1. **Partner decision materials.** AtlasGrid and Helios each have a one-page US Letter IC brief, a three-page underwriting packet, and a separate technical appendix. The briefs use an explicit decision request, four decision-economics tiles, two deterministic visuals, prioritized gates, a path to reconsideration, and an unambiguous human-approval boundary.
2. **Helios assumptions and policy.** The canonical scenario mix, catastrophe prior, loss definition, analyst-set maximum, owner, approval status, and all previously hidden simulation inputs are explicit and source-bound. The working case permits bounded local edits, selects retained deterministic cases, records the change, and does not rewrite the released decision. Six cells cover two scenario mixes and three catastrophe priors.
3. **Final product film.** The release includes an 86-second 1920x1080 H.264 demonstration, ElevenLabs narration, 21-cue SRT and VTT captions, exact transcript, thumbnail, 12 review frames, capture receipt, source closure, and independent review records.

## Verification

- Python: `181 passed` in the full-suite run, followed by `7 passed` in the focused public-release boundary suite after adding the final manifest-bound media allowlist regression.
- React unit and contract tests: `26 passed`.
- Playwright: `18 passed`, `6 skipped` by the intentional desktop/mobile applicability matrix.
- PDF contract: six tagged, normalized US Letter PDFs; page counts `1, 20, 3, 1, 7, 3` for AtlasGrid snapshot, AtlasGrid appendix, AtlasGrid packet, Helios snapshot, Helios appendix, and Helios packet.
- Visual regression: 32 PNGs, six PDF byte matches, and four accessibility evidence records matched the retained macOS baseline.
- Demo: 86.0 seconds, 1920x1080, 30 fps, H.264 video, AAC 48 kHz mono audio, `-16.98` integrated LUFS, `-0.94` dBTP true peak, 12 bound review frames, 41 bound source files, and three independent review records.
- Demo SHA-256: `fd3b692b9b5eccb0ae353eda0c9a7d3b5c8e80b4756b46fc4ee7900bdc06d38c`.
- Narration SHA-256: `dd3a6b59a96614ee8a999638b6b7ed833cee2a3ddf9331940644b75be084d3ff`.

## Narration provenance

The governed API route stopped because its cached credential was expired. The final narration was generated in Cooper's already signed-in ElevenLabs web workspace using `Eleven Multilingual v2`, the `Roger - Laid-Back, Casual & Resonant` voice, encoded speed `1.18`, stability `0.5`, similarity `0.75`, and speaker boost. The provider UI exposed the voice name and model but did not expose internal voice or request identifiers; the retained receipt says `NOT_EXPOSED_BY_SIGNED_IN_WEB_UI` rather than inventing them. The final downloaded audio is bound by SHA-256.

## Independent review

Claude, ChatGPT, and Grok each returned `PASS` with no unresolved `CRITICAL` or `HIGH` finding against the exact source commit and video digest above. Claude independently reconciled the key AtlasGrid and Helios arithmetic and confirmed that the earlier browser-math overclaim and sub-second pacing defects are resolved. ChatGPT found the story credible and legible but recommended showing an opened packet in a future cut. Grok's provider wrapper ended with a retryable cancellation after emitting substantive findings; its critique was faithfully normalized with that execution status disclosed.

The retained medium and low findings include: expand one lineage section in the film; label monthly versus year-end covenant headroom more explicitly; preview the exported packet; align retained-case button wording; explain that Helios's 20% loss frequency is the declared catastrophe prior; clarify the basis of first-close versus base-case ownership; and tighten a few static holds and duplicated labels. These do not change the stated investment mechanics or release boundary.

The model reviews are advisory editorial checks. Agreement is not treated as financial, statistical, product, or practitioner validation.

## Known limitations

- Both companies, source rooms, results, policies, and observations are synthetic. This is not investment advice or proof of real-world investment performance.
- Helios's selected 20% catastrophe prior is an analyst input. Every catastrophe path loses in the retained structure and no continuous path loses, so the prior determines the screen; the 1,000-path replay is disclosed only as a generator check, not a second estimate.
- The maximum acceptable loss probability is an illustrative, analyst-set, `UNREVIEWED` threshold. It is not an approved investment-firm policy.
- Notes and assumption reviews remain browser-local. There is no authentication, encryption, sharing, multitenancy, audit service, or confidential-data readiness.
- The public build has no runtime model integration and no broad MCP surface. Models cannot change assumptions, approve capital, or write the canonical deal record.
- Automated accessibility checks cover the tested routes and do not establish comprehensive WCAG compliance.
- No PE/VC practitioner usability study, firm adoption, model benchmark, real-company underwriting conclusion, or CoreWeave evaluation was run.
- The ElevenLabs receipt is signed-in-web-UI attestation bound by audio digest, not a provider API receipt containing an exposed request or voice identifier.

## Review request

Please challenge the product as a PE/VC practitioner and as a hiring decision-maker: Is the decision legible in 30 seconds? Are the Helios prior and policy distinctions defensible? Does the film demonstrate judgment and deterministic mechanics rather than AI theater? What should be removed or strengthened before Cooper presents this in interviews or adds it to public career materials?
