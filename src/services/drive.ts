import { Readable } from "node:stream";
import { google, type drive_v3, type Auth } from "googleapis";
import { type DriveFile, type DriveListOptions } from "../types/index.js";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_INLINE_BYTES,
  REQUEST_TIMEOUT_MS,
  assertSavePath,
  resolveFileSource,
  saveTo,
  type FileSource,
} from "./attachments.js";

export interface DriveDownloadOptions {
  /** Write the bytes here instead of returning them. */
  savePath?: string;
  /** "base64" for binary files; "text" (default) for text. Implied by savePath. */
  encoding?: "text" | "base64";
  /** Export format for Google Workspace files, e.g. application/pdf. */
  exportMimeType?: string;
}

export interface DriveDownloadResult {
  name: string;
  mimeType: string;
  size: number;
  /** Present unless savePath was given. */
  content?: string;
  encoding?: "text" | "base64";
  /** Absolute path written, when savePath was given. */
  path?: string;
}

// `filename` is FileSource's mail-attachment concept; a Drive upload names
// the file with `name`. Keeping both would let a caller set the one that is
// silently ignored.
export interface DriveUploadOptions extends Omit<FileSource, "filename"> {
  /** Name in Drive. Defaults to the basename of `path`. */
  name?: string;
  folderId?: string;
}

// Drive's default export target per Workspace type. Overridable so a Doc can
// come back as PDF or .docx rather than only ever as flat text.
const DEFAULT_EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export class DriveService {
  private readonly drive: drive_v3.Drive;

  constructor(authClient: Auth.OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth: authClient });
  }

  public async listFiles(options: DriveListOptions = {}): Promise<{
    files: DriveFile[];
    nextPageToken?: string;
  }> {
    const { pageSize = 50, pageToken, query, orderBy, folderId } = options;

    let q = "trashed = false";

    if (folderId) {
      q += ` and '${folderId}' in parents`;
    }

    if (query) {
      q += ` and ${query}`;
    }

    const response = await this.drive.files.list({
      pageSize,
      pageToken,
      q,
      orderBy: orderBy || "modifiedTime desc",
      fields: "nextPageToken, files(id, name, mimeType, parents, webViewLink, createdTime, modifiedTime, size, owners)",
    });

    const files: DriveFile[] = (response.data.files || []).map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      parents: file.parents || undefined,
      webViewLink: file.webViewLink || undefined,
      createdTime: file.createdTime || undefined,
      modifiedTime: file.modifiedTime || undefined,
      size: file.size || undefined,
      owners: file.owners?.map((o) => ({
        displayName: o.displayName || "",
        emailAddress: o.emailAddress || "",
      })),
    }));

    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getFile(fileId: string): Promise<DriveFile> {
    const response = await this.drive.files.get({
      fileId,
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime, size, owners",
    });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
      size: response.data.size || undefined,
      owners: response.data.owners?.map((o) => ({
        displayName: o.displayName || "",
        emailAddress: o.emailAddress || "",
      })),
    };
  }

  public async downloadFile(
    fileId: string,
    options: DriveDownloadOptions = {}
  ): Promise<DriveDownloadResult> {
    // Before anything is fetched: a bad savePath should not cost a download.
    if (options.savePath) {
      await assertSavePath(options.savePath);
    }

    const file = await this.getFile(fileId);
    const isWorkspaceFile = file.mimeType.startsWith("application/vnd.google-apps.");

    if (options.exportMimeType && !isWorkspaceFile) {
      throw new Error(
        "exportMimeType only applies to Google Workspace files; this file is downloaded as-is."
      );
    }

    const exportMimeType = isWorkspaceFile
      ? options.exportMimeType || DEFAULT_EXPORTS[file.mimeType] || "text/plain"
      : undefined;
    const mimeType = exportMimeType || file.mimeType;

    // Text is only safe to ask for when the result really is text. Anything
    // headed to disk, to base64, or exported to a binary format like PDF must
    // come over as bytes, or the response parser replaces every invalid UTF-8
    // byte before we ever see it.
    const wantsBinary =
      Boolean(options.savePath) ||
      options.encoding === "base64" ||
      !mimeType.startsWith("text/");

    // The size is already known from the metadata call, so an oversized file
    // is refused before its bytes are ever buffered into this process.
    const declared = Number(file.size ?? 0);
    const limit = options.savePath ? MAX_ATTACHMENT_BYTES : MAX_INLINE_BYTES;
    if (declared > limit) {
      throw new Error(
        `File is ${declared} bytes, over the ${limit} byte limit.` +
          (options.savePath ? "" : " Pass savePath to write it to disk instead.")
      );
    }

    if (!wantsBinary) {
      // Literal responseType per call site, so googleapis' own overloads type
      // response.data and no cast is needed to read it.
      const response = exportMimeType
        ? await this.drive.files.export(
            { fileId, mimeType: exportMimeType },
            { responseType: "text", timeout: REQUEST_TIMEOUT_MS }
          )
        : await this.drive.files.get(
            { fileId, alt: "media" },
            { responseType: "text", timeout: REQUEST_TIMEOUT_MS }
          );
      const content = typeof response.data === "string" ? response.data : "";
      return {
        name: file.name,
        mimeType,
        size: Buffer.byteLength(content),
        content,
        encoding: "text",
      };
    }

    const response = exportMimeType
      ? await this.drive.files.export(
          { fileId, mimeType: exportMimeType },
          { responseType: "arraybuffer", timeout: REQUEST_TIMEOUT_MS }
        )
      : await this.drive.files.get(
          { fileId, alt: "media" },
          { responseType: "arraybuffer", timeout: REQUEST_TIMEOUT_MS }
        );

    const body = response.data;
    if (!(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && !Buffer.isBuffer(body)) {
      throw new Error(`Drive returned no readable body for file ${fileId}.`);
    }
    const buffer = Buffer.isBuffer(body)
      ? body
      : Buffer.from(body as ArrayBuffer);

    // An export has no size in the metadata, so the converted bytes are the
    // first chance to check a PDF render that ballooned past the cap.
    if (buffer.byteLength > limit) {
      throw new Error(
        `File is ${buffer.byteLength} bytes, over the ${limit} byte limit.` +
          (options.savePath ? "" : " Pass savePath to write it to disk instead.")
      );
    }

    if (options.savePath) {
      return {
        name: file.name,
        mimeType,
        size: buffer.byteLength,
        path: await saveTo(options.savePath, buffer),
      };
    }

    return {
      name: file.name,
      mimeType,
      size: buffer.byteLength,
      content: buffer.toString("base64"),
      encoding: "base64",
    };
  }

  public async uploadFile(options: DriveUploadOptions): Promise<DriveFile> {
    const file = await resolveFileSource(options, "text", "upload");

    const response = await this.drive.files.create({
      requestBody: {
        name: options.name?.trim() || file.filename,
        parents: options.folderId ? [options.folderId] : undefined,
      },
      media: {
        mimeType: file.mimeType,
        // A Buffer would be sent as its JSON form; a stream uploads the bytes.
        body: Readable.from(file.data),
      },
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
    }, { timeout: REQUEST_TIMEOUT_MS });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
    };
  }

  public async updateFile(
    fileId: string,
    source: FileSource
  ): Promise<DriveFile> {
    const file = await resolveFileSource(source, "text", "update");

    const response = await this.drive.files.update({
      fileId,
      media: {
        mimeType: file.mimeType,
        body: Readable.from(file.data),
      },
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
    }, { timeout: REQUEST_TIMEOUT_MS });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
    };
  }

  public async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  public async createFolder(name: string, parentFolderId?: string): Promise<DriveFile> {
    const fileMetadata: drive_v3.Schema$File = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
    });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
    };
  }

  public async search(query: string, pageSize = 50, pageToken?: string): Promise<{
    files: DriveFile[];
    nextPageToken?: string;
  }> {
    const response = await this.drive.files.list({
      pageSize,
      pageToken,
      q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id, name, mimeType, parents, webViewLink, createdTime, modifiedTime, size)",
    });

    const files: DriveFile[] = (response.data.files || []).map((file) => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      parents: file.parents || undefined,
      webViewLink: file.webViewLink || undefined,
      createdTime: file.createdTime || undefined,
      modifiedTime: file.modifiedTime || undefined,
      size: file.size || undefined,
    }));

    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async moveFile(fileId: string, newFolderId: string): Promise<DriveFile> {
    // Get current parents
    const file = await this.drive.files.get({
      fileId,
      fields: "parents",
    });

    const previousParents = file.data.parents?.join(",") || "";

    const response = await this.drive.files.update({
      fileId,
      addParents: newFolderId,
      removeParents: previousParents,
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
    });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
    };
  }

  public async copyFile(fileId: string, newName?: string, folderId?: string): Promise<DriveFile> {
    const requestBody: drive_v3.Schema$File = {};

    if (newName) {
      requestBody.name = newName;
    }

    if (folderId) {
      requestBody.parents = [folderId];
    }

    const response = await this.drive.files.copy({
      fileId,
      requestBody,
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
    });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
    };
  }

  public async renameFile(fileId: string, newName: string): Promise<DriveFile> {
    const response = await this.drive.files.update({
      fileId,
      requestBody: { name: newName },
      fields: "id, name, mimeType, parents, webViewLink, createdTime, modifiedTime",
    });

    return {
      id: response.data.id!,
      name: response.data.name!,
      mimeType: response.data.mimeType!,
      parents: response.data.parents || undefined,
      webViewLink: response.data.webViewLink || undefined,
      createdTime: response.data.createdTime || undefined,
      modifiedTime: response.data.modifiedTime || undefined,
    };
  }
}

