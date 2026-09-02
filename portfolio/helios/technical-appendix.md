# Helios Compute Control - technical appendix

> SYNTHETIC - NOT INVESTMENT ADVICE

This appendix retains reproducibility records, raw identifiers, mappings, and formula definitions. It is not the investment-committee front page.

## Content identity

- Manifest SHA-256: `aee7763d4b99a635cb5e1f77336829dbe2ea0bb00211446bd6cd32998b187329`
- Analysis SHA-256: `dbe159ae6b416db52182f2507aed3bcd7cbdedf5943b81e6fabdea18ca28db1e`
- Decision SHA-256: `5e25cf080814b7767cb2468ac6fbf1359587606ca6469c841996ababb1b9429e`
- Packet SHA-256: `4fb0f6c2b999bddc923a00a73564b336d79ff1ca01f21239eaa4b573b93c65cd`

## Analysis receipts

| Analysis | Classification | State | Specification | Receipt |
|---|---|---|---|---|
| HX-01 | ACCOUNTING_IDENTITY | REPORTED | `8c611e82c119a76c9c45f8244d4960b22058ffc883c32b3d93482017cb5855c0` | `b9c07b32c1a6262f3b0069a79be82d445a7701b8ad77f7d094ff773b90251a32` |
| HX-02 | DESCRIPTIVE | REPORTED | `4dd16a8f2fab9ac0217da45fdbb3156f53c234ee6c3b1e1143ba1a4338101858` | `0509303169f8bf025bc3594b4139c2f62a7cf061e639ee3eef933039118fd724` |
| HX-03 | ACCOUNTING_IDENTITY | REPORTED | `3527bf827d0ab45398cc7c9811fd701083e2a5be358113a1f366f2fccc6fc332` | `5480f1ff78f5c6c51b38a0fce36fd36204df4e491d71e8e2d779c1b342949c5c` |
| HX-04 | DESCRIPTIVE | REPORTED | `e388f757bbcdee972471756401e50cabb2389cb7b5ef90f2e555eb7dceb02a0a` | `0fe11718ecad1d1e6415d00cfcb3efb9eab35f2931ae10e1da69ba79cb5e326a` |
| HX-05 | PREDICTIVE_ASSOCIATION | REPORTED | `869fe38c82c8037542206b8d3c5a0646792563b18f4f414a75cebe01996becb4` | `56ae7b892ca96d92b28b10e2894be50d26850174166ef3d4a4210a432a469216` |
| HX-06 | CAUSAL_SYNTHETIC_ONLY | REPORTED | `0e1b65ba0e8dee3c2a13481cb97850a5a43ce3ab6ac091b2678138c2010e6f2b` | `13ce7025a4507d27baea7edc84ff4f3dde9478baf64ce720e87899fa8a8f6c20` |
| HX-07 | NOT_IDENTIFIED | ABSTAIN | `1d274869a7fe75ea3c635061cb3dd615d1ceb7a273b83d4917d477f76515e3cc` | `73fa9bef8097c9ee38a1100648c9c5f18cd6e8856ad5aedd9ba839e3836809f7` |
| HX-08 | ACCOUNTING_IDENTITY | REPORTED | `a837153dd36285f132e0c74662d034ab3543b5be1a4d011d069d78086fe9ca29` | `9fff1fd75cee1f45e1913ad9dc9cf96f816b87ee795247085f49c6ef6957067f` |
| HX-09 | SCENARIO | REPORTED | `7780c967d835a7e2f5e001adc48968e348de043ce81d2ec84707a7f1ca315bfe` | `570f2a7ab70c168b77f684f8585c10db5ca958bd5bc1f95aeb8d8369aa953f81` |

## Evidence-to-model mappings

| Analysis | Credit class | Observed value | Model treatment |
|---|---|---|---|
| HX-05 | SCENARIO_ONLY | $20.90B modeled serviceable spend | Scenario calibration only; tier five remains unidentified |
| HX-06 | VALUE_CREATION_BRIDGE | -0.0911 log-point synthetic ITT | No base-case credit; adoption and valuation remain scenario judgments |
| HX-01 | BASE_CASE | ltm_revenue: 5695078389 cents | Bounded base-case evidence |
| HX-02 | BASE_CASE | pooled_nrr: 135.36 percent | Bounded base-case evidence |
| HX-03 | BASE_CASE | burn_multiple: 0.78 multiple | Bounded base-case evidence |
| HX-04 | ZERO | inflated_opportunities: 48 count | 0 |
| HX-07 | ZERO | No estimate retained | 0 |
| HX-08 | BASE_CASE | first_close_new_shares: 1814223 shares | Bounded base-case evidence |
| HX-09 | SCENARIO_ONLY | p10_moic: 0.00 multiple | Scenario calibration only |

## Formula register

| Formula | Operation | Output metric | Operands |
|---|---|---|---|
| `vc-formula-headline-ownership` | DIVIDE | `hx-ownership` | `helios-MILESTONE-target-shares`, `helios-MILESTONE-fully-diluted-shares` |
| `vc-formula-base-bridge-exit-ev` | MULTIPLY | `helios-BASE-bridge-exit-enterprise-value` | `helios-BASE-bridge-terminal-revenue`, `helios-BASE-bridge-exit-multiple` |
| `vc-formula-base-bridge-exit-equity` | ADD | `helios-BASE-bridge-exit-equity` | `helios-BASE-bridge-exit-enterprise-value`, `helios-BASE-bridge-exit-cash` |
| `vc-formula-base-bridge-exit-cash` | ADD | `helios-BASE-bridge-exit-cash` | `helios-BASE-month-60-ending_cash_cents`, `helios-BASE-bridge-exit-cash-zero` |
| `vc-formula-base-minimum-cash` | MIN | `helios-BASE-minimum-cash` | `helios-BASE-month-01-ending_cash_cents`, `helios-BASE-month-02-ending_cash_cents`, `helios-BASE-month-03-ending_cash_cents`; +57 more in model-appendix.json (ordered-list SHA-256 `10c65ce3fbdc8c2cc717cbb53a28d45bae7c11395c4a7a5a98c1642c608c1b36`) |
| `vc-formula-base-funded-capital` | SUM | `helios-BASE-target-invested` | `helios-BASE-event-series-c-close-new-money`, `helios-BASE-event-series-c-tranche-new-money` |
| `vc-formula-base-ownership` | DIVIDE | `helios-BASE-ownership` | `helios-BASE-target-shares`, `helios-BASE-fully-diluted-shares` |
| `vc-formula-base-moic` | DIVIDE | `helios-BASE-gross-moic` | `helios-BASE-target-proceeds`, `helios-BASE-target-invested` |
| `vc-formula-base-dated-xirr` | DATED_XIRR | `helios-BASE-gross-xirr` | `helios-BASE-target-cash-flow-01`, `helios-BASE-target-cash-flow-02` |
| `vc-formula-base-target-proceeds` | ADD | `helios-BASE-target-proceeds` | `helios-BASE-waterfall-series_c-proceeds`, `helios-BASE-target-proceeds-zero` |
| `vc-formula-base-waterfall-conservation` | SUM | `helios-BASE-exit-value` | `helios-BASE-waterfall-common`, `helios-BASE-waterfall-series_a-proceeds`, `helios-BASE-waterfall-series_b-proceeds`, `helios-BASE-waterfall-series_c-proceeds`, `helios-BASE-waterfall-series_d-proceeds` |
| `vc-formula-milestone-bridge-exit-ev` | MULTIPLY | `helios-MILESTONE-bridge-exit-enterprise-value` | `helios-MILESTONE-bridge-terminal-revenue`, `helios-MILESTONE-bridge-exit-multiple` |
| `vc-formula-milestone-bridge-exit-equity` | ADD | `helios-MILESTONE-bridge-exit-equity` | `helios-MILESTONE-bridge-exit-enterprise-value`, `helios-MILESTONE-bridge-exit-cash` |
| `vc-formula-milestone-bridge-exit-cash` | ADD | `helios-MILESTONE-bridge-exit-cash` | `helios-MILESTONE-month-60-ending_cash_cents`, `helios-MILESTONE-bridge-exit-cash-zero` |
| `vc-formula-milestone-minimum-cash` | MIN | `helios-MILESTONE-minimum-cash` | `helios-MILESTONE-month-01-ending_cash_cents`, `helios-MILESTONE-month-02-ending_cash_cents`, `helios-MILESTONE-month-03-ending_cash_cents`; +57 more in model-appendix.json (ordered-list SHA-256 `a99f723cf3844e3b311a749dc4283338a491d6d3a3cdde22b48892da3112ce17`) |
| `vc-formula-milestone-funded-capital` | SUM | `helios-MILESTONE-target-invested` | `helios-MILESTONE-event-series-c-close-new-money`, `helios-MILESTONE-event-series-c-tranche-new-money` |
| `vc-formula-milestone-ownership` | DIVIDE | `helios-MILESTONE-ownership` | `helios-MILESTONE-target-shares`, `helios-MILESTONE-fully-diluted-shares` |
| `vc-formula-milestone-moic` | DIVIDE | `helios-MILESTONE-gross-moic` | `helios-MILESTONE-target-proceeds`, `helios-MILESTONE-target-invested` |
| `vc-formula-milestone-dated-xirr` | DATED_XIRR | `helios-MILESTONE-gross-xirr` | `helios-MILESTONE-target-cash-flow-01`, `helios-MILESTONE-target-cash-flow-02`, `helios-MILESTONE-target-cash-flow-03` |
| `vc-formula-milestone-01-funding` | ADD | `helios-MILESTONE-month-01-cash-before-operations` | `helios-MILESTONE-month-01-beginning_cash_cents`, `helios-MILESTONE-month-01-financing_cash_cents` |
| `vc-formula-milestone-01-ending` | ADD | `helios-MILESTONE-month-01-ending-cash-recomputed` | `helios-MILESTONE-month-01-cash-before-operations`, `helios-MILESTONE-month-01-operating_net_cash_flow_cents` |
| `vc-formula-milestone-12-funding` | ADD | `helios-MILESTONE-month-12-cash-before-operations` | `helios-MILESTONE-month-12-beginning_cash_cents`, `helios-MILESTONE-month-12-financing_cash_cents` |
| `vc-formula-milestone-12-ending` | ADD | `helios-MILESTONE-month-12-ending-cash-recomputed` | `helios-MILESTONE-month-12-cash-before-operations`, `helios-MILESTONE-month-12-operating_net_cash_flow_cents` |
| `vc-formula-milestone-24-funding` | ADD | `helios-MILESTONE-month-24-cash-before-operations` | `helios-MILESTONE-month-24-beginning_cash_cents`, `helios-MILESTONE-month-24-financing_cash_cents` |
| `vc-formula-milestone-24-ending` | ADD | `helios-MILESTONE-month-24-ending-cash-recomputed` | `helios-MILESTONE-month-24-cash-before-operations`, `helios-MILESTONE-month-24-operating_net_cash_flow_cents` |
| `vc-formula-milestone-36-funding` | ADD | `helios-MILESTONE-month-36-cash-before-operations` | `helios-MILESTONE-month-36-beginning_cash_cents`, `helios-MILESTONE-month-36-financing_cash_cents` |
| `vc-formula-milestone-36-ending` | ADD | `helios-MILESTONE-month-36-ending-cash-recomputed` | `helios-MILESTONE-month-36-cash-before-operations`, `helios-MILESTONE-month-36-operating_net_cash_flow_cents` |
| `vc-formula-milestone-60-funding` | ADD | `helios-MILESTONE-month-60-cash-before-operations` | `helios-MILESTONE-month-60-beginning_cash_cents`, `helios-MILESTONE-month-60-financing_cash_cents` |
| `vc-formula-milestone-60-ending` | ADD | `helios-MILESTONE-month-60-ending-cash-recomputed` | `helios-MILESTONE-month-60-cash-before-operations`, `helios-MILESTONE-month-60-operating_net_cash_flow_cents` |
| `vc-formula-milestone-target-proceeds` | ADD | `helios-MILESTONE-target-proceeds` | `helios-MILESTONE-waterfall-series_c-proceeds`, `helios-MILESTONE-target-proceeds-zero` |
| `vc-formula-milestone-waterfall-conservation` | SUM | `helios-MILESTONE-exit-value` | `helios-MILESTONE-waterfall-common`, `helios-MILESTONE-waterfall-series_a-proceeds`, `helios-MILESTONE-waterfall-series_b-proceeds`, `helios-MILESTONE-waterfall-series_c-proceeds` |
| `vc-formula-downside-bridge-exit-ev` | MULTIPLY | `helios-DOWNSIDE-bridge-exit-enterprise-value` | `helios-DOWNSIDE-bridge-terminal-revenue`, `helios-DOWNSIDE-bridge-exit-multiple` |
| `vc-formula-downside-bridge-exit-equity` | ADD | `helios-DOWNSIDE-bridge-exit-equity` | `helios-DOWNSIDE-bridge-exit-enterprise-value`, `helios-DOWNSIDE-bridge-exit-cash` |
| `vc-formula-downside-bridge-exit-cash` | ADD | `helios-DOWNSIDE-bridge-exit-cash` | `helios-DOWNSIDE-month-60-ending_cash_cents`, `helios-DOWNSIDE-bridge-exit-cash-zero` |
| `vc-formula-downside-minimum-cash` | MIN | `helios-DOWNSIDE-minimum-cash` | `helios-DOWNSIDE-month-01-ending_cash_cents`, `helios-DOWNSIDE-month-02-ending_cash_cents`, `helios-DOWNSIDE-month-03-ending_cash_cents`; +57 more in model-appendix.json (ordered-list SHA-256 `d4d09f9e067397a980660222cb6b8c58797ddd65183199349174708e1828e70f`) |
| `vc-formula-downside-funded-capital` | SUM | `helios-DOWNSIDE-target-invested` | `helios-DOWNSIDE-event-series-c-close-new-money`, `helios-DOWNSIDE-event-series-c-tranche-new-money` |
| `vc-formula-downside-ownership` | DIVIDE | `helios-DOWNSIDE-ownership` | `helios-DOWNSIDE-target-shares`, `helios-DOWNSIDE-fully-diluted-shares` |
| `vc-formula-downside-moic` | DIVIDE | `helios-DOWNSIDE-gross-moic` | `helios-DOWNSIDE-target-proceeds`, `helios-DOWNSIDE-target-invested` |
| `vc-formula-downside-dated-xirr` | DATED_XIRR | `helios-DOWNSIDE-gross-xirr` | `helios-DOWNSIDE-target-cash-flow-01`, `helios-DOWNSIDE-target-cash-flow-02` |
| `vc-formula-downside-target-proceeds` | ADD | `helios-DOWNSIDE-target-proceeds` | `helios-DOWNSIDE-waterfall-series_c-proceeds`, `helios-DOWNSIDE-target-proceeds-zero` |
| `vc-formula-downside-waterfall-conservation` | SUM | `helios-DOWNSIDE-exit-value` | `helios-DOWNSIDE-waterfall-common`, `helios-DOWNSIDE-waterfall-series_a-proceeds`, `helios-DOWNSIDE-waterfall-series_b-proceeds`, `helios-DOWNSIDE-waterfall-series_c-proceeds`, `helios-DOWNSIDE-waterfall-series_d-proceeds` |
| `vc-formula-financing_shortfall-bridge-exit-ev` | MULTIPLY | `helios-FINANCING_SHORTFALL-bridge-exit-enterprise-value` | `helios-FINANCING_SHORTFALL-bridge-terminal-revenue`, `helios-FINANCING_SHORTFALL-bridge-exit-multiple` |
| `vc-formula-financing_shortfall-bridge-exit-equity` | ADD | `helios-FINANCING_SHORTFALL-bridge-exit-equity` | `helios-FINANCING_SHORTFALL-bridge-exit-enterprise-value`, `helios-FINANCING_SHORTFALL-bridge-exit-cash` |
| `vc-formula-financing_shortfall-bridge-exit-cash` | ADD | `helios-FINANCING_SHORTFALL-bridge-exit-cash` | `helios-FINANCING_SHORTFALL-month-60-ending_cash_cents`, `helios-FINANCING_SHORTFALL-bridge-exit-cash-zero` |
| `vc-formula-financing_shortfall-minimum-cash` | MIN | `helios-FINANCING_SHORTFALL-minimum-cash` | `helios-FINANCING_SHORTFALL-month-01-ending_cash_cents`, `helios-FINANCING_SHORTFALL-month-02-ending_cash_cents`, `helios-FINANCING_SHORTFALL-month-03-ending_cash_cents`; +57 more in model-appendix.json (ordered-list SHA-256 `e633a4835a1d7e7b9bff93a0f30d81076e6b835c529a087137e07b29b16f6db4`) |
| `vc-formula-financing_shortfall-funded-capital` | SUM | `helios-FINANCING_SHORTFALL-target-invested` | `helios-FINANCING_SHORTFALL-event-series-c-close-new-money`, `helios-FINANCING_SHORTFALL-event-series-c-tranche-new-money` |
| `vc-formula-financing_shortfall-ownership` | DIVIDE | `helios-FINANCING_SHORTFALL-ownership` | `helios-FINANCING_SHORTFALL-target-shares`, `helios-FINANCING_SHORTFALL-fully-diluted-shares` |
| `vc-formula-financing_shortfall-moic` | DIVIDE | `helios-FINANCING_SHORTFALL-gross-moic` | `helios-FINANCING_SHORTFALL-target-proceeds`, `helios-FINANCING_SHORTFALL-target-invested` |
| `vc-formula-financing_shortfall-dated-xirr` | DATED_XIRR | `helios-FINANCING_SHORTFALL-gross-xirr` | `helios-FINANCING_SHORTFALL-target-cash-flow-01`, `helios-FINANCING_SHORTFALL-target-cash-flow-02` |
| `vc-formula-financing_shortfall-target-proceeds` | ADD | `helios-FINANCING_SHORTFALL-target-proceeds` | `helios-FINANCING_SHORTFALL-waterfall-series_c-proceeds`, `helios-FINANCING_SHORTFALL-target-proceeds-zero` |
| `vc-formula-financing_shortfall-waterfall-conservation` | SUM | `helios-FINANCING_SHORTFALL-exit-value` | `helios-FINANCING_SHORTFALL-waterfall-common`, `helios-FINANCING_SHORTFALL-waterfall-series_a-proceeds`, `helios-FINANCING_SHORTFALL-waterfall-series_b-proceeds`, `helios-FINANCING_SHORTFALL-waterfall-series_bridge-proceeds`, `helios-FINANCING_SHORTFALL-waterfall-series_c-proceeds` |
| `vc-formula-distribution-p10-moic` | QUANTILE_P10 | `helios-distribution-moic-0` | `helios-distribution-draw-count`, `helios-distribution-p10-rank-index`, `helios-distribution-path-0000-moic`; +999 more in model-appendix.json (ordered-list SHA-256 `39805f22ed2f5e866b67db01bb1beaab83a0731e45be30f68dec52ba8a78117a`) |
| `vc-formula-distribution-p50-moic` | QUANTILE_P50 | `helios-distribution-moic-1` | `helios-distribution-draw-count`, `helios-distribution-p50-rank-index`, `helios-distribution-path-0000-moic`; +999 more in model-appendix.json (ordered-list SHA-256 `6ad63cf6affc72fc1b8004bec20070aa27be997455204ba004994204919dcdbb`) |
| `vc-formula-distribution-p90-moic` | QUANTILE_P90 | `helios-distribution-moic-2` | `helios-distribution-draw-count`, `helios-distribution-p90-rank-index`, `helios-distribution-path-0000-moic`; +999 more in model-appendix.json (ordered-list SHA-256 `8d79186813a9d4747f00b1e5943ea091ac1e21b5c08ef95ac1e9b898c3d9465c`) |
| `vc-formula-distribution-p10-xirr` | QUANTILE_P10 | `helios-distribution-xirr-0` | `helios-distribution-draw-count`, `helios-distribution-p10-rank-index`, `helios-distribution-path-0000-xirr`; +999 more in model-appendix.json (ordered-list SHA-256 `da8d62f556120bff66818a7e395ae71fb16d4992fadb18578de078a7b85d4bb8`) |
| `vc-formula-distribution-p50-xirr` | QUANTILE_P50 | `helios-distribution-xirr-1` | `helios-distribution-draw-count`, `helios-distribution-p50-rank-index`, `helios-distribution-path-0000-xirr`; +999 more in model-appendix.json (ordered-list SHA-256 `87161fe1577f84a558f170711ad1fa86c7939c6388e24c0ffe6f688d48b853aa`) |
| `vc-formula-distribution-p90-xirr` | QUANTILE_P90 | `helios-distribution-xirr-2` | `helios-distribution-draw-count`, `helios-distribution-p90-rank-index`, `helios-distribution-path-0000-xirr`; +999 more in model-appendix.json (ordered-list SHA-256 `5c214db2af3223f647e8332e3687d52ebe7cf31f176770f24e72783108d21660`) |
| `vc-formula-distribution-probability-below-one` | PROBABILITY_BELOW_ONE_PERCENT | `helios-hx-09-probability_below_1x` | `helios-distribution-path-0000-moic`, `helios-distribution-path-0001-moic`, `helios-distribution-path-0002-moic`; +997 more in model-appendix.json (ordered-list SHA-256 `464817cdeaeb81f9d141d174fd02d354b7bd3d90d3e00970ffe1e5b6d3186626`) |
| `vc-formula-vc-annual_revenue_growth-1-moic` | DIVIDE | `helios-vc-annual_revenue_growth-1-gross-moic` | `helios-vc-annual_revenue_growth-1-proceeds`, `helios-vc-annual_revenue_growth-1-invested` |
| `vc-formula-vc-annual_revenue_growth-1-xirr` | DATED_XIRR | `helios-vc-annual_revenue_growth-1-gross-xirr` | `helios-vc-annual_revenue_growth-1-cash-flow-01`, `helios-vc-annual_revenue_growth-1-cash-flow-02`, `helios-vc-annual_revenue_growth-1-cash-flow-03` |
| `vc-formula-vc-annual_revenue_growth-1-ownership` | DIVIDE | `helios-vc-annual_revenue_growth-1-ownership` | `helios-vc-annual_revenue_growth-1-target-shares`, `helios-vc-annual_revenue_growth-1-fully-diluted-shares` |
| `vc-formula-vc-annual_revenue_growth-1-minimum-cash` | MIN | `helios-vc-annual_revenue_growth-1-minimum-cash` | `helios-vc-annual_revenue_growth-1-ending-cash-01`, `helios-vc-annual_revenue_growth-1-ending-cash-02`, `helios-vc-annual_revenue_growth-1-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `62d29f2ba84b8dacdcea1ffa1db06ed0b9f09b67d6321d20972a7833d4644b69`) |
| `vc-formula-vc-annual_revenue_growth-1-exit-ev` | MULTIPLY | `helios-vc-annual_revenue_growth-1-exit-enterprise-value` | `helios-vc-annual_revenue_growth-1-terminal-revenue`, `helios-vc-annual_revenue_growth-1-exit-revenue-multiple` |
| `vc-formula-vc-annual_revenue_growth-1-exit-equity` | ADD | `helios-vc-annual_revenue_growth-1-exit-equity-value` | `helios-vc-annual_revenue_growth-1-exit-enterprise-value`, `helios-vc-annual_revenue_growth-1-ending-cash-60` |
| `vc-formula-vc-annual_revenue_growth-2-moic` | DIVIDE | `helios-vc-annual_revenue_growth-2-gross-moic` | `helios-vc-annual_revenue_growth-2-proceeds`, `helios-vc-annual_revenue_growth-2-invested` |
| `vc-formula-vc-annual_revenue_growth-2-xirr` | DATED_XIRR | `helios-vc-annual_revenue_growth-2-gross-xirr` | `helios-vc-annual_revenue_growth-2-cash-flow-01`, `helios-vc-annual_revenue_growth-2-cash-flow-02`, `helios-vc-annual_revenue_growth-2-cash-flow-03` |
| `vc-formula-vc-annual_revenue_growth-2-ownership` | DIVIDE | `helios-vc-annual_revenue_growth-2-ownership` | `helios-vc-annual_revenue_growth-2-target-shares`, `helios-vc-annual_revenue_growth-2-fully-diluted-shares` |
| `vc-formula-vc-annual_revenue_growth-2-minimum-cash` | MIN | `helios-vc-annual_revenue_growth-2-minimum-cash` | `helios-vc-annual_revenue_growth-2-ending-cash-01`, `helios-vc-annual_revenue_growth-2-ending-cash-02`, `helios-vc-annual_revenue_growth-2-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `ca58f9955c91486a705c4b0d9550758163d05137147f07c4714188425ae771fb`) |
| `vc-formula-vc-annual_revenue_growth-2-exit-ev` | MULTIPLY | `helios-vc-annual_revenue_growth-2-exit-enterprise-value` | `helios-vc-annual_revenue_growth-2-terminal-revenue`, `helios-vc-annual_revenue_growth-2-exit-revenue-multiple` |
| `vc-formula-vc-annual_revenue_growth-2-exit-equity` | ADD | `helios-vc-annual_revenue_growth-2-exit-equity-value` | `helios-vc-annual_revenue_growth-2-exit-enterprise-value`, `helios-vc-annual_revenue_growth-2-ending-cash-60` |
| `vc-formula-vc-annual_revenue_growth-3-moic` | DIVIDE | `helios-vc-annual_revenue_growth-3-gross-moic` | `helios-vc-annual_revenue_growth-3-proceeds`, `helios-vc-annual_revenue_growth-3-invested` |
| `vc-formula-vc-annual_revenue_growth-3-xirr` | DATED_XIRR | `helios-vc-annual_revenue_growth-3-gross-xirr` | `helios-vc-annual_revenue_growth-3-cash-flow-01`, `helios-vc-annual_revenue_growth-3-cash-flow-02`, `helios-vc-annual_revenue_growth-3-cash-flow-03` |
| `vc-formula-vc-annual_revenue_growth-3-ownership` | DIVIDE | `helios-vc-annual_revenue_growth-3-ownership` | `helios-vc-annual_revenue_growth-3-target-shares`, `helios-vc-annual_revenue_growth-3-fully-diluted-shares` |
| `vc-formula-vc-annual_revenue_growth-3-minimum-cash` | MIN | `helios-vc-annual_revenue_growth-3-minimum-cash` | `helios-vc-annual_revenue_growth-3-ending-cash-01`, `helios-vc-annual_revenue_growth-3-ending-cash-02`, `helios-vc-annual_revenue_growth-3-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `b375d6f1a7d8ffa37743465880e385a5b736c97e9c24cd69285c144a2aaacdde`) |
| `vc-formula-vc-annual_revenue_growth-3-exit-ev` | MULTIPLY | `helios-vc-annual_revenue_growth-3-exit-enterprise-value` | `helios-vc-annual_revenue_growth-3-terminal-revenue`, `helios-vc-annual_revenue_growth-3-exit-revenue-multiple` |
| `vc-formula-vc-annual_revenue_growth-3-exit-equity` | ADD | `helios-vc-annual_revenue_growth-3-exit-equity-value` | `helios-vc-annual_revenue_growth-3-exit-enterprise-value`, `helios-vc-annual_revenue_growth-3-ending-cash-60` |
| `vc-formula-vc-exit_revenue_multiple-1-moic` | DIVIDE | `helios-vc-exit_revenue_multiple-1-gross-moic` | `helios-vc-exit_revenue_multiple-1-proceeds`, `helios-vc-exit_revenue_multiple-1-invested` |
| `vc-formula-vc-exit_revenue_multiple-1-xirr` | DATED_XIRR | `helios-vc-exit_revenue_multiple-1-gross-xirr` | `helios-vc-exit_revenue_multiple-1-cash-flow-01`, `helios-vc-exit_revenue_multiple-1-cash-flow-02`, `helios-vc-exit_revenue_multiple-1-cash-flow-03` |
| `vc-formula-vc-exit_revenue_multiple-1-ownership` | DIVIDE | `helios-vc-exit_revenue_multiple-1-ownership` | `helios-vc-exit_revenue_multiple-1-target-shares`, `helios-vc-exit_revenue_multiple-1-fully-diluted-shares` |
| `vc-formula-vc-exit_revenue_multiple-1-minimum-cash` | MIN | `helios-vc-exit_revenue_multiple-1-minimum-cash` | `helios-vc-exit_revenue_multiple-1-ending-cash-01`, `helios-vc-exit_revenue_multiple-1-ending-cash-02`, `helios-vc-exit_revenue_multiple-1-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `379b2584e8b432470c3b27c5f575a106ca1c9cf40c9a2d4859c9f748e15a2b9e`) |
| `vc-formula-vc-exit_revenue_multiple-1-exit-ev` | MULTIPLY | `helios-vc-exit_revenue_multiple-1-exit-enterprise-value` | `helios-vc-exit_revenue_multiple-1-terminal-revenue`, `helios-vc-exit_revenue_multiple-1-exit-revenue-multiple` |
| `vc-formula-vc-exit_revenue_multiple-1-exit-equity` | ADD | `helios-vc-exit_revenue_multiple-1-exit-equity-value` | `helios-vc-exit_revenue_multiple-1-exit-enterprise-value`, `helios-vc-exit_revenue_multiple-1-ending-cash-60` |
| `vc-formula-vc-exit_revenue_multiple-2-moic` | DIVIDE | `helios-vc-exit_revenue_multiple-2-gross-moic` | `helios-vc-exit_revenue_multiple-2-proceeds`, `helios-vc-exit_revenue_multiple-2-invested` |
| `vc-formula-vc-exit_revenue_multiple-2-xirr` | DATED_XIRR | `helios-vc-exit_revenue_multiple-2-gross-xirr` | `helios-vc-exit_revenue_multiple-2-cash-flow-01`, `helios-vc-exit_revenue_multiple-2-cash-flow-02`, `helios-vc-exit_revenue_multiple-2-cash-flow-03` |
| `vc-formula-vc-exit_revenue_multiple-2-ownership` | DIVIDE | `helios-vc-exit_revenue_multiple-2-ownership` | `helios-vc-exit_revenue_multiple-2-target-shares`, `helios-vc-exit_revenue_multiple-2-fully-diluted-shares` |
| `vc-formula-vc-exit_revenue_multiple-2-minimum-cash` | MIN | `helios-vc-exit_revenue_multiple-2-minimum-cash` | `helios-vc-exit_revenue_multiple-2-ending-cash-01`, `helios-vc-exit_revenue_multiple-2-ending-cash-02`, `helios-vc-exit_revenue_multiple-2-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `277fb7d944fd393f48fb91f7158eae933b82d042f934edf61692b99c2ca51109`) |
| `vc-formula-vc-exit_revenue_multiple-2-exit-ev` | MULTIPLY | `helios-vc-exit_revenue_multiple-2-exit-enterprise-value` | `helios-vc-exit_revenue_multiple-2-terminal-revenue`, `helios-vc-exit_revenue_multiple-2-exit-revenue-multiple` |
| `vc-formula-vc-exit_revenue_multiple-2-exit-equity` | ADD | `helios-vc-exit_revenue_multiple-2-exit-equity-value` | `helios-vc-exit_revenue_multiple-2-exit-enterprise-value`, `helios-vc-exit_revenue_multiple-2-ending-cash-60` |
| `vc-formula-vc-exit_revenue_multiple-3-moic` | DIVIDE | `helios-vc-exit_revenue_multiple-3-gross-moic` | `helios-vc-exit_revenue_multiple-3-proceeds`, `helios-vc-exit_revenue_multiple-3-invested` |
| `vc-formula-vc-exit_revenue_multiple-3-xirr` | DATED_XIRR | `helios-vc-exit_revenue_multiple-3-gross-xirr` | `helios-vc-exit_revenue_multiple-3-cash-flow-01`, `helios-vc-exit_revenue_multiple-3-cash-flow-02`, `helios-vc-exit_revenue_multiple-3-cash-flow-03` |
| `vc-formula-vc-exit_revenue_multiple-3-ownership` | DIVIDE | `helios-vc-exit_revenue_multiple-3-ownership` | `helios-vc-exit_revenue_multiple-3-target-shares`, `helios-vc-exit_revenue_multiple-3-fully-diluted-shares` |
| `vc-formula-vc-exit_revenue_multiple-3-minimum-cash` | MIN | `helios-vc-exit_revenue_multiple-3-minimum-cash` | `helios-vc-exit_revenue_multiple-3-ending-cash-01`, `helios-vc-exit_revenue_multiple-3-ending-cash-02`, `helios-vc-exit_revenue_multiple-3-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `e9e0e615b45067af180790c3a583e025a3a4f404ff7923346e2b1580a25cf57d`) |
| `vc-formula-vc-exit_revenue_multiple-3-exit-ev` | MULTIPLY | `helios-vc-exit_revenue_multiple-3-exit-enterprise-value` | `helios-vc-exit_revenue_multiple-3-terminal-revenue`, `helios-vc-exit_revenue_multiple-3-exit-revenue-multiple` |
| `vc-formula-vc-exit_revenue_multiple-3-exit-equity` | ADD | `helios-vc-exit_revenue_multiple-3-exit-equity-value` | `helios-vc-exit_revenue_multiple-3-exit-enterprise-value`, `helios-vc-exit_revenue_multiple-3-ending-cash-60` |
| `vc-formula-vc-ordinary_cohort_nrr-1-moic` | DIVIDE | `helios-vc-ordinary_cohort_nrr-1-gross-moic` | `helios-vc-ordinary_cohort_nrr-1-proceeds`, `helios-vc-ordinary_cohort_nrr-1-invested` |
| `vc-formula-vc-ordinary_cohort_nrr-1-xirr` | DATED_XIRR | `helios-vc-ordinary_cohort_nrr-1-gross-xirr` | `helios-vc-ordinary_cohort_nrr-1-cash-flow-01`, `helios-vc-ordinary_cohort_nrr-1-cash-flow-02`, `helios-vc-ordinary_cohort_nrr-1-cash-flow-03` |
| `vc-formula-vc-ordinary_cohort_nrr-1-ownership` | DIVIDE | `helios-vc-ordinary_cohort_nrr-1-ownership` | `helios-vc-ordinary_cohort_nrr-1-target-shares`, `helios-vc-ordinary_cohort_nrr-1-fully-diluted-shares` |
| `vc-formula-vc-ordinary_cohort_nrr-1-minimum-cash` | MIN | `helios-vc-ordinary_cohort_nrr-1-minimum-cash` | `helios-vc-ordinary_cohort_nrr-1-ending-cash-01`, `helios-vc-ordinary_cohort_nrr-1-ending-cash-02`, `helios-vc-ordinary_cohort_nrr-1-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `c5f1b95392a0bcd773d09bfba1096b9e71847e93bb65ebe14bdb463f7f4a9cb7`) |
| `vc-formula-vc-ordinary_cohort_nrr-1-exit-ev` | MULTIPLY | `helios-vc-ordinary_cohort_nrr-1-exit-enterprise-value` | `helios-vc-ordinary_cohort_nrr-1-terminal-revenue`, `helios-vc-ordinary_cohort_nrr-1-exit-revenue-multiple` |
| `vc-formula-vc-ordinary_cohort_nrr-1-exit-equity` | ADD | `helios-vc-ordinary_cohort_nrr-1-exit-equity-value` | `helios-vc-ordinary_cohort_nrr-1-exit-enterprise-value`, `helios-vc-ordinary_cohort_nrr-1-ending-cash-60` |
| `vc-formula-vc-ordinary_cohort_nrr-2-moic` | DIVIDE | `helios-vc-ordinary_cohort_nrr-2-gross-moic` | `helios-vc-ordinary_cohort_nrr-2-proceeds`, `helios-vc-ordinary_cohort_nrr-2-invested` |
| `vc-formula-vc-ordinary_cohort_nrr-2-xirr` | DATED_XIRR | `helios-vc-ordinary_cohort_nrr-2-gross-xirr` | `helios-vc-ordinary_cohort_nrr-2-cash-flow-01`, `helios-vc-ordinary_cohort_nrr-2-cash-flow-02`, `helios-vc-ordinary_cohort_nrr-2-cash-flow-03` |
| `vc-formula-vc-ordinary_cohort_nrr-2-ownership` | DIVIDE | `helios-vc-ordinary_cohort_nrr-2-ownership` | `helios-vc-ordinary_cohort_nrr-2-target-shares`, `helios-vc-ordinary_cohort_nrr-2-fully-diluted-shares` |
| `vc-formula-vc-ordinary_cohort_nrr-2-minimum-cash` | MIN | `helios-vc-ordinary_cohort_nrr-2-minimum-cash` | `helios-vc-ordinary_cohort_nrr-2-ending-cash-01`, `helios-vc-ordinary_cohort_nrr-2-ending-cash-02`, `helios-vc-ordinary_cohort_nrr-2-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `4441cb136d7e71709042787b1ca3677064a7bbb36bf86f6b7f2caf5c2012470b`) |
| `vc-formula-vc-ordinary_cohort_nrr-2-exit-ev` | MULTIPLY | `helios-vc-ordinary_cohort_nrr-2-exit-enterprise-value` | `helios-vc-ordinary_cohort_nrr-2-terminal-revenue`, `helios-vc-ordinary_cohort_nrr-2-exit-revenue-multiple` |
| `vc-formula-vc-ordinary_cohort_nrr-2-exit-equity` | ADD | `helios-vc-ordinary_cohort_nrr-2-exit-equity-value` | `helios-vc-ordinary_cohort_nrr-2-exit-enterprise-value`, `helios-vc-ordinary_cohort_nrr-2-ending-cash-60` |
| `vc-formula-vc-ordinary_cohort_nrr-3-moic` | DIVIDE | `helios-vc-ordinary_cohort_nrr-3-gross-moic` | `helios-vc-ordinary_cohort_nrr-3-proceeds`, `helios-vc-ordinary_cohort_nrr-3-invested` |
| `vc-formula-vc-ordinary_cohort_nrr-3-xirr` | DATED_XIRR | `helios-vc-ordinary_cohort_nrr-3-gross-xirr` | `helios-vc-ordinary_cohort_nrr-3-cash-flow-01`, `helios-vc-ordinary_cohort_nrr-3-cash-flow-02`, `helios-vc-ordinary_cohort_nrr-3-cash-flow-03` |
| `vc-formula-vc-ordinary_cohort_nrr-3-ownership` | DIVIDE | `helios-vc-ordinary_cohort_nrr-3-ownership` | `helios-vc-ordinary_cohort_nrr-3-target-shares`, `helios-vc-ordinary_cohort_nrr-3-fully-diluted-shares` |
| `vc-formula-vc-ordinary_cohort_nrr-3-minimum-cash` | MIN | `helios-vc-ordinary_cohort_nrr-3-minimum-cash` | `helios-vc-ordinary_cohort_nrr-3-ending-cash-01`, `helios-vc-ordinary_cohort_nrr-3-ending-cash-02`, `helios-vc-ordinary_cohort_nrr-3-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `12f1742b8a5de8fea56dbdbe287cf1bde266af06fad0c5051bcf6a05cf7403ca`) |
| `vc-formula-vc-ordinary_cohort_nrr-3-exit-ev` | MULTIPLY | `helios-vc-ordinary_cohort_nrr-3-exit-enterprise-value` | `helios-vc-ordinary_cohort_nrr-3-terminal-revenue`, `helios-vc-ordinary_cohort_nrr-3-exit-revenue-multiple` |
| `vc-formula-vc-ordinary_cohort_nrr-3-exit-equity` | ADD | `helios-vc-ordinary_cohort_nrr-3-exit-equity-value` | `helios-vc-ordinary_cohort_nrr-3-exit-enterprise-value`, `helios-vc-ordinary_cohort_nrr-3-ending-cash-60` |
| `vc-formula-vc-later_round_price-1-moic` | DIVIDE | `helios-vc-later_round_price-1-gross-moic` | `helios-vc-later_round_price-1-proceeds`, `helios-vc-later_round_price-1-invested` |
| `vc-formula-vc-later_round_price-1-xirr` | DATED_XIRR | `helios-vc-later_round_price-1-gross-xirr` | `helios-vc-later_round_price-1-cash-flow-01`, `helios-vc-later_round_price-1-cash-flow-02` |
| `vc-formula-vc-later_round_price-1-ownership` | DIVIDE | `helios-vc-later_round_price-1-ownership` | `helios-vc-later_round_price-1-target-shares`, `helios-vc-later_round_price-1-fully-diluted-shares` |
| `vc-formula-vc-later_round_price-1-minimum-cash` | MIN | `helios-vc-later_round_price-1-minimum-cash` | `helios-vc-later_round_price-1-ending-cash-01`, `helios-vc-later_round_price-1-ending-cash-02`, `helios-vc-later_round_price-1-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `94289336e5c2d10253d82ab0fdff4c2ead1c29e4398ea4b3faa37a13b98c4d99`) |
| `vc-formula-vc-later_round_price-1-exit-ev` | MULTIPLY | `helios-vc-later_round_price-1-exit-enterprise-value` | `helios-vc-later_round_price-1-terminal-revenue`, `helios-vc-later_round_price-1-exit-revenue-multiple` |
| `vc-formula-vc-later_round_price-1-exit-equity` | ADD | `helios-vc-later_round_price-1-exit-equity-value` | `helios-vc-later_round_price-1-exit-enterprise-value`, `helios-vc-later_round_price-1-ending-cash-60` |
| `vc-formula-vc-later_round_price-2-moic` | DIVIDE | `helios-vc-later_round_price-2-gross-moic` | `helios-vc-later_round_price-2-proceeds`, `helios-vc-later_round_price-2-invested` |
| `vc-formula-vc-later_round_price-2-xirr` | DATED_XIRR | `helios-vc-later_round_price-2-gross-xirr` | `helios-vc-later_round_price-2-cash-flow-01`, `helios-vc-later_round_price-2-cash-flow-02` |
| `vc-formula-vc-later_round_price-2-ownership` | DIVIDE | `helios-vc-later_round_price-2-ownership` | `helios-vc-later_round_price-2-target-shares`, `helios-vc-later_round_price-2-fully-diluted-shares` |
| `vc-formula-vc-later_round_price-2-minimum-cash` | MIN | `helios-vc-later_round_price-2-minimum-cash` | `helios-vc-later_round_price-2-ending-cash-01`, `helios-vc-later_round_price-2-ending-cash-02`, `helios-vc-later_round_price-2-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `dd3148f0eb67012e754a709f2eee08d785957ef073a88f838c1adec693e76f7a`) |
| `vc-formula-vc-later_round_price-2-exit-ev` | MULTIPLY | `helios-vc-later_round_price-2-exit-enterprise-value` | `helios-vc-later_round_price-2-terminal-revenue`, `helios-vc-later_round_price-2-exit-revenue-multiple` |
| `vc-formula-vc-later_round_price-2-exit-equity` | ADD | `helios-vc-later_round_price-2-exit-equity-value` | `helios-vc-later_round_price-2-exit-enterprise-value`, `helios-vc-later_round_price-2-ending-cash-60` |
| `vc-formula-vc-later_round_price-3-moic` | DIVIDE | `helios-vc-later_round_price-3-gross-moic` | `helios-vc-later_round_price-3-proceeds`, `helios-vc-later_round_price-3-invested` |
| `vc-formula-vc-later_round_price-3-xirr` | DATED_XIRR | `helios-vc-later_round_price-3-gross-xirr` | `helios-vc-later_round_price-3-cash-flow-01`, `helios-vc-later_round_price-3-cash-flow-02` |
| `vc-formula-vc-later_round_price-3-ownership` | DIVIDE | `helios-vc-later_round_price-3-ownership` | `helios-vc-later_round_price-3-target-shares`, `helios-vc-later_round_price-3-fully-diluted-shares` |
| `vc-formula-vc-later_round_price-3-minimum-cash` | MIN | `helios-vc-later_round_price-3-minimum-cash` | `helios-vc-later_round_price-3-ending-cash-01`, `helios-vc-later_round_price-3-ending-cash-02`, `helios-vc-later_round_price-3-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `3e80bb8504675fbc16fe12c3decb805ba21fb73cffe36d001b9ec95e273d1396`) |
| `vc-formula-vc-later_round_price-3-exit-ev` | MULTIPLY | `helios-vc-later_round_price-3-exit-enterprise-value` | `helios-vc-later_round_price-3-terminal-revenue`, `helios-vc-later_round_price-3-exit-revenue-multiple` |
| `vc-formula-vc-later_round_price-3-exit-equity` | ADD | `helios-vc-later_round_price-3-exit-equity-value` | `helios-vc-later_round_price-3-exit-enterprise-value`, `helios-vc-later_round_price-3-ending-cash-60` |
| `vc-formula-vc-milestone_state-1-moic` | DIVIDE | `helios-vc-milestone_state-1-gross-moic` | `helios-vc-milestone_state-1-proceeds`, `helios-vc-milestone_state-1-invested` |
| `vc-formula-vc-milestone_state-1-xirr` | DATED_XIRR | `helios-vc-milestone_state-1-gross-xirr` | `helios-vc-milestone_state-1-cash-flow-01`, `helios-vc-milestone_state-1-cash-flow-02` |
| `vc-formula-vc-milestone_state-1-ownership` | DIVIDE | `helios-vc-milestone_state-1-ownership` | `helios-vc-milestone_state-1-target-shares`, `helios-vc-milestone_state-1-fully-diluted-shares` |
| `vc-formula-vc-milestone_state-1-minimum-cash` | MIN | `helios-vc-milestone_state-1-minimum-cash` | `helios-vc-milestone_state-1-ending-cash-01`, `helios-vc-milestone_state-1-ending-cash-02`, `helios-vc-milestone_state-1-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `bf9cfa93b6e6c926b2fe6c0cf9c4b1a4675627551420ae5a9afc483db06acfea`) |
| `vc-formula-vc-milestone_state-1-exit-ev` | MULTIPLY | `helios-vc-milestone_state-1-exit-enterprise-value` | `helios-vc-milestone_state-1-terminal-revenue`, `helios-vc-milestone_state-1-exit-revenue-multiple` |
| `vc-formula-vc-milestone_state-1-exit-equity` | ADD | `helios-vc-milestone_state-1-exit-equity-value` | `helios-vc-milestone_state-1-exit-enterprise-value`, `helios-vc-milestone_state-1-ending-cash-60` |
| `vc-formula-vc-milestone_state-2-moic` | DIVIDE | `helios-vc-milestone_state-2-gross-moic` | `helios-vc-milestone_state-2-proceeds`, `helios-vc-milestone_state-2-invested` |
| `vc-formula-vc-milestone_state-2-xirr` | DATED_XIRR | `helios-vc-milestone_state-2-gross-xirr` | `helios-vc-milestone_state-2-cash-flow-01`, `helios-vc-milestone_state-2-cash-flow-02`, `helios-vc-milestone_state-2-cash-flow-03` |
| `vc-formula-vc-milestone_state-2-ownership` | DIVIDE | `helios-vc-milestone_state-2-ownership` | `helios-vc-milestone_state-2-target-shares`, `helios-vc-milestone_state-2-fully-diluted-shares` |
| `vc-formula-vc-milestone_state-2-minimum-cash` | MIN | `helios-vc-milestone_state-2-minimum-cash` | `helios-vc-milestone_state-2-ending-cash-01`, `helios-vc-milestone_state-2-ending-cash-02`, `helios-vc-milestone_state-2-ending-cash-03`; +57 more in model-appendix.json (ordered-list SHA-256 `0b0946538a5afbfe72d79ab464226fb7556555557adaef8bbfd0e4185969190a`) |
| `vc-formula-vc-milestone_state-2-exit-ev` | MULTIPLY | `helios-vc-milestone_state-2-exit-enterprise-value` | `helios-vc-milestone_state-2-terminal-revenue`, `helios-vc-milestone_state-2-exit-revenue-multiple` |
| `vc-formula-vc-milestone_state-2-exit-equity` | ADD | `helios-vc-milestone_state-2-exit-equity-value` | `helios-vc-milestone_state-2-exit-enterprise-value`, `helios-vc-milestone_state-2-ending-cash-60` |
| `vc-formula-value-ordinary-expansion-minimum_cash_delta_cents` | SUBTRACT | `helios-value-ordinary-expansion-minimum_cash_delta_cents` | `helios-value-ordinary-expansion-minimum_cash_delta_cents-result`, `helios-value-base-minimum_cash_delta_cents` |
| `vc-formula-value-ordinary-expansion-target_proceeds_delta_cents` | SUBTRACT | `helios-value-ordinary-expansion-target_proceeds_delta_cents` | `helios-value-ordinary-expansion-target_proceeds_delta_cents-result`, `helios-value-base-target_proceeds_delta_cents` |
| `vc-formula-value-ordinary-expansion-gross-xirr-delta` | SUBTRACT | `helios-value-ordinary-expansion-gross-xirr-delta` | `helios-value-ordinary-expansion-gross-xirr-delta-result`, `helios-value-base-gross-xirr-delta` |
| `vc-formula-value-ordinary-expansion-gross-moic-delta` | SUBTRACT | `helios-value-ordinary-expansion-gross-moic-delta` | `helios-value-ordinary-expansion-gross-moic-delta-result`, `helios-value-base-gross-moic-delta` |
| `vc-formula-value-optimizer-unit-economics-minimum_cash_delta_cents` | SUBTRACT | `helios-value-optimizer-unit-economics-minimum_cash_delta_cents` | `helios-value-optimizer-unit-economics-minimum_cash_delta_cents-result`, `helios-value-base-minimum_cash_delta_cents` |
| `vc-formula-value-optimizer-unit-economics-target_proceeds_delta_cents` | SUBTRACT | `helios-value-optimizer-unit-economics-target_proceeds_delta_cents` | `helios-value-optimizer-unit-economics-target_proceeds_delta_cents-result`, `helios-value-base-target_proceeds_delta_cents` |
| `vc-formula-value-optimizer-unit-economics-gross-xirr-delta` | SUBTRACT | `helios-value-optimizer-unit-economics-gross-xirr-delta` | `helios-value-optimizer-unit-economics-gross-xirr-delta-result`, `helios-value-base-gross-xirr-delta` |
| `vc-formula-value-optimizer-unit-economics-gross-moic-delta` | SUBTRACT | `helios-value-optimizer-unit-economics-gross-moic-delta` | `helios-value-optimizer-unit-economics-gross-moic-delta-result`, `helios-value-base-gross-moic-delta` |
| `vc-formula-value-sales-governance-minimum_cash_delta_cents` | SUBTRACT | `helios-value-sales-governance-minimum_cash_delta_cents` | `helios-value-sales-governance-minimum_cash_delta_cents-result`, `helios-value-base-minimum_cash_delta_cents` |
| `vc-formula-value-sales-governance-target_proceeds_delta_cents` | SUBTRACT | `helios-value-sales-governance-target_proceeds_delta_cents` | `helios-value-sales-governance-target_proceeds_delta_cents-result`, `helios-value-base-target_proceeds_delta_cents` |
| `vc-formula-value-sales-governance-gross-xirr-delta` | SUBTRACT | `helios-value-sales-governance-gross-xirr-delta` | `helios-value-sales-governance-gross-xirr-delta-result`, `helios-value-base-gross-xirr-delta` |
| `vc-formula-value-sales-governance-gross-moic-delta` | SUBTRACT | `helios-value-sales-governance-gross-moic-delta` | `helios-value-sales-governance-gross-moic-delta-result`, `helios-value-base-gross-moic-delta` |
| `vc-formula-value-combined-minimum_cash_delta_cents` | SUBTRACT | `helios-value-combined_minimum_cash_delta_cents` | `helios-value-combined-minimum_cash_delta_cents-result`, `helios-value-base-minimum_cash_delta_cents` |
| `vc-formula-value-combined-target_proceeds_delta_cents` | SUBTRACT | `helios-value-combined_target_proceeds_delta_cents` | `helios-value-combined-target_proceeds_delta_cents-result`, `helios-value-base-target_proceeds_delta_cents` |
| `vc-formula-value-combined-gross-xirr-delta` | SUBTRACT | `helios-value-combined-gross-xirr-delta` | `helios-value-combined-gross-xirr-delta-result`, `helios-value-base-gross-xirr-delta` |
| `vc-formula-value-combined-gross-moic-delta` | SUBTRACT | `helios-value-combined-gross-moic-delta` | `helios-value-combined-gross-moic-delta-result`, `helios-value-base-gross-moic-delta` |
| `vc-formula-value-standalone-proceeds-sum` | SUM | `helios-value-sum_standalone_target_proceeds_delta_cents` | `helios-value-ordinary-expansion-target_proceeds_delta_cents`, `helios-value-optimizer-unit-economics-target_proceeds_delta_cents`, `helios-value-sales-governance-target_proceeds_delta_cents` |
| `vc-formula-value-interaction` | SUBTRACT | `helios-value-interaction_residual_cents` | `helios-value-combined_target_proceeds_delta_cents`, `helios-value-sum_standalone_target_proceeds_delta_cents` |

## Sampling precision

These standard errors describe finite simulation sampling error only. They do not measure investment-model accuracy or real-world forecast uncertainty.

- Probability below 1.0x: Monte Carlo SE `1.26 pp` (1,000 draws).

## Reproducibility boundary

All data and results are synthetic. Exact arithmetic, source locators, scenario receipts, and deterministic generation establish internal reproducibility only. They do not establish live-deal accuracy, investment approval, or real-world performance.
