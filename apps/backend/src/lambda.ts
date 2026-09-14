import awsLambdaFastify from "@fastify/aws-lambda";
import { buildServer } from "./server";
import { DynamoStore } from "./store";

/**
 * AWS Lambda entry point.
 *
 * The same Fastify app that runs locally is wrapped for Lambda; the only
 * difference is the store: DYNAMO_TABLE selects the DynamoDB-backed event
 * log so state survives across invocations and instances. Deployed by the
 * CDK stack in infra/ behind a Lambda function URL. See docs/AWS.md.
 */

const tableName = process.env.DYNAMO_TABLE;
if (!tableName) {
  throw new Error("DYNAMO_TABLE must be set in the Lambda environment");
}

const { app } = buildServer({ store: new DynamoStore(tableName) });

export const handler = awsLambdaFastify(app);
