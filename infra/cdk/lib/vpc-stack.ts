import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class VpcStack extends Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a VPC with public and private subnets
    const vpc = new ec2.Vpc(this, 'ShoppilotVpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    this.vpc = vpc;
  }
}
