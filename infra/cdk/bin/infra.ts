#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack.js';
import { EcrStack } from '../lib/ecr-stack.js';
import { EcsStack } from '../lib/ecs-stack.js';
import { ElastiCacheStack } from '../lib/elasticache-stack.js';
import { RdsStack } from '../lib/rds-stack.js';

const app = new App();

// Read images from CDK context (passed from CI)
const apiImage =
  app.node.tryGetContext('apiImage') || 'public.ecr.aws/placeholder/shoppilot-api:latest';
const aiImage =
  app.node.tryGetContext('aiImage') || 'public.ecr.aws/placeholder/shoppilot-ai:latest';
const webOrigin = app.node.tryGetContext('webOrigin') || 'https://example.com';
const deployServices = app.node.tryGetContext('deployServices') !== 'false';

const vpcStack = new VpcStack(app, 'ShoppilotVpcStack');
const vpc = vpcStack.vpc;

new EcrStack(app, 'ShoppilotEcrStack');

const ecsStack = new EcsStack(app, 'ShoppilotEcsStack', {
  vpc,
  apiImage,
  aiImage,
  webOrigin,
  deployServices,
});

new ElastiCacheStack(app, 'ShoppilotRedisStack', {
  vpc,
  ecsSecurityGroup: ecsStack.ecsServiceSecurityGroup,
});

new RdsStack(app, 'ShoppilotRdsStack', {
  vpc,
  ecsSecurityGroup: ecsStack.ecsServiceSecurityGroup,
});
