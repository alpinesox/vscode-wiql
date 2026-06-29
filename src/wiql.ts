export type TokenKind = "keyword" | "identifier" | "field" | "string" | "number" | "operator" | "symbol";

export interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

export interface Clause {
  kind: ClauseKind;
  tokens: Token[];
  start: number;
  end: number;
}

export interface ParseResult {
  clauses: Clause[];
  diagnostics: WiqlDiagnostic[];
}

export interface WiqlDiagnostic {
  message: string;
  start: number;
  end: number;
  severity: "error" | "warning";
}

export type ClauseKind = "SELECT" | "FROM" | "WHERE" | "GROUP BY" | "ORDER BY" | "ASOF" | "MODE";

const MAX_QUERY_LENGTH = 32_768;
const MAX_DIAGNOSTICS = 200;

const KEYWORDS = new Set([
  "AND",
  "ASOF",
  "ASC",
  "BY",
  "CONTAINS",
  "DESC",
  "DOES",
  "EMPTY",
  "EVER",
  "FROM",
  "GROUP",
  "IN",
  "IS",
  "MODE",
  "NOT",
  "ON",
  "OR",
  "ORDER",
  "SELECT",
  "UNDER",
  "WAS",
  "WHERE",
  "WORDS"
]);

const CLAUSE_ORDER: ClauseKind[] = ["SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "ASOF", "MODE"];

const FIELD_COMPLETIONS = [
  "[System.Id]",
  "[System.Title]",
  "[System.WorkItemType]",
  "[System.State]",
  "[System.AssignedTo]",
  "[System.CreatedDate]",
  "[System.ChangedDate]",
  "[System.TeamProject]",
  "[System.AreaPath]",
  "[System.IterationPath]",
  "[System.Tags]",
  "[Microsoft.VSTS.Common.Priority]",
  "[Microsoft.VSTS.Common.Severity]"
];

export const COMPLETION_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "ORDER BY",
  "GROUP BY",
  "ASOF",
  "MODE (MustContain)",
  "MODE (MayContain)",
  "MODE (DoesNotContain)",
  "MODE (Recursive)",
  "AND",
  "OR",
  "NOT",
  "IN",
  "NOT IN",
  "IN GROUP",
  "NOT IN GROUP",
  "UNDER",
  "NOT UNDER",
  "CONTAINS",
  "NOT CONTAINS",
  "CONTAINS WORDS",
  "NOT CONTAINS WORDS",
  "EVER",
  "WAS EVER",
  "WAS EVER IN",
  "WAS NOT EVER",
  "WAS NOT EVER IN",
  "IS EMPTY",
  "IS NOT EMPTY",
  "ASC",
  "DESC"
];

export const COMPLETION_MACROS = ["@Me", "@Project", "@CurrentIteration", "@Today", "@StartOfDay", "@StartOfWeek", "@StartOfMonth", "@StartOfYear", "[Any]"];
export const COMPLETION_FIELDS = FIELD_COMPLETIONS;
export const COMPLETION_OPERATORS = ["=", "<>", "<", ">", "<=", ">=", "IN", "NOT IN", "IN GROUP", "NOT IN GROUP", "CONTAINS", "NOT CONTAINS", "CONTAINS WORDS", "NOT CONTAINS WORDS", "UNDER", "NOT UNDER", "WAS EVER", "EVER", "IS EMPTY", "IS NOT EMPTY"];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const c = input[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const start = i++;
      while (i < input.length) {
        if (input[i] === "\\") {
          i += 2;
          continue;
        }
        if (input[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: "string", value: input.slice(start, i), start, end: i });
      continue;
    }

    const field = readField(input, i);
    if (field) {
      tokens.push(field);
      i = field.end;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (["<=", ">=", "<>"].includes(two)) {
      tokens.push({ kind: "operator", value: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }

    if (["=", "<", ">"].includes(c)) {
      tokens.push({ kind: "operator", value: c, start: i, end: i + 1 });
      i++;
      continue;
    }

    if (["(", ")", "[", "]", ","].includes(c)) {
      tokens.push({ kind: "symbol", value: c, start: i, end: i + 1 });
      i++;
      continue;
    }

    if (/\d/.test(c)) {
      const start = i++;
      while (i < input.length && /[\d.]/.test(input[i])) i++;
      tokens.push({ kind: "number", value: input.slice(start, i), start, end: i });
      continue;
    }

    if (/[A-Za-z_@]/.test(c)) {
      const start = i++;
      while (i < input.length && /[A-Za-z0-9_.@-]/.test(input[i])) i++;
      const raw = input.slice(start, i);
      const upper = raw.toUpperCase();
      tokens.push({ kind: KEYWORDS.has(upper) ? "keyword" : "identifier", value: KEYWORDS.has(upper) ? upper : raw, start, end: i });
      continue;
    }

    tokens.push({ kind: "symbol", value: c, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

function readField(input: string, start: number): Token | undefined {
  const source = input.slice(start);
  const prefixed = source.match(/^(?:(?:\[(?:Source|Target)\])|(?:Source|Target))\s*\.\s*\[[^\]\r\n]*\]/i);
  if (prefixed) {
    return { kind: "field", value: prefixed[0].replace(/\s+/g, ""), start, end: start + prefixed[0].length };
  }

  const field = source.match(/^\[[^\]\r\n]*\]/);
  if (field) {
    return { kind: "field", value: field[0], start, end: start + field[0].length };
  }

  return undefined;
}

export function parseWiql(input: string): ParseResult {
  const diagnostics: WiqlDiagnostic[] = [];
  const clauses: Clause[] = [];
  const bracketStack: Token[] = [];

  if (input.length > MAX_QUERY_LENGTH) {
    addDiagnostic(diagnostics, {
      message: "WIQL queries must not exceed 32K characters.",
      start: MAX_QUERY_LENGTH,
      end: input.length,
      severity: "error"
    });
    return { clauses, diagnostics };
  }

  const tokens = tokenize(input);

  for (const token of tokens) {
    if (token.value === "(" || token.value === "[") bracketStack.push(token);
    if (token.value === "]") {
      const open = bracketStack.pop();
      if (!open || open.value !== "[") addDiagnostic(diagnostics, { message: "Unmatched closing field bracket.", start: token.start, end: token.end, severity: "error" });
    }
    if (token.value === ")") {
      const open = bracketStack.pop();
      if (!open || open.value !== "(") addDiagnostic(diagnostics, { message: "Unmatched closing parenthesis.", start: token.start, end: token.end, severity: "error" });
    }
  }

  for (const open of bracketStack.filter((token) => token.value === "(")) {
    addDiagnostic(diagnostics, { message: "Unmatched opening parenthesis.", start: open.start, end: open.end, severity: "error" });
  }

  for (const open of bracketStack.filter((token) => token.value === "[")) {
    addDiagnostic(diagnostics, { message: "Unmatched opening field bracket.", start: open.start, end: open.end, severity: "error" });
  }

  let i = 0;
  while (i < tokens.length) {
    const clause = readClause(tokens, i);
    if (!clause) {
      i++;
      continue;
    }
    clauses.push(clause.clause);
    i = clause.next;
  }

  validateClauseOrder(clauses, diagnostics);
  validateClauseSemantics(clauses, diagnostics);
  return { clauses, diagnostics };
}

export function formatWiql(input: string): string {
  if (hasComment(input)) return input;
  const { clauses, diagnostics } = parseWiql(input);
  if (diagnostics.length > 0) return input;
  if (!clausesCoverInput(input, clauses)) return input;
  if (clauses.length === 0) return input.trim();
  return clauses.map(formatClause).join("\n").trimEnd() + "\n";
}

function addDiagnostic(diagnostics: WiqlDiagnostic[], diagnostic: WiqlDiagnostic): void {
  if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic);
}

function hasComment(input: string): boolean {
  let quote: string | undefined;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) quote = undefined;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if ((c === "-" && input[i + 1] === "-") || (c === "/" && input[i + 1] === "/")) return true;
    if (c === "/" && input[i + 1] === "*") return true;
  }
  return false;
}

function clausesCoverInput(input: string, clauses: Clause[]): boolean {
  if (clauses.length === 0) return true;
  return input.slice(0, clauses[0].start).trim().length === 0;
}

function readClause(tokens: Token[], startIndex: number): { clause: Clause; next: number } | undefined {
  const kind = clauseKindAt(tokens, startIndex);
  if (!kind) return undefined;

  const startToken = tokens[startIndex];
  let bodyStart = startIndex + (kind.includes(" ") ? 2 : 1);
  let next = bodyStart;

  while (next < tokens.length && !clauseKindAt(tokens, next)) next++;

  if (bodyStart > tokens.length) bodyStart = tokens.length;
  const body = tokens.slice(bodyStart, next);
  const end = body.at(-1)?.end ?? startToken.end;

  return {
    clause: {
      kind,
      tokens: body,
      start: startToken.start,
      end
    },
    next
  };
}

function clauseKindAt(tokens: Token[], index: number): ClauseKind | undefined {
  const token = tokens[index];
  const next = tokens[index + 1];
  if (!token || token.kind !== "keyword") return undefined;
  if (token.value === "ORDER" && next?.kind === "keyword" && next.value === "BY") return "ORDER BY";
  if (token.value === "GROUP" && next?.kind === "keyword" && next.value === "BY") return "GROUP BY";
  if (["SELECT", "FROM", "WHERE", "ASOF", "MODE"].includes(token.value)) return token.value as ClauseKind;
  return undefined;
}

function validateClauseOrder(clauses: Clause[], diagnostics: WiqlDiagnostic[]): void {
  let highestSeen = -1;
  for (const clause of clauses) {
    const order = CLAUSE_ORDER.indexOf(clause.kind);
    if (order < highestSeen) {
      addDiagnostic(diagnostics, {
        message: `${clause.kind} appears out of the expected WIQL clause order.`,
        start: clause.start,
        end: clause.end,
        severity: "warning"
      });
    }
    highestSeen = Math.max(highestSeen, order);
  }
}

function validateClauseSemantics(clauses: Clause[], diagnostics: WiqlDiagnostic[]): void {
  const from = clauses.find((clause) => clause.kind === "FROM");
  const mode = clauses.find((clause) => clause.kind === "MODE");
  const orderBy = clauses.find((clause) => clause.kind === "ORDER BY");
  const asof = clauses.find((clause) => clause.kind === "ASOF");
  const fromTarget = from ? tokensToText(from.tokens).toLowerCase() : undefined;
  const modeValue = mode ? tokensToText(mode.tokens).replace(/[()]/g, "").trim().toLowerCase() : undefined;

  if (from && fromTarget !== "workitems" && fromTarget !== "workitemlinks") {
    addDiagnostic(diagnostics, {
      message: "FROM should specify WorkItems or WorkItemLinks.",
      start: from.start,
      end: from.end,
      severity: "warning"
    });
  }

  if (mode && fromTarget !== "workitemlinks") {
    addDiagnostic(diagnostics, {
      message: "MODE is only valid with FROM WorkItemLinks queries.",
      start: mode.start,
      end: mode.end,
      severity: "warning"
    });
  }

  if (mode && modeValue && !["mustcontain", "maycontain", "doesnotcontain", "recursive"].includes(modeValue)) {
    addDiagnostic(diagnostics, {
      message: "MODE should be MustContain, MayContain, DoesNotContain, or Recursive.",
      start: mode.start,
      end: mode.end,
      severity: "warning"
    });
  }

  if (modeValue === "recursive" && orderBy) {
    addDiagnostic(diagnostics, {
      message: "ORDER BY is not compatible with recursive tree queries.",
      start: orderBy.start,
      end: orderBy.end,
      severity: "warning"
    });
  }

  if (modeValue === "recursive" && asof) {
    addDiagnostic(diagnostics, {
      message: "ASOF is not compatible with recursive tree queries.",
      start: asof.start,
      end: asof.end,
      severity: "warning"
    });
  }
}

function formatClause(clause: Clause): string {
  const body = tokensToText(clause.tokens);
  switch (clause.kind) {
    case "SELECT":
      return formatListClause("SELECT", body);
    case "GROUP BY":
      return formatListClause("GROUP BY", body);
    case "WHERE":
      return formatWhere(clause.tokens);
    default:
      return body ? `${clause.kind} ${body}` : clause.kind;
  }
}

function formatListClause(label: string, body: string): string {
  const items = body.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (items.length <= 1) return `${label} ${items[0] ?? ""}`.trimEnd();
  return `${label}\n${items.map((item, index) => `    ${item}${index === items.length - 1 ? "" : ","}`).join("\n")}`;
}

function formatWhere(tokens: Token[]): string {
  const lines = splitLogicalExpressions(tokens)
    .map((line) => `    ${line}`)
    .filter((line) => line.trim().length > 0);
  return `WHERE\n${lines.join("\n")}`;
}

function splitLogicalExpressions(tokens: Token[]): string[] {
  const lines: string[] = [];
  let current: Token[] = [];
  let depth = 0;

  for (const token of tokens) {
    if (token.value === "(") depth++;
    if (token.value === ")") depth = Math.max(0, depth - 1);

    if (depth === 0 && token.kind === "keyword" && (token.value === "AND" || token.value === "OR")) {
      const previous = tokensToText(current);
      if (previous) lines.push(previous);
      current = [token];
    } else {
      current.push(token);
    }
  }

  const finalLine = tokensToText(current);
  if (finalLine) lines.push(finalLine);
  return lines;
}

function tokensToText(tokens: Token[]): string {
  let output = "";
  for (const token of tokens) {
    if (token.value === ",") {
      output = output.trimEnd() + ", ";
    } else if (token.value === "(") {
      output = output.trimEnd() + " (";
    } else if (token.value === ")") {
      output = output.trimEnd() + ")";
    } else if (token.kind === "operator") {
      output = `${output.trimEnd()} ${token.value} `;
    } else {
      output += `${needsSpace(output) ? " " : ""}${token.value}`;
    }
  }
  return output.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

function needsSpace(output: string): boolean {
  return output.length > 0 && !/[\s(]$/.test(output);
}
