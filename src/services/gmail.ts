import { google, type gmail_v1, type Auth } from "googleapis";

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
  bodyHtml?: string;
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

interface MessageBodies {
  text?: string;
  html?: string;
}

// Gmail nests bodies arbitrarily deep: a mail with an attachment is
// multipart/mixed > multipart/alternative > text/html, so scanning only
// payload.parts finds a multipart container, never the text, and the body
// comes back empty. Where it did match, `find` hit text/plain first and the
// HTML alternative was dropped entirely. Walk the whole tree and keep both.
const collectBodies = (
  part: gmail_v1.Schema$MessagePart | undefined,
  found: MessageBodies = {}
): MessageBodies => {
  if (!part) {
    return found;
  }

  const data = part.body?.data;
  if (data) {
    // base64url: Gmail encodes with - and _, which the plain base64 alphabet
    // does not cover.
    const decoded = Buffer.from(data, "base64url").toString("utf-8");
    if (part.mimeType === "text/html") {
      found.html ??= decoded;
    } else if (part.mimeType === "text/plain" || !part.mimeType) {
      found.text ??= decoded;
    }
  }

  for (const child of part.parts || []) {
    collectBodies(child, found);
  }

  return found;
};

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

    const bodies = collectBodies(response.data.payload);

    return {
      id: response.data.id || "",
      threadId: response.data.threadId || "",
      labelIds: response.data.labelIds || undefined,
      snippet: response.data.snippet || undefined,
      subject: getHeader("Subject") || undefined,
      from: getHeader("From") || undefined,
      to: getHeader("To") || undefined,
      date: getHeader("Date") || undefined,
      body: bodies.text ?? bodies.html ?? "",
      bodyHtml: bodies.html,
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

      const bodies = collectBodies(msg.payload);

      messages.push({
        id: msg.id || "",
        threadId: msg.threadId || "",
        labelIds: msg.labelIds || undefined,
        snippet: msg.snippet || undefined,
        subject: getHeader("Subject") || undefined,
        from: getHeader("From") || undefined,
        to: getHeader("To") || undefined,
        date: getHeader("Date") || undefined,
        body: bodies.text ?? bodies.html ?? "",
        bodyHtml: bodies.html,
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
}

