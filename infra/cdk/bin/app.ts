import { App } from 'aws-cdk-lib';
import { ShopPilotFoundationStack } from '../src/stack.js';

const app = new App();

new ShopPilotFoundationStack(app, 'ShopPilotFoundationStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
