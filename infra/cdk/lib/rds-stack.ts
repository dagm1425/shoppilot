import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';

export interface RdsStackProps extends StackProps {
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
}

export class RdsStack extends Stack {
  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { vpc, ecsSecurityGroup } = props;

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSG', {
      vpc,
      description: 'Security group for ShopPilot Postgres',
    });

    dbSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow ECS tasks to reach Postgres',
    );

    const database = new rds.DatabaseInstance(this, 'AppDatabase', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      credentials: rds.Credentials.fromGeneratedSecret('shoppilot'),
      databaseName: 'shoppilot',
      securityGroups: [dbSecurityGroup],
      backupRetention: Duration.days(1),
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
      publiclyAccessible: false,
      multiAz: false,
    });

    if (database.secret) {
      new CfnOutput(this, 'DatabaseSecretArn', {
        value: database.secret.secretArn,
      });
    }

    new CfnOutput(this, 'DatabaseEndpoint', {
      value: database.instanceEndpoint.hostname,
    });
  }
}
