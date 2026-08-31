# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-31

### Added

- **SSE transport**: the server now serves over Server-Sent Events as a
  long-lived pooled worker (`GET /sse`, `POST /messages`), so multiple MCP
  clients share one authenticated Google session instead of each spawning a
  subprocess and running its own OAuth flow.
- **Contacts**: `contacts_add_to_group`, `contacts_get_group`,
  `contacts_create_group`, `contacts_delete_group`, and `contacts_update`
  tools. Contact responses now include group memberships.
- **Calendar**: `meetLink` parameter on `calendar_create_event` to attach a
  Google Meet conference; `colorId` support on event create and update.

### Fixed

- `contacts_update` no longer silently ignores an empty `familyName`, so a
  family name can actually be cleared.

### Changed

- `StdioServerTransport` was removed in favour of the SSE transport above.
  Clients configured to spawn this server over stdio must be repointed at the
  SSE endpoint.
- README and documentation-site client-configuration examples now document the
  SSE `url` form and the `GOOGLE_MCP_PORT` / `GOOGLE_MCP_HOST` overrides
  instead of the stdio `command`/`args` form, which stopped working when stdio
  was removed.
- Project identity re-scoped from Pegasus Heavy Industries to Joseph R. Quinn,
  including the LICENSE copyright holder.
- Credentials, token files, and `unsaved-contacts.json` are no longer tracked;
  the `find-unsaved-contacts` script moved out to a personal tooling repo.

## [1.0.2] - 2025-12-21

### Fixed

- OAuth callback now scans ports 3000–3100 for a free one instead of failing
  when 3000 is already in use.

## [1.0.1] - 2025-12-21

### Added

- Google Forms, Chat, and Meet services.
- Documentation website.

### Fixed

- Missing or expired tokens now auto-launch the OAuth flow rather than erroring.

## [1.0.0]

- Initial release: Google Workspace MCP server with 70+ tools across Calendar,
  Gmail, Drive, Docs, Sheets, Slides, Contacts, Tasks, and YouTube.

[1.1.0]: https://github.com/quinnjr/google-mcp/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/quinnjr/google-mcp/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/quinnjr/google-mcp/releases/tag/v1.0.1
