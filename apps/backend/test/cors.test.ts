import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

/**
 * Exactly one layer may answer with CORS headers.
 *
 * On Lambda the function URL reflects the request origin itself. If the
 * app also registers CORS middleware the response carries two
 * Access-Control-Allow-Origin headers, and every browser rejects that
 * outright even when the two values are identical.
 *
 * This is the only bug in this project that no command-line check can
 * see. curl does not enforce CORS, Fastify's inject helper does not
 * enforce CORS, and the deployed API returned a clean 200 with the header
 * duplicated while the caregiver app could not load its own data in any
 * browser. It was found by driving the deployed site with a real browser
 * and reading the console, which is the only place it is visible.
 *
 * The same defect had already been found and fixed in a sibling project
 * and was not carried across. These tests are that lesson, written down
 * where it will fail rather than in a document where it will not.
 */
describe("CORS is owned by exactly one layer", () => {
  const original = process.env.AWS_LAMBDA_FUNCTION_NAME;

  afterEach(() => {
    if (original === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = original;
  });

  it("emits no CORS header of its own on Lambda, where the function URL owns it", async () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = "nightlight-backend";
    const { app } = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/api/summary",
      headers: { origin: "https://d28hskpupjctiz.cloudfront.net" },
    });
    expect(res.statusCode).toBe(200);
    // A second value here is what the browser refuses. The function URL
    // adds its own, so this layer must add none.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("does emit one off Lambda, where nothing else will", async () => {
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    const { app } = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/api/summary",
      headers: { origin: "http://localhost:3000" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeDefined();
    await app.close();
  });

  it("never sends the header more than once in either environment", async () => {
    for (const onLambda of [true, false]) {
      if (onLambda) process.env.AWS_LAMBDA_FUNCTION_NAME = "nightlight-backend";
      else delete process.env.AWS_LAMBDA_FUNCTION_NAME;

      const { app } = buildServer();
      const res = await app.inject({
        method: "GET",
        url: "/api/summary",
        headers: { origin: "https://example.test" },
      });
      const value = res.headers["access-control-allow-origin"];
      // An array is how a duplicated header arrives, and it is the exact
      // shape that broke the deployed site.
      expect(Array.isArray(value)).toBe(false);
      await app.close();
    }
  });
});
