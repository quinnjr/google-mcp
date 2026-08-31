import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Auth } from "googleapis";

const mockGetProfile = vi.fn();
const mockLabelsList = vi.fn();
const mockLabelsGet = vi.fn();
const mockMessagesList = vi.fn();
const mockMessagesGet = vi.fn();
const mockMessagesSend = vi.fn();
const mockMessagesTrash = vi.fn();
const mockMessagesUntrash = vi.fn();
const mockMessagesDelete = vi.fn();
const mockMessagesModify = vi.fn();
const mockThreadsList = vi.fn();
const mockThreadsGet = vi.fn();
const mockThreadsTrash = vi.fn();
const mockAttachmentsGet = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    gmail: () => ({
      users: {
        getProfile: mockGetProfile,
        labels: {
          list: mockLabelsList,
          get: mockLabelsGet,
        },
        messages: {
          list: mockMessagesList,
          get: mockMessagesGet,
          send: mockMessagesSend,
          trash: mockMessagesTrash,
          untrash: mockMessagesUntrash,
          delete: mockMessagesDelete,
          modify: mockMessagesModify,
          attachments: { get: mockAttachmentsGet },
        },
        threads: {
          list: mockThreadsList,
          get: mockThreadsGet,
          trash: mockThreadsTrash,
        },
      },
    }),
  },
}));

import { GmailService } from "../services/gmail.js";

describe("GmailService", () => {
  let service: GmailService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GmailService(mockAuth);
  });

  describe("getProfile", () => {
    it("should get user profile", async () => {
      mockGetProfile.mockResolvedValue({
        data: { emailAddress: "user@example.com", messagesTotal: 1000 },
      });

      const result = await service.getProfile();

      expect(result?.emailAddress).toBe("user@example.com");
    });
  });

  describe("listLabels", () => {
    it("should list labels", async () => {
      mockLabelsList.mockResolvedValue({
        data: {
          labels: [
            { id: "INBOX", name: "INBOX", type: "system" },
            { id: "Label_1", name: "Work", type: "user" },
          ],
        },
      });

      const result = await service.listLabels();

      expect(result).toHaveLength(2);
    });
  });

  describe("listMessages", () => {
    it("should list messages", async () => {
      mockMessagesList.mockResolvedValue({
        data: {
          messages: [{ id: "msg1", threadId: "t1" }],
          nextPageToken: "token",
        },
      });
      // getMessage is called for each message in the list
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          labelIds: ["INBOX"],
          snippet: "Hello...",
          payload: { headers: [] },
        },
      });

      const result = await service.listMessages();

      expect(result.messages).toHaveLength(1);
      expect(result.nextPageToken).toBe("token");
    });

    it("should omit bodyHtml from list results to keep them small", async () => {
      mockMessagesList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }] },
      });
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("plain").toString("base64url") },
              },
              {
                mimeType: "text/html",
                body: {
                  data: Buffer.from("<p>big newsletter</p>").toString("base64url"),
                },
              },
            ],
          },
        },
      });

      const result = await service.listMessages();

      expect(result.messages[0].body).toBe("plain");
      expect(result.messages[0].bodyHtml).toBeUndefined();
    });

    it("should filter messages", async () => {
      mockMessagesList.mockResolvedValue({ data: { messages: [] } });

      await service.listMessages({ q: "is:unread", labelIds: ["INBOX"] });

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "is:unread", labelIds: ["INBOX"] })
      );
    });
  });

  describe("getMessage", () => {
    it("should get message", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          labelIds: ["INBOX"],
          snippet: "Hello...",
          payload: {
            headers: [
              { name: "From", value: "sender@example.com" },
              { name: "Subject", value: "Test" },
            ],
            body: { data: Buffer.from("Hello").toString("base64") },
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.id).toBe("msg1");
      expect(result.from).toBe("sender@example.com");
    });

    it("should find the html body nested under multipart containers", async () => {
      const html = "<html><body><p>Full HTML body</p></body></html>";
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [],
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: Buffer.from("plain").toString("base64url") },
                  },
                  {
                    mimeType: "text/html",
                    body: { data: Buffer.from(html).toString("base64url") },
                  },
                ],
              },
              { mimeType: "application/pdf", body: { attachmentId: "a1" } },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.bodyHtml).toBe(html);
      expect(result.body).toBe("plain");
    });

    it("should fall back to the html body when there is no plain text part", async () => {
      const html = "<p>caf\u00e9 \u2014 only html</p>";
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            mimeType: "multipart/alternative",
            headers: [],
            parts: [
              {
                mimeType: "text/html",
                body: { data: Buffer.from(html).toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe(html);
      expect(result.bodyHtml).toBe(html);
    });

    it("should match mime types case-insensitively", async () => {
      const html = "<p>shouty mime type</p>";
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "TEXT/HTML",
                body: { data: Buffer.from(html).toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.bodyHtml).toBe(html);
    });

    it("should ignore non-text parts that carry inline data", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/related",
            parts: [
              {
                mimeType: "image/png",
                body: { data: Buffer.from("binaryimagedata").toString("base64url") },
              },
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("hello").toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe("hello");
      expect(result.bodyHtml).toBeUndefined();
    });

    it("should not take the body from an attached message or attachment", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/mixed",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("see attached").toString("base64url") },
              },
              {
                mimeType: "message/rfc822",
                parts: [
                  {
                    mimeType: "text/html",
                    body: {
                      data: Buffer.from("<p>forwarded</p>").toString("base64url"),
                    },
                  },
                ],
              },
              {
                mimeType: "text/html",
                filename: "notes.html",
                body: { data: Buffer.from("<p>attached file</p>").toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe("see attached");
      expect(result.bodyHtml).toBeUndefined();
    });

    it("should fall through to html when the plain part is only whitespace", async () => {
      const html = "<h1>the entire newsletter</h1>";
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/alternative",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("\r\n   ").toString("base64url") },
              },
              {
                mimeType: "text/html",
                body: { data: Buffer.from(html).toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe(html);
    });

    it("should join sibling text parts rather than keeping only the first", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/mixed",
            parts: [
              {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from("[EXTERNAL SENDER] Use caution.").toString("base64url"),
                },
              },
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("THE ACTUAL BODY").toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe("[EXTERNAL SENDER] Use caution.\n\nTHE ACTUAL BODY");
    });

    it("should keep text subtypes other than plain and html", async () => {
      const invite = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "text/calendar",
            body: { data: Buffer.from(invite).toString("base64url") },
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe(invite);
    });

    it("should skip a forwarded message whatever the case of its mime type", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/mixed",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("see attached").toString("base64url") },
              },
              {
                mimeType: "MESSAGE/RFC822",
                parts: [
                  {
                    mimeType: "text/html",
                    body: { data: Buffer.from("<p>SECRET</p>").toString("base64url") },
                  },
                ],
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe("see attached");
      expect(result.bodyHtml).toBeUndefined();
    });

    it("should still walk into a container that carries a filename", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "multipart/alternative",
            filename: "container.eml.part",
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("still here").toString("base64url") },
              },
            ],
          },
        },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe("still here");
    });

    it("should return an empty body when the message has no payload", async () => {
      mockMessagesGet.mockResolvedValue({
        data: { id: "msg1", threadId: "t1" },
      });

      const result = await service.getMessage("msg1");

      expect(result.body).toBe("");
      expect(result.bodyHtml).toBeUndefined();
    });

    it("should omit bodyHtml when includeHtml is false", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [],
            mimeType: "text/html",
            body: { data: Buffer.from("<p>hi</p>").toString("base64url") },
          },
        },
      });

      const result = await service.getMessage("msg1", { includeHtml: false });

      expect(result.body).toBe("");
      expect(result.bodyHtml).toBeUndefined();
    });
  });

  describe("sendEmail", () => {
    it("should send email", async () => {
      mockMessagesSend.mockResolvedValue({
        data: { id: "sent1", threadId: "t1" },
      });
      // sendEmail calls getMessage after sending to return the full message
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "sent1",
          threadId: "t1",
          labelIds: ["SENT"],
          snippet: "Test message",
          payload: {
            headers: [
              { name: "To", value: "recipient@example.com" },
              { name: "Subject", value: "Test" },
            ],
          },
        },
      });

      const result = await service.sendEmail({
        to: "recipient@example.com",
        subject: "Test",
        body: "Hello",
      });

      expect(mockMessagesSend).toHaveBeenCalled();
      expect(result.id).toBe("sent1");
    });
  });

  describe("attachments", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "gmcp-gmail-"));
      process.env.GOOGLE_MCP_FILE_ROOT = root;
    });

    afterEach(() => {
      delete process.env.GOOGLE_MCP_FILE_ROOT;
      rmSync(root, { recursive: true, force: true });
    });

    const sentRaw = (): string => {
      expect(mockMessagesSend).toHaveBeenCalledTimes(1);
      return Buffer.from(
        mockMessagesSend.mock.calls[0][0].requestBody.raw,
        "base64url"
      ).toString("utf-8");
    };

    const boundaryOf = (raw: string): string => {
      const match = raw.match(/boundary="([^"]+)"/);
      expect(match).not.toBeNull();
      return match![1];
    };

    const stubSend = (): void => {
      mockMessagesSend.mockResolvedValue({ data: { id: "sent1", threadId: "t1" } });
      mockMessagesGet.mockResolvedValue({
        data: { id: "sent1", threadId: "t1", payload: { headers: [] } },
      });
    };

    it("should send a multipart message with a base64 attachment", async () => {
      stubSend();

      await service.sendEmail({
        to: "r@example.com",
        subject: "Test",
        body: "see attached",
        attachments: [
          {
            content: Buffer.from("PDF-BYTES").toString("base64"),
            filename: "report.pdf",
            mimeType: "application/pdf",
          },
        ],
      });

      const decoded = sentRaw();
      expect(decoded).toContain("Content-Type: multipart/mixed; boundary=");
      expect(decoded).toContain('Content-Disposition: attachment; filename="report.pdf"');
      expect(decoded).toContain("Content-Transfer-Encoding: base64");
      expect(decoded).toContain(Buffer.from("PDF-BYTES").toString("base64"));
      // The body must survive as its own part, not get replaced by the file.
      expect(decoded).toContain("see attached");
    });

    it("should emit one part per attachment", async () => {
      stubSend();

      await service.sendEmail({
        to: "r@example.com",
        subject: "Test",
        body: "b",
        attachments: [
          { content: Buffer.from("first").toString("base64"), filename: "a.txt" },
          { content: Buffer.from("second").toString("base64"), filename: "b.txt" },
        ],
      });

      const decoded = sentRaw();
      const boundary = boundaryOf(decoded);
      // Three opening delimiters: the body part plus one per attachment.
      const opens = decoded.split(`--${boundary}\r\n`).length - 1;
      expect(opens).toBe(3);
      expect(decoded).toContain('filename="a.txt"');
      expect(decoded).toContain('filename="b.txt"');
      expect(decoded).toContain(Buffer.from("first").toString("base64"));
      expect(decoded).toContain(Buffer.from("second").toString("base64"));
      expect(decoded.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    });

    it("should wrap base64 at 76 characters", async () => {
      stubSend();
      const payload = Buffer.alloc(600, 0x41);

      await service.sendEmail({
        to: "r@example.com",
        subject: "T",
        body: "b",
        attachments: [{ content: payload.toString("base64"), filename: "big.bin" }],
      });

      const decoded = sentRaw();
      const boundary = boundaryOf(decoded);
      const part = decoded.split(`--${boundary}`)[2];
      const lines = part.split("\r\n\r\n")[1].split("\r\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines.slice(0, -1)) {
        expect(line).toHaveLength(76);
      }
      expect(lines.at(-1)!.length).toBeLessThanOrEqual(76);
      expect(Buffer.from(lines.join(""), "base64")).toEqual(payload);
    });

    it("should not emit a blank line when the payload is an exact multiple of 76", async () => {
      stubSend();
      // 57 raw bytes encode to exactly 76 base64 characters.
      const payload = Buffer.alloc(57, 0x42);

      await service.sendEmail({
        to: "r@example.com",
        subject: "T",
        body: "b",
        attachments: [{ content: payload.toString("base64"), filename: "exact.bin" }],
      });

      const decoded = sentRaw();
      const boundary = boundaryOf(decoded);
      expect(decoded).not.toContain(`\r\n\r\n--${boundary}--`);
    });

    it("should use a fresh boundary for every message", async () => {
      stubSend();
      const attachment = { content: "AAAA", filename: "a.bin" };

      await service.sendEmail({ to: "r@e.com", subject: "T", body: "b", attachments: [attachment] });
      const first = boundaryOf(sentRaw());

      mockMessagesSend.mockClear();
      await service.sendEmail({ to: "r@e.com", subject: "T", body: "b", attachments: [attachment] });
      const second = boundaryOf(sentRaw());

      expect(first).not.toBe(second);
    });

    it("should attach a file read from the file root", async () => {
      stubSend();
      writeFileSync(join(root, "notes.txt"), "on disk");

      await service.sendEmail({
        to: "r@example.com",
        subject: "Test",
        body: "b",
        attachments: [{ path: "notes.txt", mimeType: "text/plain" }],
      });

      const decoded = sentRaw();
      expect(decoded).toContain('filename="notes.txt"');
      expect(decoded).toContain(Buffer.from("on disk").toString("base64"));
    });

    it("should refuse to attach a file outside the file root", async () => {
      stubSend();

      await expect(
        service.sendEmail({
          to: "r@example.com",
          subject: "T",
          body: "b",
          attachments: [{ path: "/etc/passwd" }],
        })
      ).rejects.toThrow(/must stay inside/);
      expect(mockMessagesSend).not.toHaveBeenCalled();
    });

    it("should stay single-part when there are no attachments", async () => {
      stubSend();

      await service.sendEmail({ to: "r@example.com", subject: "T", body: "b" });

      expect(sentRaw()).not.toContain("multipart/mixed");
    });

    it("should not let a filename break out of its header", async () => {
      stubSend();

      await service.sendEmail({
        to: "r@example.com",
        subject: "T",
        body: "b",
        attachments: [
          { content: "AAAA", filename: 'a"\r\nBcc: attacker@evil.com\r\n.txt' },
        ],
      });

      const decoded = sentRaw();
      expect(decoded).not.toMatch(/^Bcc: attacker@evil\.com$/m);
      expect(decoded).toContain('filename="a_ Bcc: attacker@evil.com .txt"');
    });

    it("should not let a mime type smuggle a name parameter", async () => {
      stubSend();

      await service.sendEmail({
        to: "r@example.com",
        subject: "T",
        body: "b",
        attachments: [
          {
            content: "AAAA",
            filename: "real.bin",
            mimeType: 'text/plain; name="invoice.pdf"; x="',
          },
        ],
      });

      const decoded = sentRaw();
      expect(decoded).not.toContain('name="invoice.pdf"');
      expect(decoded).toContain('Content-Type: application/octet-stream; filename="real.bin"');
    });

    it("should encode a non-ASCII filename per RFC 2231", async () => {
      stubSend();

      await service.sendEmail({
        to: "r@example.com",
        subject: "T",
        body: "b",
        attachments: [{ content: "AAAA", filename: "r\u00e9sum\u00e9.pdf" }],
      });

      const decoded = sentRaw();
      // eslint-disable-next-line no-control-regex
      expect(decoded).not.toMatch(/[^\x00-\x7F]/);
      expect(decoded).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
      expect(decoded).toContain('filename="r_sum_.pdf"');
    });

    it("should reject content that is not base64", async () => {
      stubSend();

      await expect(
        service.sendEmail({
          to: "r@example.com",
          subject: "T",
          body: "b",
          attachments: [{ content: "not base64 !!!" }],
        })
      ).rejects.toThrow(/base64/);
      expect(mockMessagesSend).not.toHaveBeenCalled();
    });

    it("should name which attachment failed", async () => {
      stubSend();

      await expect(
        service.sendEmail({
          to: "r@example.com",
          subject: "T",
          body: "b",
          attachments: [
            { content: "AAAA", filename: "good.bin" },
            { content: "not base64 !!!", filename: "bad.bin" },
          ],
        })
      ).rejects.toThrow(/attachment\[1\] \(bad\.bin\)/);
    });

    it("should reject attachments whose combined size exceeds the cap", async () => {
      stubSend();
      const big = Buffer.alloc(20 * 1024 * 1024).toString("base64");

      await expect(
        service.sendEmail({
          to: "r@example.com",
          subject: "T",
          body: "b",
          attachments: [
            { content: big, filename: "a.bin" },
            { content: big, filename: "b.bin" },
          ],
        })
      ).rejects.toThrow(/Attachments total/);
      expect(mockMessagesSend).not.toHaveBeenCalled();
    });

    it("should send a reply with an attachment", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "m1",
          threadId: "t1",
          payload: {
            headers: [
              { name: "From", value: "sender@example.com" },
              { name: "Subject", value: "Original" },
            ],
          },
        },
      });
      mockMessagesSend.mockResolvedValue({ data: { id: "sent1", threadId: "t1" } });

      await service.replyToEmail("m1", "here you go", false, [
        { content: Buffer.from("REPLY-FILE").toString("base64"), filename: "r.pdf" },
      ]);

      const decoded = sentRaw();
      expect(decoded).toContain("Subject: Re: Original");
      expect(decoded).toContain("multipart/mixed");
      expect(decoded).toContain('filename="r.pdf"');
      expect(decoded).toContain(Buffer.from("REPLY-FILE").toString("base64"));
      expect(mockMessagesSend.mock.calls[0][0].requestBody.threadId).toBe("t1");
    });

    it("should list attachment metadata on a message", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "m1",
          threadId: "t1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [{ name: "Subject", value: "With file" }],
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("hello").toString("base64url") },
              },
              {
                mimeType: "application/pdf",
                filename: "report.pdf",
                body: { attachmentId: "att1", size: 1234 },
              },
            ],
          },
        },
      });

      const message = await service.getMessage("m1");

      expect(message.body).toBe("hello");
      expect(message.attachments).toEqual([
        {
          attachmentId: "att1",
          filename: "report.pdf",
          mimeType: "application/pdf",
          size: 1234,
          data: undefined,
        },
      ]);
    });

    it("should find an attachment nested below the top level", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "m1",
          threadId: "t1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [],
            parts: [
              {
                mimeType: "multipart/related",
                parts: [
                  {
                    mimeType: "multipart/alternative",
                    parts: [
                      {
                        mimeType: "text/plain",
                        body: { data: Buffer.from("body text").toString("base64url") },
                      },
                    ],
                  },
                  {
                    mimeType: "image/png",
                    filename: "inline.png",
                    body: { attachmentId: "att-deep", size: 99 },
                  },
                ],
              },
            ],
          },
        },
      });

      const message = await service.getMessage("m1");

      expect(message.body).toBe("body text");
      expect(message.attachments?.map((a) => a.attachmentId)).toEqual(["att-deep"]);
    });

    it("should surface an attachment whose bytes came inline with no attachmentId", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "m1",
          threadId: "t1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [],
            parts: [
              {
                mimeType: "text/plain",
                body: { data: Buffer.from("hi").toString("base64url") },
              },
              {
                mimeType: "text/csv",
                filename: "small.csv",
                body: { data: Buffer.from("a,b\n1,2").toString("base64url") },
              },
            ],
          },
        },
      });

      const message = await service.getMessage("m1");

      expect(message.body).toBe("hi");
      expect(message.attachments).toHaveLength(1);
      const [attachment] = message.attachments!;
      expect(attachment.attachmentId).toBeUndefined();
      expect(attachment.filename).toBe("small.csv");
      expect(attachment.size).toBe(7);
      expect(Buffer.from(attachment.data!, "base64").toString("utf-8")).toBe("a,b\n1,2");
    });

    it("should return attachment bytes as base64", async () => {
      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from([0xff, 0x00, 0x10]).toString("base64url") },
      });

      const result = await service.getAttachment("m1", "att1");

      expect(mockAttachmentsGet).toHaveBeenCalledWith(
        { userId: "me", messageId: "m1", id: "att1" },
        expect.anything()
      );
      expect(result.size).toBe(3);
      expect(Buffer.from(result.data!, "base64")).toEqual(
        Buffer.from([0xff, 0x00, 0x10])
      );
    });

    it("should throw rather than return an empty file when Gmail omits the data", async () => {
      mockAttachmentsGet.mockResolvedValue({ data: { size: 40000000 } });

      await expect(service.getAttachment("m1", "att1")).rejects.toThrow(
        /no data for attachment/
      );
    });

    it("should refuse to inline an attachment over the inline cap", async () => {
      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.alloc(2 * 1024 * 1024).toString("base64url") },
      });

      await expect(service.getAttachment("m1", "att1")).rejects.toThrow(
        /inline limit/
      );
    });

    it("should write an attachment to savePath instead of returning it", async () => {
      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from("saved bytes").toString("base64url") },
      });

      const result = await service.getAttachment("m1", "att1", {
        savePath: "saved.bin",
      });

      expect(result.data).toBeUndefined();
      expect(result.path).toBe(join(root, "saved.bin"));
      expect(readFileSync(result.path!, "utf-8")).toBe("saved bytes");
    });

    it("should refuse a savePath outside the file root", async () => {
      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from("x").toString("base64url") },
      });

      await expect(
        service.getAttachment("m1", "att1", { savePath: "/etc/cron.d/pwn" })
      ).rejects.toThrow(/must stay inside/);
    });
  });

  describe("trashMessage", () => {
    it("should trash message", async () => {
      mockMessagesTrash.mockResolvedValue({ data: {} });

      await service.trashMessage("msg1");

      expect(mockMessagesTrash).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    });
  });

  describe("untrashMessage", () => {
    it("should untrash message", async () => {
      mockMessagesUntrash.mockResolvedValue({ data: {} });

      await service.untrashMessage("msg1");

      expect(mockMessagesUntrash).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    });
  });

  describe("deleteMessage", () => {
    it("should delete message", async () => {
      mockMessagesDelete.mockResolvedValue({});

      await service.deleteMessage("msg1");

      expect(mockMessagesDelete).toHaveBeenCalledWith({ userId: "me", id: "msg1" });
    });
  });

  describe("markAsRead", () => {
    it("should mark as read", async () => {
      mockMessagesModify.mockResolvedValue({ data: {} });

      await service.markAsRead("msg1");

      expect(mockMessagesModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg1",
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
    });
  });

  describe("markAsUnread", () => {
    it("should mark as unread", async () => {
      mockMessagesModify.mockResolvedValue({ data: {} });

      await service.markAsUnread("msg1");

      expect(mockMessagesModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg1",
        requestBody: { addLabelIds: ["UNREAD"] },
      });
    });
  });

  describe("addLabels", () => {
    it("should add labels", async () => {
      mockMessagesModify.mockResolvedValue({ data: {} });

      await service.addLabels("msg1", ["Label_1", "Label_2"]);

      expect(mockMessagesModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg1",
        requestBody: { addLabelIds: ["Label_1", "Label_2"] },
      });
    });
  });

  describe("listThreads", () => {
    it("should list threads", async () => {
      mockThreadsList.mockResolvedValue({
        data: {
          threads: [{ id: "t1", historyId: "123", snippet: "Thread" }],
          nextPageToken: "token",
        },
      });

      const result = await service.listThreads();

      expect(result.threads).toHaveLength(1);
    });
  });

  describe("getThread", () => {
    it("should get thread", async () => {
      mockThreadsGet.mockResolvedValue({
        data: {
          id: "t1",
          messages: [{ id: "msg1", threadId: "t1", payload: { headers: [] } }],
        },
      });

      const result = await service.getThread("t1");

      expect(result.id).toBe("t1");
      expect(result.messages).toHaveLength(1);
    });

    it("should collect nested bodies for each message in the thread", async () => {
      const html = "<p>thread reply</p>";
      mockThreadsGet.mockResolvedValue({
        data: {
          id: "t1",
          messages: [
            {
              id: "msg1",
              threadId: "t1",
              payload: {
                headers: [],
                mimeType: "multipart/alternative",
                parts: [
                  {
                    mimeType: "text/plain",
                    body: { data: Buffer.from("reply text").toString("base64url") },
                  },
                  {
                    mimeType: "text/html",
                    body: { data: Buffer.from(html).toString("base64url") },
                  },
                ],
              },
            },
            { id: "msg2", threadId: "t1", payload: { headers: [] } },
          ],
        },
      });

      const result = await service.getThread("t1");

      expect(result.messages?.[0].body).toBe("reply text");
      expect(result.messages?.[0].bodyHtml).toBe(html);
      // Each message gets its own accumulator - no bleed from the one before.
      expect(result.messages?.[1].body).toBe("");
      expect(result.messages?.[1].bodyHtml).toBeUndefined();
    });
  });

  describe("searchEmails", () => {
    it("should search emails", async () => {
      mockMessagesList.mockResolvedValue({ data: { messages: [{ id: "msg1" }] } });
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: { headers: [] },
        },
      });

      const result = await service.searchEmails("from:boss");

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "from:boss" })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("getUnreadEmails", () => {
    it("should get unread emails", async () => {
      mockMessagesList.mockResolvedValue({ data: { messages: [{ id: "msg1" }] } });
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          threadId: "t1",
          labelIds: ["UNREAD"],
          payload: { headers: [] },
        },
      });

      const result = await service.getUnreadEmails();

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "is:unread" })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("getStarredEmails", () => {
    it("should get starred emails", async () => {
      mockMessagesList.mockResolvedValue({ data: { messages: [{ id: "msg1" }] } });
      mockMessagesGet.mockResolvedValue({
        data: { id: "msg1", threadId: "t1", payload: { headers: [] } },
      });

      const result = await service.getStarredEmails();

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "is:starred" })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("getImportantEmails", () => {
    it("should get important emails", async () => {
      mockMessagesList.mockResolvedValue({ data: { messages: [{ id: "msg1" }] } });
      mockMessagesGet.mockResolvedValue({
        data: { id: "msg1", threadId: "t1", payload: { headers: [] } },
      });

      const result = await service.getImportantEmails();

      expect(mockMessagesList).toHaveBeenCalledWith(
        expect.objectContaining({ q: "is:important" })
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("removeLabels", () => {
    it("should remove labels", async () => {
      mockMessagesModify.mockResolvedValue({ data: {} });

      await service.removeLabels("msg1", ["Label_1"]);

      expect(mockMessagesModify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg1",
        requestBody: { removeLabelIds: ["Label_1"] },
      });
    });
  });

  describe("trashThread", () => {
    it("should trash thread", async () => {
      mockThreadsTrash.mockResolvedValue({ data: {} });

      await service.trashThread("t1");

      expect(mockThreadsTrash).toHaveBeenCalledWith({
        userId: "me",
        id: "t1",
      });
    });
  });

  describe("getLabel", () => {
    it("should get label by ID", async () => {
      mockLabelsGet.mockResolvedValue({
        data: {
          id: "Label_1",
          name: "Work",
          type: "user",
          messagesTotal: 50,
          messagesUnread: 5,
        },
      });

      const result = await service.getLabel("Label_1");

      expect(result.id).toBe("Label_1");
      expect(result.name).toBe("Work");
      expect(result.messagesTotal).toBe(50);
    });
  });

  describe("header injection", () => {
    it("should strip CR and LF from header values", async () => {
      mockMessagesSend.mockResolvedValue({ data: { id: "sent1", threadId: "t1" } });
      mockMessagesGet.mockResolvedValue({
        data: { id: "sent1", threadId: "t1", payload: { headers: [] } },
      });

      await service.sendEmail({
        to: "victim@example.com",
        subject: "Hi\r\nBcc: attacker@evil.com",
        body: "hello",
      });

      const { raw } = mockMessagesSend.mock.calls[0][0].requestBody;
      const decoded = Buffer.from(raw, "base64url").toString("utf-8");

      expect(decoded).toContain("Subject: Hi Bcc: attacker@evil.com");
      expect(decoded).not.toMatch(/^Bcc: attacker@evil\.com$/m);
    });
  });

  describe("replyToEmail", () => {
    it("should reply to email", async () => {
      // First call to getMessage to get original message
      mockMessagesGet.mockResolvedValueOnce({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [
              { name: "From", value: "sender@example.com" },
              { name: "Subject", value: "Original Subject" },
            ],
          },
        },
      });

      // sendEmail calls mockMessagesSend
      mockMessagesSend.mockResolvedValue({
        data: { id: "reply1", threadId: "t1" },
      });

      // Second call to getMessage after sending
      mockMessagesGet.mockResolvedValueOnce({
        data: {
          id: "reply1",
          threadId: "t1",
          payload: { headers: [] },
        },
      });

      const result = await service.replyToEmail("msg1", "Reply body");

      expect(result.id).toBe("reply1");
    });

    it("should keep Re: prefix if already present", async () => {
      mockMessagesGet.mockResolvedValueOnce({
        data: {
          id: "msg1",
          threadId: "t1",
          payload: {
            headers: [
              { name: "From", value: "sender@example.com" },
              { name: "Subject", value: "Re: Original" },
            ],
          },
        },
      });
      mockMessagesSend.mockResolvedValue({ data: { id: "reply1" } });
      mockMessagesGet.mockResolvedValueOnce({
        data: { id: "reply1", threadId: "t1", payload: { headers: [] } },
      });

      await service.replyToEmail("msg1", "Reply body");

      expect(mockMessagesSend).toHaveBeenCalled();
    });
  });
});
