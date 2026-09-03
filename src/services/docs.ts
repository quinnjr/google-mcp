import { google, type docs_v1, type Auth } from "googleapis";
import { type DocContent } from "../types/index.js";
import { DriveService } from "./drive.js";

export class DocsService {
  private readonly docs: docs_v1.Docs;
  private readonly drive: DriveService;

  constructor(authClient: Auth.OAuth2Client) {
    this.docs = google.docs({ version: "v1", auth: authClient });
    this.drive = new DriveService(authClient);
  }

  public async createDocument(title: string, content?: string, folderId?: string): Promise<DocContent> {
    // Create the document
    const response = await this.docs.documents.create({
      requestBody: {
        title,
      },
    });

    const documentId = response.data.documentId;
    if (!documentId) {
      throw new Error("Docs API did not return a documentId for the created document.");
    }

    // If content is provided, insert it
    if (content) {
      await this.docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        },
      });
    }

    // If folderId is provided, move the document to that folder
    if (folderId) {
      await this.drive.moveFile(documentId, folderId);
    }

    return {
      documentId,
      title: response.data.title ?? title,
      body: content,
    };
  }

  public async getDocument(documentId: string): Promise<DocContent> {
    const response = await this.docs.documents.get({ documentId });

    // Extract text content from the document
    const body = this.extractTextFromDocument(response.data);

    return {
      documentId: response.data.documentId ?? documentId,
      title: response.data.title ?? "",
      body,
      revisionId: response.data.revisionId || undefined,
    };
  }

  private extractTextFromDocument(doc: docs_v1.Schema$Document): string {
    let text = "";

    const content = doc.body?.content;
    if (!content) return text;

    for (const element of content) {
      if (element.paragraph) {
        for (const paragraphElement of element.paragraph.elements || []) {
          if (paragraphElement.textRun?.content) {
            text += paragraphElement.textRun.content;
          }
        }
      } else if (element.table) {
        for (const row of element.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            for (const cellContent of cell.content || []) {
              if (cellContent.paragraph) {
                for (const paragraphElement of cellContent.paragraph.elements || []) {
                  if (paragraphElement.textRun?.content) {
                    text += paragraphElement.textRun.content;
                  }
                }
              }
            }
            text += "\t";
          }
          text += "\n";
        }
      }
    }

    return text;
  }

  public async insertText(documentId: string, text: string, index: number): Promise<void> {
    await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index },
              text,
            },
          },
        ],
      },
    });
  }

  public async appendText(documentId: string, text: string): Promise<void> {
    // Get the document to find the end index
    const doc = await this.docs.documents.get({ documentId });

    const content = doc.data.body?.content;
    if (!content || content.length === 0) {
      await this.insertText(documentId, text, 1);
      return;
    }

    // Find the last element's end index
    const lastElement = content[content.length - 1];
    const endIndex = lastElement.endIndex ? lastElement.endIndex - 1 : 1;

    await this.insertText(documentId, text, endIndex);
  }

  public async deleteContent(documentId: string, startIndex: number, endIndex: number): Promise<void> {
    await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            deleteContentRange: {
              range: {
                startIndex,
                endIndex,
              },
            },
          },
        ],
      },
    });
  }

  public async replaceAllText(
    documentId: string,
    searchText: string,
    replaceText: string,
    matchCase = true
  ): Promise<number> {
    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: {
                text: searchText,
                matchCase,
              },
              replaceText,
            },
          },
        ],
      },
    });

    // Return the number of replacements made
    const replies = response.data.replies;
    if (replies && replies.length > 0 && replies[0].replaceAllText) {
      return replies[0].replaceAllText.occurrencesChanged || 0;
    }
    return 0;
  }

  public async insertTable(
    documentId: string,
    rows: number,
    columns: number,
    index: number
  ): Promise<void> {
    await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertTable: {
              rows,
              columns,
              location: { index },
            },
          },
        ],
      },
    });
  }

  public async updateDocumentStyle(
    documentId: string,
    style: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontSize?: number;
    },
    startIndex: number,
    endIndex: number
  ): Promise<void> {
    const textStyle: docs_v1.Schema$TextStyle = {};
    const fields: string[] = [];

    if (style.bold !== undefined) {
      textStyle.bold = style.bold;
      fields.push("bold");
    }
    if (style.italic !== undefined) {
      textStyle.italic = style.italic;
      fields.push("italic");
    }
    if (style.underline !== undefined) {
      textStyle.underline = style.underline;
      fields.push("underline");
    }
    if (style.fontSize !== undefined) {
      textStyle.fontSize = {
        magnitude: style.fontSize,
        unit: "PT",
      };
      fields.push("fontSize");
    }

    await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            updateTextStyle: {
              range: {
                startIndex,
                endIndex,
              },
              textStyle,
              fields: fields.join(","),
            },
          },
        ],
      },
    });
  }

  public async listDocuments(pageSize = 50, pageToken?: string): Promise<{
    documents: Array<{ id: string; name: string; modifiedTime?: string }>;
    nextPageToken?: string;
  }> {
    const result = await this.drive.listFiles({
      pageSize,
      pageToken,
      query: "mimeType = 'application/vnd.google-apps.document'",
      orderBy: "modifiedTime desc",
    });

    return {
      documents: result.files.map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      })),
      nextPageToken: result.nextPageToken,
    };
  }
}

