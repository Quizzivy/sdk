import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The catalogs in api/catalogs are agreements the server and the web each test
 * against the SDK version they pin (api/catalogs/README.md). These tests hold
 * the rules both sides used to check against each other's source, so a
 * catalog cannot be published in a shape either side would refuse.
 */

function catalog<T>(name: string): T {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../api/catalogs", name), "utf8"),
  ) as T;
}

describe("audit-actions.json", () => {
  const { actions } = catalog<{ actions: { key: string; vi: string; en: string }[] }>(
    "audit-actions.json",
  );
  const keys = actions.map((a) => a.key);

  it("lists every action once, in key order", () => {
    expect(keys.length).toBeGreaterThan(60);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The server's own rule (audit/domain/tests/scan_test.go actionShape).
  it("names each action noun.verb", () => {
    for (const key of keys) expect(key, key).toMatch(/^[a-z][a-z_]*(\.[a-z][a-z_]*){1,2}$/);
  });

  it("words each action once per language, without a full stop or spaces around it", () => {
    for (const action of actions) {
      expect(Object.keys(action).sort(), action.key).toEqual(["en", "key", "vi"]);
      for (const sentence of [action.vi, action.en]) {
        expect(sentence, action.key).not.toBe("");
        expect(sentence, action.key).toBe(sentence.trim());
        expect(sentence.endsWith("."), action.key).toBe(false);
      }
    }
  });
});

describe("join-code.json (§6.1)", () => {
  const code = catalog<{
    alphabet: string;
    length: number;
    hintLength: number;
    groupSize: number;
    separator: string;
  }>("join-code.json");

  it("has 32 distinct characters, so the server picks each one with a 5-bit mask", () => {
    expect(code.alphabet).toHaveLength(32);
    expect(new Set(code.alphabet).size).toBe(32);
    expect(code.alphabet).toBe(code.alphabet.toUpperCase());
  });

  it("leaves out the characters that read as each other", () => {
    for (const ch of "0O1I") expect(code.alphabet).not.toContain(ch);
    expect(code.alphabet).toContain("L");
  });

  it("groups a code into equal halves around the separator, and hints at its tail", () => {
    expect(code.length % code.groupSize).toBe(0);
    expect(code.hintLength).toBeLessThan(code.length);
    expect(code.alphabet).not.toContain(code.separator);
  });
});
