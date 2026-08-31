# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-31

### Breaking

- `DriveService.downloadFile` returns a `DriveDownloadResult` record
  (`{ name, mimeType, size, content?, encoding?, path? }`) instead of a bare
  string. A caller that wrote the old return value straight to disk was
  getting `"[object Object]"` after this change, hence the major bump.

  ```ts
  // before
  const text = await drive.downloadFile(id);
  // after
  const { content } = await drive.downloadFile(id);
  ```

- `DriveService.uploadFile` takes one options object instead of four
  positional arguments.

  ```ts
  // before
  await drive.uploadFile("notes.txt", "hello", "text/plain", folderId);
  // after
  await drive.uploadFile({ name: "notes.txt", content: "hello", mimeType: "text/plain", folderId });
  ```

- `DriveService.updateFile`'s second argument is a file source, not a string.

  ```ts
  // before
  await drive.updateFile(fileId, "new contents", "text/plain");
  // after
  await drive.updateFile(fileId, { content: "new contents", mimeType: "text/plain" });
  ```

- `drive_download_file` always returns a JSON record now, where it previously
  returned bare file text. The record says whether `content` is text or
  base64, which the old shape could not.

### Added

- Gmail attachments: `gmail_send` and `gmail_reply` accept an `attachments`
  array, messages returned by `gmail_get_message` carry an `attachments`
  array, and `gmail_get_attachment` downloads one.
- Drive binary transfer: `drive_download_file` gains `encoding`, `savePath`
  and `exportMimeType` (export a Doc as PDF or DOCX); `drive_upload_file`
  gains `path` and `encoding`.
- `drive_update_file` exposes the previously unreachable `updateFile` method.
- A sandbox root for all local file access, `GOOGLE_MCP_FILE_ROOT`, defaulting
  to `~/Downloads/google-mcp`. See "Local Files" in the README.

### Fixed

- Drive downloads and uploads no longer corrupt binary files. Both directions
  went over a UTF-8 text channel, which replaced every invalid byte.
- Request timeouts on the binary transfer paths, so a stalled socket fails
  instead of hanging the tool call forever.
- `pnpm lint` no longer fails outright after `pnpm test:coverage`: the flat
  config ignored `dist/` but not `coverage/`, and the type-aware parser errors
  on a file outside the tsconfig project rather than skipping it.

## [1.2.0] - 2026-08-31

### Added

- **`GmailMessage.bodyHtml`**: `gmail_get_message` and `gmail_get_thread` now
  return the message's `text/html` part alongside the plain-text `body`. List
  and search results carry no HTML in either field - one full HTML document per
  result would put megabytes of newsletter markup in a single response - so use
  `snippet` there, or fetch the message.

### Fixed

- **Email bodies nested more than one level deep came back empty.** Any mail
  with an attachment arrives as `multipart/mixed > multipart/alternative >
  text/html`; the old scan looked only at the top-level parts, matched the
  container, and found no body on it. Where it did match, it always returned
  the plain-text alternative and discarded the HTML.
- **A whitespace-only plain-text alternative no longer masks the HTML body.**
  The common newsletter shape - an empty `text/plain` beside the real
  `text/html` - previously returned the whitespace as the body.
- **Bodies split across sibling text parts are no longer truncated.** Mail
  prefixed with an external-sender banner, or split around an inline image,
  returned only the first segment; all `text/plain` segments are now joined.
- Single-part messages with a `text/*` type other than `text/plain` or
  `text/html` (`text/calendar` invites, `text/enriched`) return their content
  instead of an empty body.
- Attachments and forwarded `message/rfc822` payloads no longer supply the
  body, so an attached email's content cannot surface as the outer message's.
  Containers are still walked, so a body part is never lost with them.
- MIME types are matched case-insensitively (RFC 2045 5.1) everywhere,
  including the forwarded-message check.
- **Header injection in `gmail_send` and `gmail_reply`.** `To`, `Subject`,
  `Cc` and `Bcc` were interpolated into a raw RFC 822 message without stripping
  CR/LF. Since `gmail_reply` takes its subject from the message being replied
  to, an inbound mail with `Subject: Hi\r\nBcc: attacker@evil.com` would
  silently blind-copy the reply to the attacker.

### Changed

- **`GmailMessage.body` may now contain HTML.** For mail with no usable
  plain-text part it falls back to the HTML body, where it previously returned
  `""`. Callers that treated an empty `body` as "no content available" should
  read `bodyHtml` to tell the two apart: if `bodyHtml` is set and equal to
  `body`, the body is markup, not plain text. This does not apply to list and
  search results, which never return HTML.
- Gmail tool results are now prefixed with a notice marking the email content
  as untrusted sender-authored data, since HTML bodies can hide text aimed at
  a reading model.

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
