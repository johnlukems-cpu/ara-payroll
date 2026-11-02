import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const EN = flatten(en as Tree);
const NL = flatten(nl as Tree);

/** Top-level ICU argument names, e.g. "{count, plural, ...}" → count. */
function placeholders(msg: string) {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < msg.length; i++) {
    if (msg[i] === "{") {
      if (depth === 0) {
        const m = /^\{\s*([a-zA-Z_][\w]*)/.exec(msg.slice(i));
        if (m) names.add(m[1]);
      }
      depth++;
    } else if (msg[i] === "}") depth--;
  }
  return [...names].sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("translations", () => {
  it("Dutch and English define exactly the same keys", () => {
    expect(Object.keys(NL).sort()).toEqual(Object.keys(EN).sort());
  });

  it("use the same placeholders in both languages", () => {
    const mismatches = Object.keys(EN).filter((k) => JSON.stringify(placeholders(EN[k])) !== JSON.stringify(placeholders(NL[k] ?? "")));
    expect(mismatches).toEqual([]);
  });

  it("have no empty messages", () => {
    expect(Object.entries({ ...EN, ...NL }).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it("every translation key used in the source exists", () => {
    const missing = new Set<string>();
    const dynamicPrefixes = new Set<string>();
    for (const file of sourceFiles(path.resolve(__dirname, "../../src"))) {
      const src = readFileSync(file, "utf8");
      // t("a.b") / t('a.b') and translation keys passed as error identifiers / zod messages
      for (const m of src.matchAll(/\bt\(\s*["']([a-zA-Z][\w.-]*)["']/g)) if (!(m[1] in EN)) missing.add(`${m[1]}  (${path.basename(file)})`);
      for (const m of src.matchAll(/(?:UserError|PayrollError|AuthError)\(\s*["']([a-zA-Z][\w.-]*)["']/g)) if (!(m[1] in EN)) missing.add(`${m[1]}  (${path.basename(file)})`);
      for (const m of src.matchAll(/["'](validation\.[a-zA-Z]+)["']/g)) if (!(m[1] in EN)) missing.add(`${m[1]}  (${path.basename(file)})`);
      // t(`prefix.${x}`) — the prefix must exist as a namespace
      for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z][\w.-]*)\.\$\{/g)) dynamicPrefixes.add(m[1]);
    }
    expect([...missing]).toEqual([]);
    const badPrefixes = [...dynamicPrefixes].filter((p) => !Object.keys(EN).some((k) => k.startsWith(`${p}.`)));
    expect(badPrefixes).toEqual([]);
  });
});
