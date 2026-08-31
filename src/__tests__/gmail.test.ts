import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
