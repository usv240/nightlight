import { execSync } from "node:child_process";
import * as fs from "node:fs";

/**
 * Re-applies the gitignored .env secrets (Ring credentials) to the deployed
 * Lambda after a cdk deploy, which resets the function environment to the
 * template's values. Secrets stay out of the repo and the CloudFormation
 * template on purpose. Run: node scripts/sync-lambda-env.mjs
 */

const region = "us-east-1";
const fn = execSync(
  `aws cloudformation describe-stack-resources --stack-name Nightlight --region ${region} --query "StackResources[?ResourceType=='AWS::Lambda::Function' && starts_with(LogicalResourceId, 'Backend')].PhysicalResourceId" --output text`,
)
  .toString()
  .trim()
  .split("\n")[0];

const cur = JSON.parse(
  execSync(`aws lambda get-function-configuration --region ${region} --function-name ${fn}`).toString(),
);
const vars = cur.Environment?.Variables ?? {};
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) vars[m[1]] = m[2];
}
fs.writeFileSync("lambda-env.json", JSON.stringify({ Variables: vars }));
execSync(
  `aws lambda update-function-configuration --region ${region} --function-name ${fn} --environment file://lambda-env.json`,
  { stdio: "pipe" },
);
fs.rmSync("lambda-env.json");
console.log(`Synced ${fn} environment keys: ${Object.keys(vars).join(", ")}`);
