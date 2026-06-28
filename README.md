# WIQL for Visual Studio Code

Language support for Azure DevOps Work Item Query Language files.

## Features

- Syntax highlighting for `.wiql` files.
- Basic document formatting.
- Syntax diagnostics for unbalanced brackets and invalid clause ordering.
- Keyword, macro, field, and operator completions.

The initial language rules are based on the Microsoft Learn WIQL syntax
reference for Azure Boards.

## Development

Install dependencies and compile the extension:

```bash
npm install
npm run compile
```

Run the unit tests:

```bash
npm test
```

Package the extension as a VSIX:

```bash
npm run package:vsix
```

Inspect the files that will be included in the VSIX:

```bash
npm run list:vsix
```

Install the local pre-commit hooks for TruffleHog and Semgrep scans:

```bash
pre-commit install
```

The pre-commit hooks use local `trufflehog` and `semgrep` executables. Ensure
both commands are available on your `PATH` before running the hooks.

## Scope

This extension currently provides offline WIQL language features. Azure DevOps
metadata-backed completions for project-specific fields and allowed values are a
future integration point.

This artifact was produced with AI assistance and should be reviewed by a
qualified professional before use as compliance evidence, legal submission, or
external distribution.
