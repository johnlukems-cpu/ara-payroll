/**
 * Safe arithmetic formula evaluator for FORMULA pay components (no eval, no property access).
 * Grammar: numbers, variables [A-Z][A-Z0-9_]*, + - * / parentheses, unary minus,
 * and functions MIN(a,b,…), MAX(a,b,…), ROUND(x). Variables are in major currency units.
 *
 * Available variables: BASE (monthly base salary), HOURLY_RATE, DAILY_RATE, QTY, plus the
 * amount of any component code calculated earlier in the same payslip (e.g. ALW001).
 */
export class FormulaError extends Error {}

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Invalid number at ${i}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    if ("+-*/(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new FormulaError(`Unexpected character "${c}"`);
  }
  if (out.length > 200) throw new FormulaError("Formula too long");
  return out;
}

const FUNCS: Record<string, (args: number[]) => number> = {
  MIN: (a) => Math.min(...a),
  MAX: (a) => Math.max(...a),
  ROUND: (a) => Math.round(a[0] * 100) / 100,
};

export function evaluateFormula(src: string, vars: Record<string, number>): number {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v?: string) => {
    const tk = tokens[pos++];
    if (!tk || (v !== undefined && tk.v !== v)) throw new FormulaError(`Expected "${v ?? "token"}"`);
    return tk;
  };
  const expr = (): number => {
    let v = term();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) v = eat().v === "+" ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/")) {
      if (eat().v === "*") v *= factor();
      else {
        const d = factor();
        if (d === 0) throw new FormulaError("Division by zero");
        v /= d;
      }
    }
    return v;
  };
  const factor = (): number => {
    const tk = peek();
    if (!tk) throw new FormulaError("Unexpected end of formula");
    if (tk.t === "op" && tk.v === "-") { eat(); return -factor(); }
    if (tk.t === "op" && tk.v === "(") { eat("("); const v = expr(); eat(")"); return v; }
    if (tk.t === "num") { eat(); return tk.v; }
    if (tk.t === "id") {
      eat();
      if (peek()?.t === "op" && peek().v === "(") {
        const fn = FUNCS[tk.v];
        if (!fn) throw new FormulaError(`Unknown function ${tk.v}`);
        eat("(");
        const args = [expr()];
        while (peek()?.v === ",") { eat(","); args.push(expr()); }
        eat(")");
        return fn(args);
      }
      if (!(tk.v in vars)) throw new FormulaError(`Unknown variable ${tk.v}`);
      return vars[tk.v];
    }
    throw new FormulaError(`Unexpected "${tk.v}"`);
  };
  const result = expr();
  if (pos !== tokens.length) throw new FormulaError("Unexpected input after expression");
  if (!Number.isFinite(result)) throw new FormulaError("Result is not a number");
  return result;
}

/** Variables referenced by a formula (used for dependency ordering and validation). */
export function formulaVariables(src: string): string[] {
  return [...new Set(tokenize(src).filter((t, i, a) => t.t === "id" && !(a[i + 1]?.t === "op" && a[i + 1].v === "(")).map((t) => t.v as string))];
}
