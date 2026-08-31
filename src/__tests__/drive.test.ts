import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Auth } from "googleapis";

// Mock the entire googleapis module
const mockFilesList = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesCreate = vi.fn();
const mockFilesUpdate = vi.fn();
const mockFilesDelete = vi.fn();
const mockFilesCopy = vi.fn();
const mockFilesExport = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    drive: () => ({
      files: {
        list: mockFilesList,
        get: mockFilesGet,
        create: mockFilesCreate,
        update: mockFilesUpdate,
        delete: mockFilesDelete,
        copy: mockFilesCopy,
        export: mockFilesExport,
      },
    }),
  },
}));

// Import after mocking
import { DriveService } from "../services/drive.js";

describe("DriveService", () => {
  let service: DriveService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DriveService(mockAuth);
  });

  describe("listFiles", () => {
    it("should list files with default options", async () => {
      mockFilesList.mockResolvedValue({
        data: {
          files: [
            { id: "f1", name: "File1.txt", mimeType: "text/plain" },
          ],
          nextPageToken: "token",
        },
      });

      const result = await service.listFiles();

      expect(mockFilesList).toHaveBeenCalled();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].id).toBe("f1");
    });

    it("should handle empty results", async () => {
      mockFilesList.mockResolvedValue({ data: { files: null } });

      const result = await service.listFiles();

      expect(result.files).toHaveLength(0);
    });

    it("should pass custom options", async () => {
      mockFilesList.mockResolvedValue({ data: { files: [] } });

      await service.listFiles({ pageSize: 10, folderId: "folder1" });

      expect(mockFilesList).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 10 })
      );
    });
  });

  describe("getFile", () => {
    it("should get file by ID", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "Test.txt", mimeType: "text/plain" },
      });

      const result = await service.getFile("f1");

      expect(mockFilesGet).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: "f1" })
      );
      expect(result.id).toBe("f1");
    });
  });

  describe("downloadFile", () => {
    it("should download regular file content", async () => {
      mockFilesGet
        .mockResolvedValueOnce({ data: { id: "f1", name: "test.txt", mimeType: "text/plain" } })
        .mockResolvedValueOnce({ data: "File content" });

      const result = await service.downloadFile("f1");

      expect(result.content).toBe("File content");
      expect(result.encoding).toBe("text");
    });

    it("should export Google Docs as text", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "Doc", mimeType: "application/vnd.google-apps.document" },
      });
      mockFilesExport.mockResolvedValue({ data: "Document text" });

      const result = await service.downloadFile("f1");

      expect(mockFilesExport).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "text/plain" }),
        expect.any(Object)
      );
      expect(result.content).toBe("Document text");
    });

    it("should export Google Sheets as CSV", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
      });
      mockFilesExport.mockResolvedValue({ data: "a,b\n1,2" });

      const result = await service.downloadFile("f1");

      expect(mockFilesExport).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "text/csv" }),
        expect.any(Object)
      );
      expect(result.content).toBe("a,b\n1,2");
    });
  });

  describe("uploadFile", () => {
    it("should upload file", async () => {
      mockFilesCreate.mockResolvedValue({
        data: { id: "new1", name: "uploaded.txt", mimeType: "text/plain" },
      });

      const result = await service.uploadFile({ name: "uploaded.txt", content: "content" });

      expect(mockFilesCreate).toHaveBeenCalled();
      expect(result.id).toBe("new1");
    });

    it("should upload to folder", async () => {
      mockFilesCreate.mockResolvedValue({
        data: { id: "new1", name: "test.txt", mimeType: "text/plain" },
      });

      await service.uploadFile({
        name: "test.txt",
        content: "content",
        mimeType: "text/plain",
        folderId: "folder1",
      });

      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ parents: ["folder1"] }),
        }),
        expect.anything()
      );
    });
  });

  describe("updateFile", () => {
    it("should update file content", async () => {
      mockFilesUpdate.mockResolvedValue({
        data: { id: "f1", name: "updated.txt", mimeType: "text/plain" },
      });

      const result = await service.updateFile("f1", { content: "new content" });

      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: "f1" }),
        expect.anything()
      );
      expect(result.id).toBe("f1");
    });
  });

  describe("binary transfer", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "gmcp-drive-"));
      process.env.GOOGLE_MCP_FILE_ROOT = root;
    });

    afterEach(() => {
      delete process.env.GOOGLE_MCP_FILE_ROOT;
      rmSync(root, { recursive: true, force: true });
    });

    it("should download binary files as base64", async () => {
      mockFilesGet
        .mockResolvedValueOnce({
          data: { id: "f1", name: "a.png", mimeType: "image/png", size: "3" },
        })
        .mockResolvedValueOnce({ data: new Uint8Array([0xff, 0xd8, 0x00]).buffer });

      const result = await service.downloadFile("f1", { encoding: "base64" });

      expect(mockFilesGet).toHaveBeenLastCalledWith(
        expect.objectContaining({ alt: "media" }),
        expect.objectContaining({ responseType: "arraybuffer" })
      );
      expect(result.encoding).toBe("base64");
      expect(Buffer.from(result.content!, "base64")).toEqual(
        Buffer.from([0xff, 0xd8, 0x00])
      );
    });

    it("should fetch a non-text export as bytes rather than text", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "Doc", mimeType: "application/vnd.google-apps.document" },
      });
      mockFilesExport.mockResolvedValue({
        data: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
      });

      const result = await service.downloadFile("f1", {
        exportMimeType: "application/pdf",
      });

      expect(mockFilesExport).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "application/pdf" }),
        expect.objectContaining({ responseType: "arraybuffer" })
      );
      expect(result.mimeType).toBe("application/pdf");
      expect(result.encoding).toBe("base64");
      expect(Buffer.from(result.content!, "base64").toString("latin1")).toBe("%PDF");
    });

    it("should still export a text format as text", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "Doc", mimeType: "application/vnd.google-apps.document" },
      });
      mockFilesExport.mockResolvedValue({ data: "Document text" });

      const result = await service.downloadFile("f1", { exportMimeType: "text/plain" });

      expect(mockFilesExport).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "text/plain" }),
        expect.objectContaining({ responseType: "text" })
      );
      expect(result.content).toBe("Document text");
    });

    it("should export a Workspace file to disk as bytes", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
      });
      mockFilesExport.mockResolvedValue({
        data: new TextEncoder().encode("a,b\n1,2").buffer,
      });

      const result = await service.downloadFile("f1", { savePath: "sheet.csv" });

      expect(mockFilesExport).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "text/csv" }),
        expect.objectContaining({ responseType: "arraybuffer" })
      );
      expect(result.path).toBe(join(root, "sheet.csv"));
      expect(readFileSync(result.path!, "utf-8")).toBe("a,b\n1,2");
    });

    it("should reject exportMimeType on a file that is not a Workspace document", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "a.png", mimeType: "image/png" },
      });

      await expect(
        service.downloadFile("f1", { exportMimeType: "application/pdf" })
      ).rejects.toThrow(/only applies to Google Workspace files/);
    });

    it("should write to savePath instead of returning content", async () => {
      mockFilesGet
        .mockResolvedValueOnce({
          data: { id: "f1", name: "a.bin", mimeType: "application/octet-stream", size: "5" },
        })
        .mockResolvedValueOnce({ data: new TextEncoder().encode("bytes").buffer });

      const result = await service.downloadFile("f1", { savePath: "a.bin" });

      expect(result.content).toBeUndefined();
      expect(result.path).toBe(join(root, "a.bin"));
      expect(readFileSync(result.path!, "utf-8")).toBe("bytes");
    });

    it("should refuse a savePath outside the file root", async () => {
      mockFilesGet.mockResolvedValue({
        data: { id: "f1", name: "a.bin", mimeType: "application/octet-stream", size: "5" },
      });

      await expect(
        service.downloadFile("f1", { savePath: "/etc/cron.d/pwn" })
      ).rejects.toThrow(/must stay inside/);
    });

    it("should refuse to inline a file over the inline cap", async () => {
      mockFilesGet.mockResolvedValue({
        data: {
          id: "f1",
          name: "big.bin",
          mimeType: "application/octet-stream",
          size: String(5 * 1024 * 1024),
        },
      });

      await expect(
        service.downloadFile("f1", { encoding: "base64" })
      ).rejects.toThrow(/over the 1048576 byte limit/);
      // The bytes must never be requested, let alone buffered.
      expect(mockFilesGet).toHaveBeenCalledTimes(1);
    });

    it("should refuse a file over the disk cap even with savePath", async () => {
      mockFilesGet.mockResolvedValue({
        data: {
          id: "f1",
          name: "huge.bin",
          mimeType: "application/octet-stream",
          size: String(30 * 1024 * 1024),
        },
      });

      await expect(
        service.downloadFile("f1", { savePath: "huge.bin" })
      ).rejects.toThrow(/over the 26214400 byte limit/);
    });

    it("should reject a response with no readable body", async () => {
      mockFilesGet
        .mockResolvedValueOnce({
          data: { id: "f1", name: "a.bin", mimeType: "application/octet-stream", size: "5" },
        })
        .mockResolvedValueOnce({ data: undefined });

      await expect(
        service.downloadFile("f1", { encoding: "base64" })
      ).rejects.toThrow(/no readable body/);
    });

    it("should upload from a local path with a binary mime type", async () => {
      writeFileSync(join(root, "photo.png"), "from disk");
      mockFilesCreate.mockResolvedValue({
        data: { id: "new1", name: "photo.png", mimeType: "image/png" },
      });

      await service.uploadFile({ path: "photo.png" });

      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ name: "photo.png" }),
          // A path source is bytes, not text - labelling it text/plain is what
          // made the round-trip corrupt binary files.
          media: expect.objectContaining({ mimeType: "application/octet-stream" }),
        }),
        expect.anything()
      );
    });

    it("should keep text/plain for inline text content", async () => {
      mockFilesCreate.mockResolvedValue({
        data: { id: "new1", name: "notes.txt", mimeType: "text/plain" },
      });

      await service.uploadFile({ name: "notes.txt", content: "hello" });

      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          media: expect.objectContaining({ mimeType: "text/plain" }),
        }),
        expect.anything()
      );
    });

    it("should honour an explicit mime type", async () => {
      writeFileSync(join(root, "a.png"), "x");
      mockFilesCreate.mockResolvedValue({
        data: { id: "new1", name: "a.png", mimeType: "image/png" },
      });

      await service.uploadFile({ path: "a.png", mimeType: "image/png" });

      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          media: expect.objectContaining({ mimeType: "image/png" }),
        }),
        expect.anything()
      );
    });

    it("should refuse to upload a file outside the file root", async () => {
      await expect(service.uploadFile({ path: "/etc/passwd" })).rejects.toThrow(
        /must stay inside/
      );
      expect(mockFilesCreate).not.toHaveBeenCalled();
    });

    it("should update an existing file from a local path", async () => {
      writeFileSync(join(root, "revised.bin"), "revised bytes");
      mockFilesUpdate.mockResolvedValue({
        data: { id: "f1", name: "revised.bin", mimeType: "application/octet-stream" },
      });

      const result = await service.updateFile("f1", { path: "revised.bin" });

      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: "f1",
          media: expect.objectContaining({ mimeType: "application/octet-stream" }),
        }),
        expect.anything()
      );
      expect(result.id).toBe("f1");
    });

    it("should reject a source with neither content nor path", async () => {
      await expect(service.uploadFile({ name: "x" })).rejects.toThrow(
        /exactly one/
      );
    });

    it("should reject a source with both content and path", async () => {
      await expect(
        service.uploadFile({ content: "a", path: "x" })
      ).rejects.toThrow(/exactly one/);
    });
  });

  describe("deleteFile", () => {
    it("should delete file", async () => {
      mockFilesDelete.mockResolvedValue({});

      await service.deleteFile("f1");

      expect(mockFilesDelete).toHaveBeenCalledWith({ fileId: "f1" });
    });
  });

  describe("createFolder", () => {
    it("should create folder", async () => {
      mockFilesCreate.mockResolvedValue({
        data: { id: "folder1", name: "New Folder", mimeType: "application/vnd.google-apps.folder" },
      });

      const result = await service.createFolder("New Folder");

      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            mimeType: "application/vnd.google-apps.folder",
          }),
        })
      );
      expect(result.mimeType).toBe("application/vnd.google-apps.folder");
    });
  });

  describe("search", () => {
    it("should search files", async () => {
      mockFilesList.mockResolvedValue({
        data: { files: [{ id: "f1", name: "Match.txt", mimeType: "text/plain" }] },
      });

      const result = await service.search("Match");

      expect(mockFilesList).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringContaining("Match"),
        })
      );
      expect(result.files).toHaveLength(1);
    });

    it("should escape single quotes", async () => {
      mockFilesList.mockResolvedValue({ data: { files: [] } });

      await service.search("John's file");

      expect(mockFilesList).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringContaining("\\'"),
        })
      );
    });
  });

  describe("moveFile", () => {
    it("should move file to new folder", async () => {
      mockFilesGet.mockResolvedValue({ data: { parents: ["old"] } });
      mockFilesUpdate.mockResolvedValue({
        data: { id: "f1", name: "file.txt", mimeType: "text/plain" },
      });

      await service.moveFile("f1", "new");

      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          addParents: "new",
          removeParents: "old",
        })
      );
    });
  });

  describe("copyFile", () => {
    it("should copy file", async () => {
      mockFilesCopy.mockResolvedValue({
        data: { id: "copy1", name: "Copy.txt", mimeType: "text/plain" },
      });

      const result = await service.copyFile("f1", "Copy.txt");

      expect(mockFilesCopy).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: "f1" })
      );
      expect(result.id).toBe("copy1");
    });
  });

  describe("renameFile", () => {
    it("should rename file", async () => {
      mockFilesUpdate.mockResolvedValue({
        data: { id: "f1", name: "NewName.txt", mimeType: "text/plain" },
      });

      const result = await service.renameFile("f1", "NewName.txt");

      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: { name: "NewName.txt" },
        })
      );
      expect(result.name).toBe("NewName.txt");
    });
  });
});
