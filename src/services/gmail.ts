import { google, type gmail_v1, type Auth } from "googleapis";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  body?: string;
  isUnread?: boolean;
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailThread {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  isHtml?: boolean;
  replyToMessageId?: string;
  threadId?: string;
}

export class GmailService {
  private readonly gmail: gmail_v1.Gmail;

  constructor(authClient: Auth.OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth: authClient });
  }

  // Profile

  public async getProfile(): Promise<{
    emailAddress: string;
    messagesTotal: number;
    threadsTotal: number;
    historyId: string;
  }> {
    const response = await this.gmail.users.getProfile({ userId: "me" });
    return {
      emailAddress: response.data.emailAddress || "",
      messagesTotal: response.data.messagesTotal || 0,
      threadsTotal: response.data.threadsTotal || 0,
      historyId: response.data.historyId || "",
    };
  }

  // Labels

  public async listLabels(): Promise<GmailLabel[]> {
    const response = await this.gmail.users.labels.list({ userId: "me" });
    return (response.data.labels || []).map((label) => ({
      id: label.id || "",
      name: label.name || "",
      type: label.type || undefined,
      messagesTotal: label.messagesTotal || undefined,
      messagesUnread: label.messagesUnread || undefined,
    }));
  }

  public async getLabel(labelId: string): Promise<GmailLabel> {
    const response = await this.gmail.users.labels.get({
      userId: "me",
      id: labelId,
    });
    return {
      id: response.data.id || "",
      name: response.data.name || "",
      type: response.data.type || undefined,
      messagesTotal: response.data.messagesTotal || undefined,
      messagesUnread: response.data.messagesUnread || undefined,
    };
  }

  // Messages

  public async listMessages(options: {
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    q?: string;
    includeSpamTrash?: boolean;
  } = {}): Promise<{ messages: GmailMessage[]; nextPageToken?: string }> {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
      labelIds: options.labelIds,
      q: options.q,
      includeSpamTrash: options.includeSpamTrash || false,
    });

    const messages: GmailMessage[] = [];
    for (const msg of response.data.messages || []) {
      if (msg.id) {
        const fullMsg = await this.getMessage(msg.id);
        messages.push(fullMsg);
      }
    }

    return {
      messages,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getMessage(messageId: string): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = response.data.payload?.headers || [];
    const getHeader = (name: string): string | null | undefined =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

    let body = "";
    const payload = response.data.payload;

    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64").toString("utf-8");
    } else if (payload?.parts) {
      const textPart = payload.parts.find(
        (p) => p.mimeType === "text/plain" || p.mimeType === "text/html"
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    }

    return {
      id: response.data.id || "",
      threadId: response.data.threadId || "",
      labelIds: response.data.labelIds || undefined,
      snippet: response.data.snippet || undefined,
      subject: getHeader("Subject") || undefined,
      from: getHeader("From") || undefined,
      to: getHeader("To") || undefined,
      date: getHeader("Date") || undefined,
      body,
      isUnread: response.data.labelIds?.includes("UNREAD"),
    };
  }

  public async sendEmail(options: SendEmailOptions): Promise<GmailMessage> {
    const messageParts = [
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
    ];

    if (options.cc) {
      messageParts.push(`Cc: ${options.cc}`);
    }
    if (options.bcc) {
      messageParts.push(`Bcc: ${options.bcc}`);
    }

    if (options.isHtml) {
      messageParts.push("Content-Type: text/html; charset=utf-8");
    } else {
      messageParts.push("Content-Type: text/plain; charset=utf-8");
    }

    messageParts.push("");
    messageParts.push(options.body);

    const rawMessage = Buffer.from(messageParts.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const requestBody: gmail_v1.Schema$Message = {
      raw: rawMessage,
    };

    if (options.threadId) {
      requestBody.threadId = options.threadId;
    }

    const response = await this.gmail.users.messages.send({
      userId: "me",
      requestBody,
    });

    return this.getMessage(response.data.id!);
  }

  public async replyToEmail(
    messageId: string,
    body: string,
    isHtml = false
  ): Promise<GmailMessage> {
    const originalMessage = await this.getMessage(messageId);

    return this.sendEmail({
      to: originalMessage.from || "",
      subject: originalMessage.subject?.startsWith("Re:")
        ? originalMessage.subject
        : `Re: ${originalMessage.subject}`,
      body,
      isHtml,
      threadId: originalMessage.threadId,
      replyToMessageId: messageId,
    });
  }

  public async trashMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    });
  }

  public async untrashMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.untrash({
      userId: "me",
      id: messageId,
    });
  }

  public async deleteMessage(messageId: string): Promise<void> {
    await this.gmail.users.messages.delete({
      userId: "me",
      id: messageId,
    });
  }

  public async markAsRead(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
  }

  public async markAsUnread(messageId: string): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: ["UNREAD"],
      },
    });
  }

  public async addLabels(messageId: string, labelIds: string[]): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: labelIds,
      },
    });
  }

  public async removeLabels(messageId: string, labelIds: string[]): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: labelIds,
      },
    });
  }

  // Threads

  public async listThreads(options: {
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    q?: string;
  } = {}): Promise<{ threads: GmailThread[]; nextPageToken?: string }> {
    const response = await this.gmail.users.threads.list({
      userId: "me",
      maxResults: options.maxResults || 20,
      pageToken: options.pageToken,
      labelIds: options.labelIds,
      q: options.q,
    });

    const threads: GmailThread[] = (response.data.threads || []).map((t) => ({
      id: t.id || "",
      snippet: t.snippet || undefined,
      historyId: t.historyId || undefined,
    }));

    return {
      threads,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getThread(threadId: string): Promise<GmailThread> {
    const response = await this.gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const messages: GmailMessage[] = [];
    for (const msg of response.data.messages || []) {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string): string | null | undefined =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

      let body = "";
      const payload = msg.payload;

      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, "base64").toString("utf-8");
      } else if (payload?.parts) {
        const textPart = payload.parts.find(
          (p) => p.mimeType === "text/plain" || p.mimeType === "text/html"
        );
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
        }
      }

      messages.push({
        id: msg.id || "",
        threadId: msg.threadId || "",
        labelIds: msg.labelIds || undefined,
        snippet: msg.snippet || undefined,
        subject: getHeader("Subject") || undefined,
        from: getHeader("From") || undefined,
        to: getHeader("To") || undefined,
        date: getHeader("Date") || undefined,
        body,
        isUnread: msg.labelIds?.includes("UNREAD"),
      });
    }

    return {
      id: response.data.id || "",
      snippet: response.data.snippet || undefined,
      historyId: response.data.historyId || undefined,
      messages,
    };
  }

  public async trashThread(threadId: string): Promise<void> {
    await this.gmail.users.threads.trash({
      userId: "me",
      id: threadId,
    });
  }

  // Search helpers

  public async searchEmails(query: string, maxResults = 20): Promise<GmailMessage[]> {
    const { messages } = await this.listMessages({ q: query, maxResults });
    return messages;
  }

  public async getUnreadEmails(maxResults = 20): Promise<GmailMessage[]> {
    return this.searchEmails("is:unread", maxResults);
  }

  public async getStarredEmails(maxResults = 20): Promise<GmailMessage[]> {
    return this.searchEmails("is:starred", maxResults);
  }

  public async getImportantEmails(maxResults = 20): Promise<GmailMessage[]> {
    return this.searchEmails("is:important", maxResults);
  }

  // Attachments

  private static getAttachmentsBaseDir(): string {
    return path.join(os.homedir(), "Downloads", "google-mcp", "gmail");
  }

  private async getMessageSubject(messageId: string): Promise<string> {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Subject"],
    });
    const headers = response.data.payload?.headers || [];
    return headers.find((h) => h.name?.toLowerCase() === "subject")?.value || messageId;
  }

  // Mimics Gmail's own "Download all attachments" zip naming: lowercase,
  // whitespace stripped. Filesystem-unsafe characters are also stripped
  // since Gmail subjects aren't constrained to valid folder names.
  private slugifyFolderName(subject: string): string {
    return subject.replace(/\s+/g, "").replace(/[<>:"/\\|?*]/g, "").toLowerCase();
  }

  // Appends " (1)", " (2)", etc. before the extension until an unused path
  // is found, so two attachments that share a filename never overwrite
  // each other (the flat gmail_download_attachment base dir makes this a
  // real collision, not just a theoretical one).
  private resolveCollisionFreePath(dir: string, filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);

    let candidatePath = path.join(dir, filename);
    for (let n = 1; fs.existsSync(candidatePath); n++) {
      candidatePath = path.join(dir, `${base} (${n})${ext}`);
    }
    return candidatePath;
  }

  private collectAttachmentParts(
    parts?: gmail_v1.Schema$MessagePart[]
  ): gmail_v1.Schema$MessagePart[] {
    if (!parts) return [];
    const result: gmail_v1.Schema$MessagePart[] = [];
    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        result.push(part);
      }
      if (part.parts) {
        result.push(...this.collectAttachmentParts(part.parts));
      }
    }
    return result;
  }

  public async listAttachments(messageId: string): Promise<GmailAttachment[]> {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const parts = this.collectAttachmentParts(response.data.payload?.parts);

    return parts.map((part) => ({
      attachmentId: part.body?.attachmentId || "",
      filename: part.filename || "unnamed",
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body?.size || 0,
    }));
  }

  public async downloadAttachment(
    messageId: string,
    attachmentId: string,
    filename: string,
    downloadDir?: string,
    mimeType = "application/octet-stream"
  ): Promise<{ path: string; filename: string; mimeType: string; size: number }> {
    // Gmail issues a fresh attachmentId on every messages.get call, so it
    // can't be used to look up metadata via a second list call — the caller
    // must pass mimeType through from the gmail_list_attachments result.
    const attachmentResponse = await this.gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = attachmentResponse.data.data || "";
    const buffer = Buffer.from(data, "base64");

    const targetDir = downloadDir || GmailService.getAttachmentsBaseDir();
    const safeFilename = path.basename(filename);

    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = this.resolveCollisionFreePath(targetDir, safeFilename);
    fs.writeFileSync(targetPath, buffer);

    return {
      path: targetPath,
      filename: path.basename(targetPath),
      mimeType,
      size: buffer.length,
    };
  }

  public async downloadAllAttachments(
    messageId: string,
    downloadDir?: string
  ): Promise<Array<{ path: string; filename: string; mimeType: string; size: number }>> {
    const attachments = await this.listAttachments(messageId);

    let targetDir = downloadDir;
    if (!targetDir && attachments.length > 0) {
      const subject = await this.getMessageSubject(messageId);
      targetDir = path.join(
        GmailService.getAttachmentsBaseDir(),
        this.slugifyFolderName(subject)
      );
    }

    const results: Array<{ path: string; filename: string; mimeType: string; size: number }> = [];
    for (const attachment of attachments) {
      const result = await this.downloadAttachment(
        messageId,
        attachment.attachmentId,
        attachment.filename,
        targetDir,
        attachment.mimeType
      );
      results.push(result);
    }

    return results;
  }
}

