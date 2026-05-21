import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';

export interface ElastiCacheStackProps extends StackProps {
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
}

export class ElastiCacheStack extends Stack {
  public readonly redisEndpoint: string;
  public readonly redisPort: number;

  constructor(scope: Construct, id: string, props: ElastiCacheStackProps) {
    super(scope, id, props);

    const { vpc, ecsSecurityGroup } = props;

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for ElastiCache Redis',
      subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
      cacheSubnetGroupName: `${this.stackName.toLowerCase()}-redis-subnet-group`,
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSG', {
      vpc,
      description: 'Security group for Redis',
    });

    redisSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow ECS tasks access to Redis',
    );

    const redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupDescription: 'ShopPilot Redis cluster',
      cacheNodeType: 'cache.t4g.small',
      engine: 'redis',
      automaticFailoverEnabled: false,
      numNodeGroups: 1,
      replicasPerNodeGroup: 0,
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      transitEncryptionEnabled: false,
      atRestEncryptionEnabled: false,
    });

    redisCluster.addDependency(redisSubnetGroup);

    this.redisEndpoint = redisCluster.attrPrimaryEndPointAddress;
    this.redisPort = Number(redisCluster.attrPrimaryEndPointPort);

    new CfnOutput(this, 'RedisEndpoint', {
      value: this.redisEndpoint,
    });

    new CfnOutput(this, 'RedisPort', {
      value: redisCluster.attrPrimaryEndPointPort,
    });
  }
}
