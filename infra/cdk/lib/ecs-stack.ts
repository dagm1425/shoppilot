import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface EcsStackProps extends StackProps {
  vpc: ec2.IVpc;
  apiImage: string;
  aiImage: string;
  webOrigin: string;
  deployServices?: boolean;
}

export class EcsStack extends Stack {
  public readonly ecsServiceSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const { vpc, apiImage, aiImage, webOrigin, deployServices = true } = props;

    const cluster = new ecs.Cluster(this, 'ShoppilotCluster', { vpc });
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsServiceSG', {
      vpc,
      description: 'Security group for ECS services',
    });
    this.ecsServiceSecurityGroup = ecsSecurityGroup;

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
    );

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const aiLogGroup = new logs.LogGroup(this, 'AiLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const bucket = new s3.Bucket(this, 'MediaBucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    if (!deployServices) {
      return;
    }

    const apiRuntimeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'ApiRuntimeSecret',
      '/shoppilot/prod/api',
    );
    const aiRuntimeSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'AiRuntimeSecret',
      '/shoppilot/prod/ai',
    );

    const aiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'AiService', {
      cluster,
      publicLoadBalancer: false,
      openListener: true,
      assignPublicIp: false,
      desiredCount: 1,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSecurityGroup],
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(aiImage),
        containerName: 'ai',
        containerPort: 8000,
        taskRole,
        executionRole,
        logDriver: ecs.LogDrivers.awsLogs({
          logGroup: aiLogGroup,
          streamPrefix: 'ai',
        }),
        environment: {
          NODE_ENV: 'production',
          PORT: '8000',
          LLM_SYNTHESIS_PROVIDER: 'gemini',
          LLM_SYNTHESIS_BASE_URL: 'https://generativelanguage.googleapis.com',
          LLM_SYNTHESIS_MODEL: 'gemini-2.5-flash',
          SENTRY_ENABLED: 'false',
          LANGCHAIN_TRACING_V2: 'false',
        },
        secrets: {
          DATABASE_URL: ecs.Secret.fromSecretsManager(aiRuntimeSecret, 'DATABASE_URL'),
          GEMINI_API_KEY: ecs.Secret.fromSecretsManager(aiRuntimeSecret, 'GEMINI_API_KEY'),
        },
      },
    });
    aiService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
    });

    const apiService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'ApiService', {
      cluster,
      publicLoadBalancer: true,
      assignPublicIp: false,
      desiredCount: 1,
      cpu: 512,
      memoryLimitMiB: 1024,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSecurityGroup],
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(apiImage),
        containerName: 'api',
        containerPort: 4000,
        command: [
          'sh',
          '-c',
          'cp -asn /app/node_modules/.pnpm/node_modules/* /app/node_modules/ && node apps/api/dist/src/main.js',
        ],
        taskRole,
        executionRole,
        logDriver: ecs.LogDrivers.awsLogs({
          logGroup: apiLogGroup,
          streamPrefix: 'api',
        }),
        environment: {
          NODE_ENV: 'production',
          API_PORT: '4000',
          WEB_ORIGIN: webOrigin,
          AI_SERVICE_BASE_URL: `http://${aiService.loadBalancer.loadBalancerDnsName}`,
          PRODUCT_MEDIA_S3_BUCKET: bucket.bucketName,
          PRODUCT_MEDIA_S3_REGION: this.region,
          SENTRY_ENABLED: 'false',
        },
        secrets: {
          DATABASE_URL: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'DATABASE_URL'),
          REDIS_URL: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'REDIS_URL'),
          JWT_SECRET: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'JWT_SECRET'),
          STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'STRIPE_SECRET_KEY'),
          RESEND_API_KEY: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'RESEND_API_KEY'),
        },
      },
    });
    apiService.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
    });

    new cloudwatch.Alarm(this, 'ApiHighCpuAlarm', {
      metric: apiService.service.metricCpuUtilization({
        period: Duration.minutes(5),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'ApiTarget5xxAlarm', {
      metric: apiService.targetGroup.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
      taskRole,
    });

    workerTaskDef.addContainer('WorkerContainer', {
      image: ecs.ContainerImage.fromRegistry(apiImage),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: workerLogGroup,
        streamPrefix: 'worker',
      }),
      environment: {
        NODE_ENV: 'production',
        WEB_ORIGIN: webOrigin,
        API_PORT: '4000',
        AI_SERVICE_BASE_URL: `http://${aiService.loadBalancer.loadBalancerDnsName}`,
        PRODUCT_MEDIA_S3_BUCKET: bucket.bucketName,
        PRODUCT_MEDIA_S3_REGION: this.region,
        SENTRY_ENABLED: 'false',
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'DATABASE_URL'),
        REDIS_URL: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'REDIS_URL'),
        JWT_SECRET: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'JWT_SECRET'),
        STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'STRIPE_SECRET_KEY'),
        RESEND_API_KEY: ecs.Secret.fromSecretsManager(apiRuntimeSecret, 'RESEND_API_KEY'),
      },
      command: [
        'sh',
        '-c',
        'cp -asn /app/node_modules/.pnpm/node_modules/* /app/node_modules/ && node apps/api/dist/src/worker/bootstrap.js',
      ],
    });

    new ecs.FargateService(this, 'WorkerService', {
      cluster,
      taskDefinition: workerTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [ecsSecurityGroup],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    bucket.grantReadWrite(taskRole);
    apiRuntimeSecret.grantRead(executionRole);
    aiRuntimeSecret.grantRead(executionRole);

    new CfnOutput(this, 'ApiLoadBalancerDnsName', {
      value: apiService.loadBalancer.loadBalancerDnsName,
    });
    new CfnOutput(this, 'AiLoadBalancerDnsName', {
      value: aiService.loadBalancer.loadBalancerDnsName,
    });
  }
}
