import { describe, expect, it } from "vitest";
import { computeLinkNonce } from "../src/ring";
import { checkRingAccountLink } from "../src/ring-link-check";

/**
 * The account-link proof has to be a proof, not three reassuring rows.
 *
 * Same standard as the webhook proof: the two rejections are the reason
 * the panel is worth showing, so they are the ones tested hardest. A
 * permissive account-link check is not a cosmetic bug in this product; it
 * would let someone attach their own doorbell to another family's
 * household, which is a stranger's camera feeding a dementia alerting
 * system.
 */
describe("the Ring account-link proof", () => {
  const KEY = "test-signing-key";

  it("accepts a nonce bound to this account, inside the window", () => {
    const [ok] = checkRingAccountLink(KEY).checks;
    expect(ok!.verdict).toBe("accepted");
    expect(ok!.result.valid).toBe(true);
    expect(ok!.result.reason).toBeUndefined();
  });

  it("rejects the same nonce claimed for a different account", () => {
    // One call, then compare within it. The first draft called
    // checkRingAccountLink three times and compared nonces across the
    // results, which only agreed when all three landed in the same
    // millisecond: a test that passed by luck and failed by clock.
    const { checks } = checkRingAccountLink(KEY);
    const [genuine, wrongAccount] = checks;
    expect(wrongAccount!.result.valid).toBe(false);
    expect(wrongAccount!.result.reason).toBe("nonce mismatch");
    // It is the account that differs, not the nonce: that is what makes
    // this a stolen link request rather than a malformed one.
    expect(wrongAccount!.input.nonce).toBe(genuine!.input.nonce);
    expect(wrongAccount!.input.accountId).not.toBe(genuine!.input.accountId);
  });

  it("rejects a correctly signed request replayed outside the window", () => {
    const stale = checkRingAccountLink(KEY).checks[2]!;
    expect(stale.result.valid).toBe(false);
    expect(stale.result.reason).toBe("timestamp outside the 600 second window");
    expect(stale.input.ageSeconds).toBeGreaterThan(600);
  });

  it("throws rather than render a row that disagrees with the validator", () => {
    // The panel must never draw a verdict the production code did not
    // produce. An unusable clock makes the window arithmetic fail, so the
    // row labelled "accepted" comes back invalid, and that has to be loud
    // rather than quietly rendered as a green tick.
    //
    // The first draft of this test passed a broken key instead, which
    // threw inside crypto before the guard was ever reached: it asserted
    // that something failed, not that this guard works.
    expect(() => checkRingAccountLink(KEY, Number.NaN)).toThrow(/expected valid=true/);
  });

  it("reports the real ten minute window and that the key is the demo key", () => {
    const r = checkRingAccountLink(KEY);
    expect(r.windowSeconds).toBe(600);
    expect(r.demoKey).toBe(true);
  });

  it("uses the production nonce algorithm, not a copy of it", () => {
    // If ring.ts changed how a nonce is derived, this proof would still
    // pass while showing something the deployed link endpoint would not
    // accept. Recomputing it here catches that.
    const now = Date.now();
    const r = checkRingAccountLink(KEY, now);
    const expected = computeLinkNonce(now - 5_000, "amzn1.ring.account.EXAMPLE", KEY);
    expect(r.checks[0]!.input.nonce).toBe(`${expected.slice(0, 12)}...${expected.slice(-6)}`);
  });
});
