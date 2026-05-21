import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class EcrStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new ecr.Repository(this, 'ApiRepository', {
      repositoryName: 'shoppilot-api',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new ecr.Repository(this, 'AiRepository', {
      repositoryName: 'shoppilot-ai',
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
