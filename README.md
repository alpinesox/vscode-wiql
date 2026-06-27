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

## Scope

This extension currently provides offline WIQL language features. Azure DevOps
metadata-backed completions for project-specific fields and allowed values are a
future integration point.

This artifact was produced with AI assistance and should be reviewed by a
qualified professional before use as compliance evidence, legal submission, or
external distribution.
