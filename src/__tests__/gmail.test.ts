import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "googleapis";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("fs");
vi.mock("os");

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
          attachments: {
            get: mockAttachmentsGet,
          },
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
    vi.mocked(os.homedir).mockReturnValue("/home/user");
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.existsSync).mockReturnValue(false);
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

  describe("listAttachments", () => {
    it("should find attachments nested in multipart/mixed -> multipart/alternative", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          payload: {
            mimeType: "multipart/mixed",
            parts: [
              {
                mimeType: "multipart/alternative",
                parts: [
                  { mimeType: "text/plain", body: { data: "" } },
                  { mimeType: "text/html", body: { data: "" } },
                ],
              },
              {
                mimeType: "image/png",
                filename: "scan.png",
                body: { attachmentId: "att1", size: 1234 },
              },
            ],
          },
        },
      });

      const result = await service.listAttachments("msg1");

      expect(result).toEqual([
        { attachmentId: "att1", filename: "scan.png", mimeType: "image/png", size: 1234 },
      ]);
    });

    it("should return an empty array when there are no attachment parts", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          payload: {
            mimeType: "text/plain",
            body: { data: Buffer.from("Hello").toString("base64") },
          },
        },
      });

      const result = await service.listAttachments("msg1");

      expect(result).toEqual([]);
    });
  });

  describe("downloadAttachment", () => {
    beforeEach(() => {
      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from("hello").toString("base64"), size: 5 },
      });
    });

    it("should save the attachment to the default Downloads directory and return its path", async () => {
      const result = await service.downloadAttachment(
        "msg1",
        "att1",
        "scan.png",
        undefined,
        "image/png"
      );

      const expectedDir = path.join("/home/user", "Downloads", "google-mcp", "gmail");
      const expectedPath = path.join(expectedDir, "scan.png");

      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, Buffer.from("hello"));
      expect(result).toEqual({
        path: expectedPath,
        filename: "scan.png",
        mimeType: "image/png",
        size: 5,
      });
    });

    it("should default mimeType to application/octet-stream when not provided", async () => {
      // Gmail issues a fresh attachmentId on every messages.get call, so
      // downloadAttachment can't reliably re-derive mimeType itself — the
      // caller passes it through from gmail_list_attachments instead.
      const result = await service.downloadAttachment("msg1", "att1", "scan.png");

      expect(result.mimeType).toBe("application/octet-stream");
    });

    it("should respect a custom downloadDir", async () => {
      const result = await service.downloadAttachment(
        "msg1",
        "att1",
        "scan.png",
        "/custom/dir"
      );

      const expectedPath = path.join("/custom/dir", "scan.png");
      expect(fs.mkdirSync).toHaveBeenCalledWith("/custom/dir", { recursive: true });
      expect(result.path).toBe(expectedPath);
    });

    it("should sanitize a path-traversal filename to stay inside the target dir", async () => {
      const result = await service.downloadAttachment(
        "msg1",
        "att1",
        "../../evil.txt",
        "/custom/dir"
      );

      expect(result.filename).toBe("evil.txt");
      expect(result.path).toBe(path.join("/custom/dir", "evil.txt"));
    });

    it("should not overwrite an existing file with the same name", async () => {
      // scan.png already exists; "scan (1).png" is free.
      vi.mocked(fs.existsSync).mockImplementation(
        (p) => p === path.join("/custom/dir", "scan.png")
      );

      const result = await service.downloadAttachment(
        "msg1",
        "att1",
        "scan.png",
        "/custom/dir"
      );

      expect(result.filename).toBe("scan (1).png");
      expect(result.path).toBe(path.join("/custom/dir", "scan (1).png"));
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        path.join("/custom/dir", "scan (1).png"),
        Buffer.from("hello")
      );
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        path.join("/custom/dir", "scan.png"),
        expect.anything()
      );
    });

    it("should keep incrementing the suffix until a free name is found", async () => {
      vi.mocked(fs.existsSync).mockImplementation(
        (p) =>
          p === path.join("/custom/dir", "scan.png") ||
          p === path.join("/custom/dir", "scan (1).png")
      );

      const result = await service.downloadAttachment(
        "msg1",
        "att1",
        "scan.png",
        "/custom/dir"
      );

      expect(result.filename).toBe("scan (2).png");
    });
  });

  describe("downloadAllAttachments", () => {
    it("should download every attachment on the message", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          payload: {
            parts: [
              {
                mimeType: "image/jpeg",
                filename: "img1.jpg",
                body: { attachmentId: "att1", size: 3 },
              },
              {
                mimeType: "image/jpeg",
                filename: "img2.jpg",
                body: { attachmentId: "att2", size: 3 },
              },
            ],
          },
        },
      });
      mockAttachmentsGet.mockImplementation(({ id }: { id: string }) =>
        Promise.resolve({
          data: { data: Buffer.from(`data-${id}`).toString("base64"), size: 3 },
        })
      );

      const results = await service.downloadAllAttachments("msg1", "/custom/dir");

      expect(mockAttachmentsGet).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        {
          path: path.join("/custom/dir", "img1.jpg"),
          filename: "img1.jpg",
          mimeType: "image/jpeg",
          size: Buffer.from("data-att1").length,
        },
        {
          path: path.join("/custom/dir", "img2.jpg"),
          filename: "img2.jpg",
          mimeType: "image/jpeg",
          size: Buffer.from("data-att2").length,
        },
      ]);
    });

    it("should default to a subject-based folder under the gmail base dir, mimicking Gmail's own zip naming", async () => {
      mockMessagesGet.mockResolvedValue({
        data: {
          id: "msg1",
          payload: {
            headers: [{ name: "Subject", value: "August r15644804" }],
            parts: [
              {
                mimeType: "image/jpeg",
                filename: "img1.jpg",
                body: { attachmentId: "att1", size: 3 },
              },
            ],
          },
        },
      });
      mockAttachmentsGet.mockResolvedValue({
        data: { data: Buffer.from("hello").toString("base64"), size: 3 },
      });

      const results = await service.downloadAllAttachments("msg1");

      const expectedDir = path.join(
        "/home/user",
        "Downloads",
        "google-mcp",
        "gmail",
        "augustr15644804"
      );
      expect(results[0].path).toBe(path.join(expectedDir, "img1.jpg"));
    });

    it("should return an empty array when the message has no attachments", async () => {
      mockMessagesGet.mockResolvedValue({
        data: { id: "msg1", payload: { mimeType: "text/plain", body: { data: "" } } },
      });

      const results = await service.downloadAllAttachments("msg1");

      expect(results).toEqual([]);
      expect(mockAttachmentsGet).not.toHaveBeenCalled();
    });
  });
});
