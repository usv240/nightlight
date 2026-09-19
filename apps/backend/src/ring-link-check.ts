import { computeLinkNonce, validateLinkNonce } from "./ring";

/**
 * The Ring account-link handshake, shown working.
 *
 * Why this exists
 * ---------------
 * The webhook proof answers "is this really Ring underneath". It does not
 * answer the question a family actually asks, which is "how do I connect
 * my own doorbell". That flow is built: the Token Exchange URL and the
 * Account Link URL are registered, live endpoints on this Lambda, and the
 * nonce Ring sends is validated exactly per spec. None of it was visible,
 * and an invisible flow is indistinguishable from an absent one.
 *
 * Ring binds an account link to a specific Ring account with an HMAC:
 * base64url(HMAC-SHA256(key, "timeMs:accountId")), inside a ten minute
 * window. Getting that wrong permissively means someone else's link
 * request can attach their doorbell to your household, which in this
 * product means a stranger's camera feeding a dementia alerting system.
 * So the two rejections below are the interesting ones, exactly as they
 * are in the webhook proof.
 *
 * What is real here, and what is not
 * ----------------------------------
 * Real: `computeLinkNonce` and `validateLinkNonce` are the production
 * functions, imported, not reimplemented. The window arithmetic, the
 * comparison and the reasons are whatever the deployed code does.
 *
 * Not real: the account id is a placeholder, and the key is the demo
 * signing key rather than the app's Ring signature key. The production
 * key never leaves the server and is never used to sign anything a
 * visitor can request. This demonstrates the algorithm, not custody of a
 * secret, and the page says so.
 */

export interface LinkCheck {
  /** Plain-language label for the row. Written for a viewer, not a log. */
  label: string;
  input: { accountId: string; ageSeconds: number; nonce: string };
  result: { valid: boolean; reason?: string };
  verdict: "accepted" | "rejected";
  /** One sentence a non-engineer can read off the screen. */
  explain: string;
}

export interface LinkCheckResult {
  checks: LinkCheck[];
  windowSeconds: number;
  demoKey: true;
  ms: number;
}

/** Short enough to read on screen, honest about being an excerpt. */
function shortNonce(nonce: string): string {
  return nonce.length > 22 ? `${nonce.slice(0, 12)}...${nonce.slice(-6)}` : nonce;
}

export function checkRingAccountLink(demoSecret: string, now = Date.now()): LinkCheckResult {
  const started = Date.now();
  const account = "amzn1.ring.account.EXAMPLE";
  const other = "amzn1.ring.account.SOMEONE-ELSE";

  // Ring's own request: a nonce computed for this account, moments ago.
  const freshTime = now - 5_000;
  const freshNonce = computeLinkNonce(freshTime, account, demoSecret);

  // The same request, replayed eleven minutes later. Ring's window is ten.
  const staleTime = now - 11 * 60_000;
  const staleNonce = computeLinkNonce(staleTime, account, demoSecret);

  const checks: LinkCheck[] = [
    {
      label: "Ring links this household's account",
      input: { accountId: account, ageSeconds: 5, nonce: shortNonce(freshNonce) },
      result: validateLinkNonce(freshNonce, freshTime, account, demoSecret, now),
      verdict: "accepted",
      explain:
        "The nonce matches this account and arrived inside the window, so the link proceeds and Nightlight exchanges Ring's code for tokens.",
    },
    {
      label: "The same link request, claimed for a different account",
      input: { accountId: other, ageSeconds: 5, nonce: shortNonce(freshNonce) },
      result: validateLinkNonce(freshNonce, freshTime, other, demoSecret, now),
      verdict: "rejected",
      explain:
        "The nonce is bound to the account it was issued for. Nobody can attach their doorbell to someone else's household by reusing a link request.",
    },
    {
      label: "A genuine link request replayed eleven minutes later",
      input: { accountId: account, ageSeconds: 11 * 60, nonce: shortNonce(staleNonce) },
      result: validateLinkNonce(staleNonce, staleTime, account, demoSecret, now),
      verdict: "rejected",
      explain:
        "Correctly signed and out of time. A link request captured today cannot be replayed tomorrow.",
    },
  ];

  // The verdicts above are what the production function returned. If one
  // of them ever disagrees with the label, the label is the thing that is
  // wrong, and saying so here is cheaper than shipping a panel that draws
  // three reassuring rows regardless of what the code did.
  for (const c of checks) {
    const expected = c.verdict === "accepted";
    if (c.result.valid !== expected) {
      throw new Error(
        `account-link check "${c.label}" expected valid=${expected} but the ` +
          `production validator returned valid=${c.result.valid}` +
          (c.result.reason ? ` (${c.result.reason})` : ""),
      );
    }
  }

  return { checks, windowSeconds: 600, demoKey: true, ms: Date.now() - started };
}
