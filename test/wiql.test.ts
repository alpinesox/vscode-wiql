import { describe, expect, it } from "vitest";
import { formatWiql, parseWiql, tokenize } from "../src/wiql";

describe("WIQL language core", () => {
  it("tokenizes keywords and fields", () => {
    const tokens = tokenize("select [System.Id] from workitems");
    expect(tokens.map((token) => token.value)).toEqual(["SELECT", "[System.Id]", "FROM", "workitems"]);
  });

  it("formats common WIQL clauses", () => {
    expect(formatWiql("select [System.Id],[System.Title] from workitems where [System.State]='Active' and [System.AssignedTo]=@Me")).toBe(
      "SELECT\n    [System.Id],\n    [System.Title]\nFROM workitems\nWHERE\n    [System.State] = 'Active'\n    AND [System.AssignedTo] = @Me\n"
    );
  });

  it("does not format queries with comments", () => {
    const query = "SELECT [System.Id] FROM WorkItems -- keep this comment";
    expect(formatWiql(query)).toBe(query);
  });

  it("does not format queries with slash or block comments", () => {
    const slashComment = "SELECT [System.Id] FROM WorkItems // keep this comment";
    const blockComment = "/* keep */ SELECT [System.Id] FROM WorkItems";
    expect(formatWiql(slashComment)).toBe(slashComment);
    expect(formatWiql(blockComment)).toBe(blockComment);
  });

  it("formats comment-like text inside strings", () => {
    expect(formatWiql("SELECT [System.Id] FROM WorkItems WHERE [System.Title] = 'http://example'")).toBe(
      "SELECT [System.Id]\nFROM WorkItems\nWHERE\n    [System.Title] = 'http://example'\n"
    );
    expect(formatWiql("SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '-- not a comment'")).toBe(
      "SELECT [System.Id]\nFROM WorkItems\nWHERE\n    [System.Title] = '-- not a comment'\n"
    );
    expect(formatWiql("SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '/* not a comment */'")).toBe(
      "SELECT [System.Id]\nFROM WorkItems\nWHERE\n    [System.Title] = '/* not a comment */'\n"
    );
  });

  it("does not format queries with unsupported leading tokens", () => {
    const query = "garbage SELECT [System.Id] FROM WorkItems";
    expect(formatWiql(query)).toBe(query);
  });

  it("does not format queries with syntax diagnostics", () => {
    const query = "SELECT [System.Id FROM WorkItems";
    expect(formatWiql(query)).toBe(query);
  });

  it("reports unmatched parentheses", () => {
    const result = parseWiql("select [System.Id] from workitems where ([System.State] = 'Active'");
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes("Unmatched opening parenthesis"))).toBe(true);
  });

  it("caps diagnostics", () => {
    const result = parseWiql("(".repeat(10_000));
    expect(result.diagnostics).toHaveLength(200);
  });

  it("returns early for oversized inputs", () => {
    const result = parseWiql("SELECT [System.Id] FROM WorkItems\n" + " ".repeat(32_768));
    expect(result.clauses).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toBe("WIQL queries must not exceed 32K characters.");
  });

  it("reports unmatched field brackets", () => {
    const result = parseWiql("SELECT [System.Id FROM WorkItems");
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain("Unmatched opening field bracket.");
  });

  it("parses Microsoft Learn flat query clauses", () => {
    const result = parseWiql(`
      SELECT [System.Id], [System.AssignedTo], [System.State], [System.Title], [System.Tags]
      FROM workitems
      WHERE [System.TeamProject] = 'Design Agile'
        AND [System.WorkItemType] = 'User Story'
        AND [System.State] = 'Active'
      ORDER BY [System.ChangedDate] DESC
      ASOF '02-11-2025'
    `);

    expect(result.clauses.map((clause) => clause.kind)).toEqual(["SELECT", "FROM", "WHERE", "ORDER BY", "ASOF"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("supports link query source and target field syntax with mode", () => {
    const result = parseWiql(`
      SELECT [System.Id], [System.Title]
      FROM workItemLinks
      WHERE ([Source].[System.TeamProject] = @project)
        AND ([System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward')
        AND ([Target].[System.WorkItemType] <> '')
      MODE (Recursive)
    `);

    expect(result.clauses.map((clause) => clause.kind)).toEqual(["SELECT", "FROM", "WHERE", "MODE"]);
    expect(tokenize("[Source].[System.TeamProject] Source.[System.Id] Target.[System.State]").map((token) => token.value)).toEqual([
      "[Source].[System.TeamProject]",
      "Source.[System.Id]",
      "Target.[System.State]"
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("reports invalid recursive tree query clauses", () => {
    const result = parseWiql(`
      SELECT [System.Id]
      FROM workItemLinks
      WHERE [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'
      ORDER BY [System.Id]
      ASOF '2025-01-01T00:00:00Z'
      MODE (Recursive)
    `);

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain("ORDER BY is not compatible with recursive tree queries.");
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain("ASOF is not compatible with recursive tree queries.");
  });

  it("reports MODE outside WorkItemLinks queries", () => {
    const result = parseWiql("SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active' MODE (MustContain)");
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain("MODE is only valid with FROM WorkItemLinks queries.");
  });
});
