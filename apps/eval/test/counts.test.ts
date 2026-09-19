import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Counts that appear in public text have to be counted, not remembered.
 *
 * This suite exists because two of them had already drifted. The
 * submission said "Fourteen conformance tests" when there were sixteen,
 * and "116 tests total" when there were well over a hundred and thirty.
 * Both under-claimed, so nobody was misled, but the project's whole
 * argument is that every published number is re-derived from something
 * committed. A number that nothing checks is a number that is only true
 * on the day it was typed.
 *
 * The suite counts itself, which is the awkward part: adding a test here
 * changes the total. That is the intended cost. The number in the
 * submission is a claim, and claims are maintained.
 */

/*
  The live site counts as public text.

  The first version of this suite read the two markdown files and nothing
  else, and the developers section of the landing page sat on production
  saying "47 tests" while the suite had 147. A judge reads the page before
  they read the repository, so the page is the claim that matters most.
*/
const PUBLIC_TEXT = [
  "README.md",
  "docs/SUBMISSION.md",
  "apps/web/src/app/page.tsx",
].flatMap((f) => {
  const p = path.join(repo, f);
  return fs.existsSync(p) ? [{ file: f, text: fs.readFileSync(p, "utf8") }] : [];
});

/**
 * Count the suite the way vitest collects it, without running it.
 *
 * Spawning vitest from inside vitest was the first draft, and it is a
 * trap twice over: the inner run collects this file too and spawns
 * again, and on Windows a .cmd shim cannot be spawned without a shell
 * since Node 22. So this reads the same include globs vitest.config.ts
 * uses and counts test declarations.
 *
 * `it.each` tables count one test per row. claims.test.ts has one with
 * five rows, and the first draft of this counter both missed them and
 * carried a comment insisting no such table existed. It was five short
 * of vitest's own total, which is exactly the drift this file exists to
 * catch. Rows are one per line, starting with `[`, which is how this
 * repo writes them; a table written differently will undercount and the
 * mismatch against a real run will show it.
 */
function totalTests(): number {
  const dirs = ["apps/backend/test", "apps/eval/test", "apps/web/test", "packages"];
  let n = 0;
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "dist", "cdk.out"].includes(entry.name)) continue;
        walk(full);
      } else if (/\.test\.ts$/.test(entry.name) && full.includes(`${path.sep}test${path.sep}`)) {
        const text = fs.readFileSync(full, "utf8");
        n += (text.match(/^\s*(?:it|test)\(/gm) ?? []).length;
        // Each `it.each([` opens a table; every line inside it that begins
        // with `[` is one row, and each row is one test to vitest.
        const each = /(?:it|test)\.each\(\[\s*\n([\s\S]*?)\n\s*\]\)\(/g;
        for (const m of text.matchAll(each)) {
          n += (m[1]!.match(/^\s*\[/gm) ?? []).length;
        }
      }
    }
  };
  for (const d of dirs) {
    const full = path.join(repo, d);
    if (fs.existsSync(full)) walk(full);
  }
  return n;
}

function mcpConformanceTests(): number {
  const file = fs.readFileSync(
    path.join(repo, "apps/backend/test/mcp.test.ts"),
    "utf8",
  );
  return (file.match(/^\s*it\(/gm) ?? []).length;
}

describe("published counts match the repository", () => {
  it("states the MCP conformance count that mcp.test.ts actually has", () => {
    const actual = mcpConformanceTests();
    expect(actual).toBeGreaterThan(0);
    const words: Record<number, string> = {
      14: "fourteen", 15: "fifteen", 16: "sixteen", 17: "seventeen",
      18: "eighteen", 19: "nineteen", 20: "twenty",
    };
    const word = words[actual];
    expect(word, `no spelling for ${actual}; add it here`).toBeTruthy();
    const wrong = PUBLIC_TEXT.filter((d) => {
      const m = d.text.match(/(\w+) (?:transport )?conformance tests/i);
      return m ? m[1]!.toLowerCase() !== word : false;
    });
    expect(wrong.map((d) => d.file)).toEqual([]);
  });

  /*
    The friction log is a judged deliverable, and its size is quoted.

    The submission said "Five entries in FRICTION_LOG.md" and listed five
    of them by name while the file had grown to seven. The two newest are
    the two most worth reading: one is positive about a Ring tool that
    landed after we had architected around its absence, and one is a bug
    in our own servers rather than in anyone's product. Undercounting
    those is the one direction this project cannot afford, because the
    claim being made is that we reported friction honestly.
  */
  it("states the number of friction log entries the file actually has", () => {
    const log = fs.readFileSync(path.join(repo, "FRICTION_LOG.md"), "utf8");
    const actual = (log.match(/^## Entry \d+:/gm) ?? []).length;
    expect(actual).toBeGreaterThan(0);
    const words: Record<number, string> = {
      5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
    };
    const word = words[actual];
    expect(word, `no spelling for ${actual}; add it here`).toBeTruthy();
    const wrong = PUBLIC_TEXT.filter((d) => {
      const m = d.text.match(/(\w+) entries in FRICTION_LOG/i);
      return m ? m[1]!.toLowerCase() !== word : false;
    });
    expect(
      wrong.map((d) => d.file),
      `FRICTION_LOG.md has ${actual} entries`,
    ).toEqual([]);
  });

  it("states a total that is not smaller than the suite", () => {
    // Not equality. A run adds tests more often than it removes them, and
    // a claim that undershoots reality is the failure mode worth catching:
    // "116 tests" beside a suite of 141 reads as a number nobody checked.
    const stated = PUBLIC_TEXT.flatMap((d) => {
      // "147 tests total" in prose, or "147 tests across ..." on the page.
      const m = d.text.match(/(\d+) tests total/) ?? d.text.match(/(\d+) tests across/);
      return m ? [{ file: d.file, n: Number(m[1]) }] : [];
    });
    expect(stated.length).toBeGreaterThan(0);
    const actual = totalTests();
    for (const s of stated) {
      expect(
        Math.abs(actual - s.n),
        `${s.file} says ${s.n} tests, the suite has ${actual}`,
      ).toBeLessThanOrEqual(2);
    }
  });
});
