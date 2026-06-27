import * as vscode from "vscode";
import {
  COMPLETION_FIELDS,
  COMPLETION_KEYWORDS,
  COMPLETION_MACROS,
  COMPLETION_OPERATORS,
  formatWiql,
  parseWiql
} from "./wiql";

const WIQL_SELECTOR: vscode.DocumentSelector = { language: "wiql", scheme: "file" };

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("wiql");
  context.subscriptions.push(diagnostics);

  const refreshDiagnostics = (document: vscode.TextDocument) => {
    if (document.languageId !== "wiql") return;
    diagnostics.set(document.uri, toVscodeDiagnostics(document));
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(WIQL_SELECTOR, {
      provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        return [vscode.TextEdit.replace(fullRange, formatWiql(document.getText()))];
      }
    }),
    vscode.languages.registerCompletionItemProvider(WIQL_SELECTOR, {
      provideCompletionItems(): vscode.CompletionItem[] {
        return [
          ...COMPLETION_KEYWORDS.map((value) => completion(value, vscode.CompletionItemKind.Keyword)),
          ...COMPLETION_MACROS.map((value) => completion(value, vscode.CompletionItemKind.Variable)),
          ...COMPLETION_FIELDS.map((value) => completion(value, vscode.CompletionItemKind.Field)),
          ...COMPLETION_OPERATORS.map((value) => completion(value, vscode.CompletionItemKind.Operator))
        ];
      }
    }),
    vscode.workspace.onDidOpenTextDocument(refreshDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) => refreshDiagnostics(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri))
  );

  for (const document of vscode.workspace.textDocuments) refreshDiagnostics(document);
}

export function deactivate(): void {
}

function completion(value: string, kind: vscode.CompletionItemKind): vscode.CompletionItem {
  const item = new vscode.CompletionItem(value, kind);
  item.insertText = value;
  return item;
}

function toVscodeDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
  return parseWiql(document.getText()).diagnostics.map((diagnostic) => {
    const range = new vscode.Range(document.positionAt(diagnostic.start), document.positionAt(diagnostic.end));
    return new vscode.Diagnostic(
      range,
      diagnostic.message,
      diagnostic.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
    );
  });
}
