import { fileURLToPath } from "node:url";
import * as path from "node:path";
import {
  App,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import {
  FunctionUrlAuthType,
  HttpMethod,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  Distribution,
  Function as CfFunction,
  FunctionCode,
  FunctionEventType,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import type { Construct } from "constructs";

/**
 * Nightlight AWS stack. Every integration here is documented in docs/AWS.md
 * for the AWS Builder mini challenge:
 *
 * - DynamoDB: the household event log (single on-demand table; the event
 *   log is the source of truth, read models are deterministic replays)
 * - Lambda + function URL: the same Fastify app that runs locally,
 *   selected onto the DynamoDB store by environment
 * - Bedrock: invoke permission for Anthropic models, used only to phrase
 *   the caregiver's morning note (facts are computed deterministically;
 *   the model may only reword them, with a deterministic fallback)
 * - S3 + CloudFront: the statically exported web app
 *
 * Cost posture: on-demand table, one small Lambda, one distribution;
 * comfortably inside the free tier plus the hackathon's AWS credits.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

class NightlightStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "EventLog", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const backend = new NodejsFunction(this, "Backend", {
      entry: path.join(here, "../../apps/backend/src/lambda.ts"),
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        DYNAMO_TABLE: table.tableName,
        NIGHTLIGHT_BEDROCK: "1",
        BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      },
      bundling: {
        format: OutputFormat.ESM,
        target: "node20",
        externalModules: ["@aws-sdk/*"],
        // Some transitive dependencies still use require() inside ESM output.
        banner:
          "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
    table.grantReadWriteData(backend);
    backend.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.*",
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    const fnUrl = backend.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [HttpMethod.ALL],
        allowedHeaders: ["*"],
        exposedHeaders: ["MCP-Session-Id"],
      },
    });

    const siteBucket = new Bucket(this, "Site", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Static exports keep pages at /app/index.html; rewrite extensionless
    // request paths to their directory index.
    const indexRewrite = new CfFunction(this, "IndexRewrite", {
      code: FunctionCode.fromInline(
        "function handler(event) { var req = event.request; var uri = req.uri; if (uri.endsWith('/')) { req.uri = uri + 'index.html'; } else if (!uri.includes('.')) { req.uri = uri + '/index.html'; } return req; }",
      ),
    });

    const distribution = new Distribution(this, "SiteDistribution", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          { function: indexRewrite, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: "/404.html" },
      ],
    });

    new BucketDeployment(this, "SiteDeployment", {
      sources: [Source.asset(path.join(here, "../../apps/web/out"))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "ApiUrl", { value: fnUrl.url });
    new CfnOutput(this, "SiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}

const app = new App();
new NightlightStack(app, "Nightlight", {
  env: { region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
  description:
    "Nightlight: Ring night-shift engine. DynamoDB event log, Lambda backend, Bedrock morning notes, S3 and CloudFront site.",
});
