# Google MCP Documentation Site

This directory contains the Angular documentation site for
`@pegasusheavy/google-mcp`. It is not the canonical project README.

For canonical package setup, Google OAuth configuration, MCP client usage,
service coverage, and tool reference, use the root [README.md](../README.md).

## Scope

- `docs/src/` owns the Angular documentation site.
- The root package owns the MCP server runtime in `src/`.
- The current server services are Calendar, Docs, Sheets, Slides, Drive,
  Gmail, Contacts/People, YouTube, Tasks, Forms, Chat, and Meet.

## Local Commands

Run these from this `docs/` directory:

```bash
pnpm install
pnpm start
pnpm build
pnpm test
```

## Canonicality Note

If an ecosystem doc scanner selects this nested README as the project-level
manual, treat that as a canonical-document selection caveat. This file only
documents the docs app; the root README owns the project-level MCP server
contract.
