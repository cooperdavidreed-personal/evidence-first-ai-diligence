# Undeployed AWS example

This is a small authenticated synthetic numeric-citation endpoint, not a cloud version of the workstation product. It reuses the operating-review implementation and a fixed fictional case. It accepts a bounded numeric claim, not company files or arbitrary code, and makes no model requests.

Build locally with `node workbench/scripts/package-aws.mjs`; test with `node infra/aws/verify.mjs`. The checks exercise handler behavior with simulated API Gateway claims. They do not validate JWT issuance, authentication in AWS, service availability or cloud costs.

The SAM template declares Cognito, an HTTP API with required JWT authorization and throttling, and a concurrency-limited Lambda. Actual SAM validation, account quotas, Node runtime availability in the target region, deployment, user creation, log retention, monitored request window and cloud rollback must be verified before use. No resources were provisioned. No budget/account was authorized. Do not run deployment commands as part of local verification.

A production review would scope log retention and IAM, test unauthenticated/expired JWT requests against AWS, capture cold/warm request timings and billed costs, then delete the trial stack. Local rollback is rebuilding the previous committed artifact; AWS rollback remains untested.

Official references: [Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html), [SAM JWT authorization](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-controlling-access-to-apis-oauth2-authorizer.html). These establish supported configuration, not deployment proof.
