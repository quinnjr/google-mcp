import { z } from "zod";

// OAuth Configuration
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface TokenData {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type: string;
  scope: string;
}

// Google Drive Types
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  owners?: Array<{ displayName: string; emailAddress: string }>;
}

export interface DriveListOptions {
  pageSize?: number;
  pageToken?: string;
  query?: string;
  orderBy?: string;
  folderId?: string;
}

// Google Docs Types
export interface DocContent {
  documentId: string;
  title: string;
  body?: string;
  revisionId?: string;
}

export interface DocCreateOptions {
  title: string;
  content?: string;
  folderId?: string;
}

export interface DocUpdateOptions {
  documentId: string;
  operations: DocOperation[];
}

export type DocOperation =
  | { type: "insertText"; text: string; index: number }
  | { type: "deleteContent"; startIndex: number; endIndex: number }
  | { type: "replaceText"; text: string; startIndex: number; endIndex: number };

// Google Sheets Types
export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  sheets: SheetInfo[];
  spreadsheetUrl: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface SheetRange {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
}

export interface SheetCreateOptions {
  title: string;
  sheets?: string[];
  folderId?: string;
}

export interface SheetUpdateOptions {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
  valueInputOption?: "RAW" | "USER_ENTERED";
}

// Google Tasks (Keep alternative) Types
export interface TaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due?: string;
  completed?: string;
  parent?: string;
  position?: string;
}

export interface TaskCreateOptions {
  taskListId: string;
  title: string;
  notes?: string;
  due?: string;
}

export interface TaskUpdateOptions {
  taskListId: string;
  taskId: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
}

// Zod Schemas for validation
export const DriveListOptionsSchema = z.object({
  pageSize: z.number().min(1).max(1000).optional().default(50),
  pageToken: z.string().optional(),
  query: z.string().optional(),
  orderBy: z.string().optional(),
  folderId: z.string().optional(),
});

export const DocCreateOptionsSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  folderId: z.string().optional(),
});

export const DocReadOptionsSchema = z.object({
  documentId: z.string().min(1),
});

export const DocUpdateTextSchema = z.object({
  documentId: z.string().min(1),
  text: z.string(),
  index: z.number().min(1),
});

export const DocReplaceTextSchema = z.object({
  documentId: z.string().min(1),
  searchText: z.string().min(1),
  replaceText: z.string(),
  matchCase: z.boolean().optional().default(true),
});

export const SheetCreateOptionsSchema = z.object({
  title: z.string().min(1),
  sheets: z.array(z.string()).optional(),
  folderId: z.string().optional(),
});

export const SheetReadOptionsSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().optional(),
});

export const SheetUpdateOptionsSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
  values: z.array(z.array(z.unknown())),
  valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().default("USER_ENTERED"),
});

export const SheetAppendOptionsSchema = z.object({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
  values: z.array(z.array(z.unknown())),
  valueInputOption: z.enum(["RAW", "USER_ENTERED"]).optional().default("USER_ENTERED"),
});

export const TaskListCreateSchema = z.object({
  title: z.string().min(1),
});

export const TaskCreateOptionsSchema = z.object({
  taskListId: z.string().min(1),
  title: z.string().min(1),
  notes: z.string().optional(),
  due: z.string().optional(),
});

export const TaskUpdateOptionsSchema = z.object({
  taskListId: z.string().min(1),
  taskId: z.string().min(1),
  title: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["needsAction", "completed"]).optional(),
  due: z.string().optional(),
});

export const DriveDownloadSchema = z.object({
  fileId: z.string().min(1),
  savePath: z.string().min(1).optional(),
  encoding: z.enum(["text", "base64"]).optional(),
  exportMimeType: z.string().optional(),
});

// Exactly one of `content` or `path`. The rule lives here rather than only in
// resolveFileSource so zod rejects it at the edge with a message naming the
// field, and so every schema built on it inherits the same contract.
const fileSourceShape = {
  content: z.string().optional(),
  encoding: z.enum(["text", "base64"]).optional(),
  path: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  mimeType: z.string().optional(),
};

const exactlyOneSource = (value: { content?: string; path?: string }): boolean =>
  (value.content !== undefined) !== (value.path !== undefined);

const ONE_SOURCE_MESSAGE =
  "Provide exactly one of `content` (inline) or `path` (local file).";

export const FileSourceSchema = z
  .object(fileSourceShape)
  .refine(exactlyOneSource, { message: ONE_SOURCE_MESSAGE });

export const DriveUploadSchema = z
  .object({
    ...fileSourceShape,
    name: z.string().min(1).optional(),
    folderId: z.string().optional(),
  })
  .refine(exactlyOneSource, { message: ONE_SOURCE_MESSAGE });

export const DriveUpdateFileSchema = z
  .object({
    ...fileSourceShape,
    fileId: z.string().min(1),
  })
  .refine(exactlyOneSource, { message: ONE_SOURCE_MESSAGE });

export const GmailGetAttachmentSchema = z.object({
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
  savePath: z.string().min(1).optional(),
});

// The send/reply handlers used to cast `args` and validate only the new
// attachments array, leaving every address field unchecked in the same
// handler that had just been hardened against header injection.
export const GmailSendSchema = z.object({
  to: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  isHtml: z.boolean().optional(),
  attachments: z.array(FileSourceSchema).optional(),
});

export const GmailReplySchema = z.object({
  messageId: z.string().min(1),
  body: z.string(),
  isHtml: z.boolean().optional(),
  attachments: z.array(FileSourceSchema).optional(),
});

export const DriveDeleteSchema = z.object({
  fileId: z.string().min(1),
});

export const DriveCreateFolderSchema = z.object({
  name: z.string().min(1),
  parentFolderId: z.string().optional(),
});

export const DriveSearchSchema = z.object({
  query: z.string().min(1),
  pageSize: z.number().min(1).max(1000).optional().default(50),
  pageToken: z.string().optional(),
});

