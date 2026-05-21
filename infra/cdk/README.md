# infra/cdk

This folder contains AWS CDK stacks for Shoppilot.

Quick commands:

```bash
cd infra/cdk
pnpm install
pnpm build
cdk synth --all
cdk deploy --all --require-approval never -c apiImage=<api image uri> -c aiImage=<ai image uri>
```

The stacks include:
- `VpcStack` — VPC and subnets
- `EcrStack` — ECR repositories
- `ElastiCacheStack` — Redis cluster
- `RdsStack` — PostgreSQL instance for portfolio deployment
- `EcsStack` — ECS cluster, API/AI/worker services, ALBs, and S3 media bucket

Runtime secret names expected by ECS task definitions:
- `/shoppilot/prod/api` with keys: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`
- `/shoppilot/prod/ai` with keys: `DATABASE_URL`, `GEMINI_API_KEY`
