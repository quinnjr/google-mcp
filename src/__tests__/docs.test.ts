import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "googleapis";

// Mock functions
const mockDocsCreate = vi.fn();
const mockDocsGet = vi.fn();
const mockDocsBatchUpdate = vi.fn();
const mockFilesList = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesUpdate = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    docs: () => ({
      documents: {
        create: mockDocsCreate,
        get: mockDocsGet,
        batchUpdate: mockDocsBatchUpdate,
      },
    }),
    drive: () => ({
      files: {
        list: mockFilesList,
        get: mockFilesGet,
        update: mockFilesUpdate,
      },
    }),
  },
}));

import { DocsService } from "../services/docs.js";

describe("DocsService", () => {
  let service: DocsService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocsService(mockAuth);
  });

  describe("createDocument", () => {
    it("should create empty document", async () => {
      mockDocsCreate.mockResolvedValue({
        data: { documentId: "doc1", title: "New Doc" },
      });

      const result = await service.createDocument("New Doc");

      expect(mockDocsCreate).toHaveBeenCalled();
      expect(result.documentId).toBe("doc1");
      expect(result.title).toBe("New Doc");
    });

    it("should create document with content", async () => {
      mockDocsCreate.mockResolvedValue({
        data: { documentId: "doc1", title: "Doc" },
      });
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      const result = await service.createDocument("Doc", "Initial content");

      expect(mockDocsBatchUpdate).toHaveBeenCalled();
      expect(result.body).toBe("Initial content");
    });

    it("should move document to folder", async () => {
      mockDocsCreate.mockResolvedValue({
        data: { documentId: "doc1", title: "Doc" },
      });
      mockFilesGet.mockResolvedValue({ data: { parents: [] } });
      mockFilesUpdate.mockResolvedValue({
        data: { id: "doc1", name: "Doc", mimeType: "application/vnd.google-apps.document" },
      });

      await service.createDocument("Doc", undefined, "folder1");

      expect(mockFilesUpdate).toHaveBeenCalled();
    });
  });

  describe("getDocument", () => {
    it("should get document with text", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          documentId: "doc1",
          title: "Test",
          revisionId: "rev1",
          body: {
            content: [
              { paragraph: { elements: [{ textRun: { content: "Hello " } }, { textRun: { content: "World" } }] } },
            ],
          },
        },
      });

      const result = await service.getDocument("doc1");

      expect(result.documentId).toBe("doc1");
      expect(result.body).toBe("Hello World");
    });

    it("should handle empty document", async () => {
      mockDocsGet.mockResolvedValue({
        data: { documentId: "doc1", title: "Empty", body: { content: [] } },
      });

      const result = await service.getDocument("doc1");

      expect(result.body).toBe("");
    });

    it("should extract text from tables", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          documentId: "doc1",
          title: "Table Doc",
          body: {
            content: [{
              table: {
                tableRows: [{
                  tableCells: [{
                    content: [{ paragraph: { elements: [{ textRun: { content: "Cell" } }] } }],
                  }],
                }],
              },
            }],
          },
        },
      });

      const result = await service.getDocument("doc1");

      expect(result.body).toContain("Cell");
    });
  });

  describe("insertText", () => {
    it("should insert text at index", async () => {
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      await service.insertText("doc1", "New text", 10);

      expect(mockDocsBatchUpdate).toHaveBeenCalledWith({
        documentId: "doc1",
        requestBody: {
          requests: [{ insertText: { location: { index: 10 }, text: "New text" } }],
        },
      });
    });
  });

  describe("appendText", () => {
    it("should append text to end", async () => {
      mockDocsGet.mockResolvedValue({
        data: { body: { content: [{ endIndex: 50 }] } },
      });
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      await service.appendText("doc1", "Appended");

      expect(mockDocsBatchUpdate).toHaveBeenCalled();
    });

    it("should handle empty document", async () => {
      mockDocsGet.mockResolvedValue({
        data: { body: { content: [] } },
      });
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      await service.appendText("doc1", "First text");

      expect(mockDocsBatchUpdate).toHaveBeenCalledWith({
        documentId: "doc1",
        requestBody: {
          requests: [{ insertText: { location: { index: 1 }, text: "First text" } }],
        },
      });
    });
  });

  describe("deleteContent", () => {
    it("should delete content range", async () => {
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      await service.deleteContent("doc1", 5, 20);

      expect(mockDocsBatchUpdate).toHaveBeenCalledWith({
        documentId: "doc1",
        requestBody: {
          requests: [{ deleteContentRange: { range: { startIndex: 5, endIndex: 20 } } }],
        },
      });
    });
  });

  describe("replaceAllText", () => {
    it("should replace all occurrences", async () => {
      mockDocsBatchUpdate.mockResolvedValue({
        data: { replies: [{ replaceAllText: { occurrencesChanged: 3 } }] },
      });

      const count = await service.replaceAllText("doc1", "old", "new");

      expect(count).toBe(3);
    });

    it("should return 0 when no replacements", async () => {
      mockDocsBatchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const count = await service.replaceAllText("doc1", "notfound", "new");

      expect(count).toBe(0);
    });
  });

  describe("insertTable", () => {
    it("should insert table", async () => {
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      await service.insertTable("doc1", 3, 4, 10);

      expect(mockDocsBatchUpdate).toHaveBeenCalledWith({
        documentId: "doc1",
        requestBody: {
          requests: [{ insertTable: { rows: 3, columns: 4, location: { index: 10 } } }],
        },
      });
    });
  });

  describe("updateDocumentStyle", () => {
    it("should apply text style", async () => {
      mockDocsBatchUpdate.mockResolvedValue({ data: {} });

      await service.updateDocumentStyle("doc1", { bold: true, fontSize: 14 }, 0, 10);

      expect(mockDocsBatchUpdate).toHaveBeenCalledWith({
        documentId: "doc1",
        requestBody: {
          requests: [{
            updateTextStyle: {
              range: { startIndex: 0, endIndex: 10 },
              textStyle: { bold: true, fontSize: { magnitude: 14, unit: "PT" } },
              fields: "bold,fontSize",
            },
          }],
        },
      });
    });
  });

  describe("listDocuments", () => {
    it("should list Google Docs", async () => {
      mockFilesList.mockResolvedValue({
        data: {
          files: [{ id: "doc1", name: "Doc 1", mimeType: "application/vnd.google-apps.document", modifiedTime: "2024-01-01" }],
          nextPageToken: "token",
        },
      });

      const result = await service.listDocuments();

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].id).toBe("doc1");
    });
  });
});
