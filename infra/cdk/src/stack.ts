import { Stack, type StackProps, Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class ShopPilotFoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    Tags.of(this).add('project', 'shoppilot');
    Tags.of(this).add('phase', '0-foundation');

    // future: production infra rollout - ECS/Lambda resources are intentionally deferred to later phases
  }
}
