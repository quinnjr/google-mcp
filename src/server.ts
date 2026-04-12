import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { oauth, GoogleOAuth } from "./auth/oauth.js";
import { DriveService } from "./services/drive.js";
import { DocsService } from "./services/docs.js";
import { SheetsService } from "./services/sheets.js";
import { TasksService } from "./services/tasks.js";
import { CalendarService } from "./services/calendar.js";
import { GmailService } from "./services/gmail.js";
import { PeopleService } from "./services/people.js";
import { YouTubeService } from "./services/youtube.js";
import { SlidesService } from "./services/slides.js";
import { FormsService } from "./services/forms.js";
import { ChatService } from "./services/chat.js";
import { MeetService } from "./services/meet.js";
import {
  DriveListOptionsSchema,
  DocCreateOptionsSchema,
  DocReadOptionsSchema,
  DocUpdateTextSchema,
  DocReplaceTextSchema,
  SheetCreateOptionsSchema,
  SheetReadOptionsSchema,
  SheetUpdateOptionsSchema,
  SheetAppendOptionsSchema,
  TaskListCreateSchema,
  TaskCreateOptionsSchema,
  TaskUpdateOptionsSchema,
  DriveDownloadSchema,
  DriveUploadSchema,
  DriveDeleteSchema,
  DriveCreateFolderSchema,
  DriveSearchSchema,
} from "./types/index.js";

export class GoogleWorkspaceMCPServer {
  private readonly server: Server;
  private drive: DriveService | null = null;
  private docs: DocsService | null = null;
  private sheets: SheetsService | null = null;
  private tasks: TasksService | null = null;
  private calendar: CalendarService | null = null;
  private gmail: GmailService | null = null;
  private people: PeopleService | null = null;
  private youtube: YouTubeService | null = null;
  private slidesService: SlidesService | null = null;
  private forms: FormsService | null = null;
  private chat: ChatService | null = null;
  private meet: MeetService | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "google-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private initializeServices(): void {
    const client = oauth.getClient();
    if (client) {
      this.drive = new DriveService(client);
      this.docs = new DocsService(client);
      this.sheets = new SheetsService(client);
      this.tasks = new TasksService(client);
      this.calendar = new CalendarService(client);
      this.gmail = new GmailService(client);
      this.people = new PeopleService(client);
      this.youtube = new YouTubeService(client);
      this.slidesService = new SlidesService(client);
      this.forms = new FormsService(client);
      this.chat = new ChatService(client);
      this.meet = new MeetService(client);
    }
  }

  private ensureAuthenticated(): void {
    if (!oauth.isReady()) {
      throw new Error(
        "Not authenticated. Please authenticate first using the google_auth tool or place credentials at " +
          oauth.getCredentialsPath()
      );
    }
    if (!this.drive) {
      this.initializeServices();
    }
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // Authentication Tools
          {
            name: "google_auth",
            description:
              "Authenticate with Google. Call this first if other tools return authentication errors. This will provide a URL to authenticate with Google OAuth.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "google_auth_status",
            description: "Check the current authentication status with Google.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "google_auth_code",
            description: "Set the authorization code received from Google OAuth callback.",
            inputSchema: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  description: "The authorization code from Google OAuth",
                },
              },
              required: ["code"],
            },
          },
          {
            name: "google_logout",
            description: "Log out from Google and remove stored tokens.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },

          // Google Drive Tools
          {
            name: "drive_list_files",
            description:
              "List files in Google Drive. Can filter by folder or query.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of files to return (1-1000, default 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
                query: {
                  type: "string",
                  description: "Search query in Google Drive format",
                },
                orderBy: {
                  type: "string",
                  description: "Order by field (e.g., 'modifiedTime desc')",
                },
                folderId: {
                  type: "string",
                  description: "Filter files in a specific folder",
                },
              },
              required: [],
            },
          },
          {
            name: "drive_get_file",
            description: "Get metadata for a specific file in Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                fileId: {
                  type: "string",
                  description: "The ID of the file",
                },
              },
              required: ["fileId"],
            },
          },
          {
            name: "drive_download_file",
            description:
              "Download the contents of a file from Google Drive. For Google Workspace files (Docs, Sheets), exports as plain text/CSV.",
            inputSchema: {
              type: "object",
              properties: {
                fileId: {
                  type: "string",
                  description: "The ID of the file to download",
                },
              },
              required: ["fileId"],
            },
          },
          {
            name: "drive_upload_file",
            description: "Upload a new file to Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Name for the file",
                },
                content: {
                  type: "string",
                  description: "Content of the file",
                },
                mimeType: {
                  type: "string",
                  description: "MIME type (default: text/plain)",
                },
                folderId: {
                  type: "string",
                  description: "Folder to upload to",
                },
              },
              required: ["name", "content"],
            },
          },
          {
            name: "drive_delete_file",
            description: "Delete a file from Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                fileId: {
                  type: "string",
                  description: "The ID of the file to delete",
                },
              },
              required: ["fileId"],
            },
          },
          {
            name: "drive_create_folder",
            description: "Create a new folder in Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Name for the folder",
                },
                parentFolderId: {
                  type: "string",
                  description: "Parent folder ID (optional)",
                },
              },
              required: ["name"],
            },
          },
          {
            name: "drive_search",
            description: "Search for files in Google Drive by content or name.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
                pageSize: {
                  type: "number",
                  description: "Number of results (default 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "drive_move_file",
            description: "Move a file to a different folder.",
            inputSchema: {
              type: "object",
              properties: {
                fileId: {
                  type: "string",
                  description: "The ID of the file to move",
                },
                newFolderId: {
                  type: "string",
                  description: "The ID of the destination folder",
                },
              },
              required: ["fileId", "newFolderId"],
            },
          },
          {
            name: "drive_copy_file",
            description: "Copy a file in Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                fileId: {
                  type: "string",
                  description: "The ID of the file to copy",
                },
                newName: {
                  type: "string",
                  description: "Name for the copy (optional)",
                },
                folderId: {
                  type: "string",
                  description: "Destination folder (optional)",
                },
              },
              required: ["fileId"],
            },
          },
          {
            name: "drive_rename_file",
            description: "Rename a file in Google Drive.",
            inputSchema: {
              type: "object",
              properties: {
                fileId: {
                  type: "string",
                  description: "The ID of the file to rename",
                },
                newName: {
                  type: "string",
                  description: "New name for the file",
                },
              },
              required: ["fileId", "newName"],
            },
          },

          // Google Docs Tools
          {
            name: "docs_create",
            description: "Create a new Google Doc.",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Title for the document",
                },
                content: {
                  type: "string",
                  description: "Initial content (optional)",
                },
                folderId: {
                  type: "string",
                  description: "Folder to create in (optional)",
                },
              },
              required: ["title"],
            },
          },
          {
            name: "docs_read",
            description: "Read the content of a Google Doc.",
            inputSchema: {
              type: "object",
              properties: {
                documentId: {
                  type: "string",
                  description: "The ID of the document",
                },
              },
              required: ["documentId"],
            },
          },
          {
            name: "docs_insert_text",
            description: "Insert text at a specific position in a Google Doc.",
            inputSchema: {
              type: "object",
              properties: {
                documentId: {
                  type: "string",
                  description: "The ID of the document",
                },
                text: {
                  type: "string",
                  description: "Text to insert",
                },
                index: {
                  type: "number",
                  description: "Position to insert at (1-based)",
                },
              },
              required: ["documentId", "text", "index"],
            },
          },
          {
            name: "docs_append_text",
            description: "Append text to the end of a Google Doc.",
            inputSchema: {
              type: "object",
              properties: {
                documentId: {
                  type: "string",
                  description: "The ID of the document",
                },
                text: {
                  type: "string",
                  description: "Text to append",
                },
              },
              required: ["documentId", "text"],
            },
          },
          {
            name: "docs_replace_text",
            description: "Find and replace text in a Google Doc.",
            inputSchema: {
              type: "object",
              properties: {
                documentId: {
                  type: "string",
                  description: "The ID of the document",
                },
                searchText: {
                  type: "string",
                  description: "Text to find",
                },
                replaceText: {
                  type: "string",
                  description: "Text to replace with",
                },
                matchCase: {
                  type: "boolean",
                  description: "Match case (default true)",
                },
              },
              required: ["documentId", "searchText", "replaceText"],
            },
          },
          {
            name: "docs_list",
            description: "List all Google Docs in Drive.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of documents (default 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },

          // Google Sheets Tools
          {
            name: "sheets_create",
            description: "Create a new Google Spreadsheet.",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Title for the spreadsheet",
                },
                sheets: {
                  type: "array",
                  items: { type: "string" },
                  description: "Names for initial sheets",
                },
                folderId: {
                  type: "string",
                  description: "Folder to create in (optional)",
                },
              },
              required: ["title"],
            },
          },
          {
            name: "sheets_get",
            description: "Get spreadsheet metadata and sheet info.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
              },
              required: ["spreadsheetId"],
            },
          },
          {
            name: "sheets_read",
            description: "Read values from a spreadsheet range.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
                range: {
                  type: "string",
                  description: "Range in A1 notation (e.g., 'Sheet1!A1:D10')",
                },
              },
              required: ["spreadsheetId"],
            },
          },
          {
            name: "sheets_update",
            description: "Update values in a spreadsheet range.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
                range: {
                  type: "string",
                  description: "Range in A1 notation",
                },
                values: {
                  type: "array",
                  items: {
                    type: "array",
                    items: {},
                  },
                  description: "2D array of values",
                },
                valueInputOption: {
                  type: "string",
                  enum: ["RAW", "USER_ENTERED"],
                  description: "How to interpret input (default USER_ENTERED)",
                },
              },
              required: ["spreadsheetId", "range", "values"],
            },
          },
          {
            name: "sheets_append",
            description: "Append rows to a spreadsheet.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
                range: {
                  type: "string",
                  description: "Range to append to (e.g., 'Sheet1!A:A')",
                },
                values: {
                  type: "array",
                  items: {
                    type: "array",
                    items: {},
                  },
                  description: "2D array of values to append",
                },
                valueInputOption: {
                  type: "string",
                  enum: ["RAW", "USER_ENTERED"],
                  description: "How to interpret input",
                },
              },
              required: ["spreadsheetId", "range", "values"],
            },
          },
          {
            name: "sheets_clear",
            description: "Clear values from a spreadsheet range.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
                range: {
                  type: "string",
                  description: "Range to clear in A1 notation",
                },
              },
              required: ["spreadsheetId", "range"],
            },
          },
          {
            name: "sheets_add_sheet",
            description: "Add a new sheet to a spreadsheet.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
                title: {
                  type: "string",
                  description: "Name for the new sheet",
                },
              },
              required: ["spreadsheetId", "title"],
            },
          },
          {
            name: "sheets_delete_sheet",
            description: "Delete a sheet from a spreadsheet.",
            inputSchema: {
              type: "object",
              properties: {
                spreadsheetId: {
                  type: "string",
                  description: "The ID of the spreadsheet",
                },
                sheetId: {
                  type: "number",
                  description: "The ID of the sheet to delete",
                },
              },
              required: ["spreadsheetId", "sheetId"],
            },
          },
          {
            name: "sheets_list",
            description: "List all Google Spreadsheets in Drive.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of spreadsheets (default 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },

          // Google Tasks Tools (Keep Alternative)
          {
            name: "tasks_list_tasklists",
            description: "List all task lists (similar to Keep labels/categories).",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "tasks_create_tasklist",
            description: "Create a new task list.",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Name for the task list",
                },
              },
              required: ["title"],
            },
          },
          {
            name: "tasks_delete_tasklist",
            description: "Delete a task list.",
            inputSchema: {
              type: "object",
              properties: {
                taskListId: {
                  type: "string",
                  description: "The ID of the task list",
                },
              },
              required: ["taskListId"],
            },
          },
          {
            name: "tasks_list_tasks",
            description: "List tasks in a task list.",
            inputSchema: {
              type: "object",
              properties: {
                taskListId: {
                  type: "string",
                  description: "The ID of the task list",
                },
                showCompleted: {
                  type: "boolean",
                  description: "Include completed tasks (default true)",
                },
                maxResults: {
                  type: "number",
                  description: "Max results (default 100)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["taskListId"],
            },
          },
          {
            name: "tasks_create_task",
            description:
              "Create a new task. Tasks can have notes, which makes them useful as simple notes (like Keep notes).",
            inputSchema: {
              type: "object",
              properties: {
                taskListId: {
                  type: "string",
                  description: "The ID of the task list",
                },
                title: {
                  type: "string",
                  description: "Task title",
                },
                notes: {
                  type: "string",
                  description: "Task notes/description",
                },
                due: {
                  type: "string",
                  description: "Due date (RFC 3339 format)",
                },
              },
              required: ["taskListId", "title"],
            },
          },
          {
            name: "tasks_update_task",
            description: "Update an existing task.",
            inputSchema: {
              type: "object",
              properties: {
                taskListId: {
                  type: "string",
                  description: "The ID of the task list",
                },
                taskId: {
                  type: "string",
                  description: "The ID of the task",
                },
                title: {
                  type: "string",
                  description: "New title",
                },
                notes: {
                  type: "string",
                  description: "New notes",
                },
                status: {
                  type: "string",
                  enum: ["needsAction", "completed"],
                  description: "Task status",
                },
                due: {
                  type: "string",
                  description: "Due date (RFC 3339 format)",
                },
              },
              required: ["taskListId", "taskId"],
            },
          },
          {
            name: "tasks_delete_task",
            description: "Delete a task.",
            inputSchema: {
              type: "object",
              properties: {
                taskListId: {
                  type: "string",
                  description: "The ID of the task list",
                },
                taskId: {
                  type: "string",
                  description: "The ID of the task",
                },
              },
              required: ["taskListId", "taskId"],
            },
          },
          {
            name: "tasks_complete_task",
            description: "Mark a task as completed.",
            inputSchema: {
              type: "object",
              properties: {
                taskListId: {
                  type: "string",
                  description: "The ID of the task list",
                },
                taskId: {
                  type: "string",
                  description: "The ID of the task",
                },
              },
              required: ["taskListId", "taskId"],
            },
          },

          // Notes (Keep-like) convenience tools
          {
            name: "notes_create",
            description:
              "Create a quick note (uses Tasks API with a 'Notes' list as Keep alternative).",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Note title",
                },
                content: {
                  type: "string",
                  description: "Note content",
                },
              },
              required: ["title", "content"],
            },
          },
          {
            name: "notes_list",
            description: "List all notes from the Notes task list.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "notes_update",
            description: "Update a note.",
            inputSchema: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "The ID of the note (task)",
                },
                title: {
                  type: "string",
                  description: "New title",
                },
                content: {
                  type: "string",
                  description: "New content",
                },
              },
              required: ["taskId"],
            },
          },
          {
            name: "notes_delete",
            description: "Delete a note.",
            inputSchema: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "The ID of the note (task) to delete",
                },
              },
              required: ["taskId"],
            },
          },

          // Google Calendar Tools
          {
            name: "calendar_list",
            description: "List all calendars accessible by the user.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "calendar_get",
            description: "Get details of a specific calendar.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (use 'primary' for the user's primary calendar)",
                },
              },
              required: ["calendarId"],
            },
          },
          {
            name: "calendar_list_events",
            description: "List events from a calendar.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                timeMin: {
                  type: "string",
                  description: "Start time filter (ISO 8601 format, default: now)",
                },
                timeMax: {
                  type: "string",
                  description: "End time filter (ISO 8601 format)",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum number of events (default: 50)",
                },
                q: {
                  type: "string",
                  description: "Search query to filter events",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "calendar_get_event",
            description: "Get details of a specific calendar event.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                eventId: {
                  type: "string",
                  description: "The ID of the event",
                },
              },
              required: ["eventId"],
            },
          },
          {
            name: "calendar_create_event",
            description: "Create a new calendar event.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                summary: {
                  type: "string",
                  description: "Event title",
                },
                description: {
                  type: "string",
                  description: "Event description",
                },
                location: {
                  type: "string",
                  description: "Event location",
                },
                startDateTime: {
                  type: "string",
                  description: "Start time (ISO 8601 format, e.g., '2025-01-15T10:00:00-05:00')",
                },
                endDateTime: {
                  type: "string",
                  description: "End time (ISO 8601 format)",
                },
                startDate: {
                  type: "string",
                  description: "Start date for all-day events (YYYY-MM-DD)",
                },
                endDate: {
                  type: "string",
                  description: "End date for all-day events (YYYY-MM-DD)",
                },
                timeZone: {
                  type: "string",
                  description: "Time zone (e.g., 'America/New_York')",
                },
                attendees: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of attendee email addresses",
                },
                sendUpdates: {
                  type: "string",
                  enum: ["all", "externalOnly", "none"],
                  description: "Whether to send notifications (default: 'none')",
                },
              },
              required: ["summary"],
            },
          },
          {
            name: "calendar_update_event",
            description: "Update an existing calendar event.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                eventId: {
                  type: "string",
                  description: "The ID of the event to update",
                },
                summary: {
                  type: "string",
                  description: "New event title",
                },
                description: {
                  type: "string",
                  description: "New event description",
                },
                location: {
                  type: "string",
                  description: "New event location",
                },
                startDateTime: {
                  type: "string",
                  description: "New start time (ISO 8601 format)",
                },
                endDateTime: {
                  type: "string",
                  description: "New end time (ISO 8601 format)",
                },
                timeZone: {
                  type: "string",
                  description: "Time zone",
                },
                attendees: {
                  type: "array",
                  items: { type: "string" },
                  description: "New list of attendee emails",
                },
                sendUpdates: {
                  type: "string",
                  enum: ["all", "externalOnly", "none"],
                  description: "Whether to send notifications",
                },
              },
              required: ["eventId"],
            },
          },
          {
            name: "calendar_delete_event",
            description: "Delete a calendar event.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                eventId: {
                  type: "string",
                  description: "The ID of the event to delete",
                },
                sendUpdates: {
                  type: "string",
                  enum: ["all", "externalOnly", "none"],
                  description: "Whether to send cancellation notifications",
                },
              },
              required: ["eventId"],
            },
          },
          {
            name: "calendar_quick_add",
            description: "Quickly add an event using natural language (e.g., 'Meeting with John tomorrow at 3pm').",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                text: {
                  type: "string",
                  description: "Natural language description of the event",
                },
                sendUpdates: {
                  type: "string",
                  enum: ["all", "externalOnly", "none"],
                  description: "Whether to send notifications",
                },
              },
              required: ["text"],
            },
          },
          {
            name: "calendar_get_freebusy",
            description: "Get free/busy information for calendars.",
            inputSchema: {
              type: "object",
              properties: {
                timeMin: {
                  type: "string",
                  description: "Start of time range (ISO 8601 format)",
                },
                timeMax: {
                  type: "string",
                  description: "End of time range (ISO 8601 format)",
                },
                calendarIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "Calendar IDs to check (default: ['primary'])",
                },
              },
              required: ["timeMin", "timeMax"],
            },
          },
          {
            name: "calendar_today",
            description: "Get today's events from a calendar.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
              },
              required: [],
            },
          },
          {
            name: "calendar_upcoming",
            description: "Get upcoming events for the next N days.",
            inputSchema: {
              type: "object",
              properties: {
                calendarId: {
                  type: "string",
                  description: "Calendar ID (default: 'primary')",
                },
                days: {
                  type: "number",
                  description: "Number of days to look ahead (default: 7)",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum number of events (default: 20)",
                },
              },
              required: [],
            },
          },

          // Gmail Tools
          {
            name: "gmail_get_profile",
            description: "Get the user's Gmail profile information.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "gmail_list_labels",
            description: "List all Gmail labels.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "gmail_list_messages",
            description: "List Gmail messages with optional filtering.",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: {
                  type: "number",
                  description: "Maximum messages to return (default: 20)",
                },
                q: {
                  type: "string",
                  description: "Gmail search query (e.g., 'from:user@example.com')",
                },
                labelIds: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by label IDs",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "gmail_get_message",
            description: "Get a specific Gmail message by ID.",
            inputSchema: {
              type: "object",
              properties: {
                messageId: {
                  type: "string",
                  description: "The ID of the message",
                },
              },
              required: ["messageId"],
            },
          },
          {
            name: "gmail_send",
            description: "Send an email.",
            inputSchema: {
              type: "object",
              properties: {
                to: {
                  type: "string",
                  description: "Recipient email address",
                },
                subject: {
                  type: "string",
                  description: "Email subject",
                },
                body: {
                  type: "string",
                  description: "Email body content",
                },
                cc: {
                  type: "string",
                  description: "CC recipients (comma-separated)",
                },
                bcc: {
                  type: "string",
                  description: "BCC recipients (comma-separated)",
                },
                isHtml: {
                  type: "boolean",
                  description: "Whether body is HTML (default: false)",
                },
              },
              required: ["to", "subject", "body"],
            },
          },
          {
            name: "gmail_reply",
            description: "Reply to an email message.",
            inputSchema: {
              type: "object",
              properties: {
                messageId: {
                  type: "string",
                  description: "The ID of the message to reply to",
                },
                body: {
                  type: "string",
                  description: "Reply body content",
                },
                isHtml: {
                  type: "boolean",
                  description: "Whether body is HTML",
                },
              },
              required: ["messageId", "body"],
            },
          },
          {
            name: "gmail_trash",
            description: "Move a message to trash.",
            inputSchema: {
              type: "object",
              properties: {
                messageId: {
                  type: "string",
                  description: "The ID of the message",
                },
              },
              required: ["messageId"],
            },
          },
          {
            name: "gmail_mark_read",
            description: "Mark a message as read.",
            inputSchema: {
              type: "object",
              properties: {
                messageId: {
                  type: "string",
                  description: "The ID of the message",
                },
              },
              required: ["messageId"],
            },
          },
          {
            name: "gmail_mark_unread",
            description: "Mark a message as unread.",
            inputSchema: {
              type: "object",
              properties: {
                messageId: {
                  type: "string",
                  description: "The ID of the message",
                },
              },
              required: ["messageId"],
            },
          },
          {
            name: "gmail_search",
            description: "Search emails using Gmail search syntax.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Gmail search query",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 20)",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "gmail_get_unread",
            description: "Get unread emails.",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 20)",
                },
              },
              required: [],
            },
          },
          {
            name: "gmail_get_thread",
            description: "Get a full email thread/conversation.",
            inputSchema: {
              type: "object",
              properties: {
                threadId: {
                  type: "string",
                  description: "The ID of the thread",
                },
              },
              required: ["threadId"],
            },
          },

          // People/Contacts Tools
          {
            name: "contacts_list",
            description: "List contacts from Google Contacts.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of contacts (default: 100)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
                sortOrder: {
                  type: "string",
                  enum: ["LAST_MODIFIED_ASCENDING", "LAST_MODIFIED_DESCENDING", "FIRST_NAME_ASCENDING", "LAST_NAME_ASCENDING"],
                  description: "Sort order",
                },
              },
              required: [],
            },
          },
          {
            name: "contacts_get",
            description: "Get a specific contact by resource name.",
            inputSchema: {
              type: "object",
              properties: {
                resourceName: {
                  type: "string",
                  description: "Contact resource name (e.g., 'people/c123456')",
                },
              },
              required: ["resourceName"],
            },
          },
          {
            name: "contacts_search",
            description: "Search contacts by name or email.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 30)",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "contacts_create",
            description: "Create a new contact.",
            inputSchema: {
              type: "object",
              properties: {
                givenName: {
                  type: "string",
                  description: "First name",
                },
                familyName: {
                  type: "string",
                  description: "Last name",
                },
                email: {
                  type: "string",
                  description: "Email address",
                },
                phone: {
                  type: "string",
                  description: "Phone number",
                },
                organization: {
                  type: "string",
                  description: "Company/organization name",
                },
                jobTitle: {
                  type: "string",
                  description: "Job title",
                },
                notes: {
                  type: "string",
                  description: "Notes about the contact",
                },
              },
              required: ["givenName"],
            },
          },
          {
            name: "contacts_delete",
            description: "Delete a contact.",
            inputSchema: {
              type: "object",
              properties: {
                resourceName: {
                  type: "string",
                  description: "Contact resource name",
                },
              },
              required: ["resourceName"],
            },
          },
          {
            name: "contacts_list_groups",
            description: "List contact groups/labels.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "contacts_get_group",
            description: "Get a contact group/label by resource name, including the full details of its members.",
            inputSchema: {
              type: "object",
              properties: {
                resourceName: {
                  type: "string",
                  description: "Contact group resource name (e.g., 'contactGroups/abc123')",
                },
              },
              required: ["resourceName"],
            },
          },

          // YouTube Tools
          {
            name: "youtube_search",
            description: "Search YouTube for videos, channels, or playlists.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query",
                },
                type: {
                  type: "string",
                  enum: ["video", "channel", "playlist"],
                  description: "Type of content (default: 'video')",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 25)",
                },
                order: {
                  type: "string",
                  enum: ["date", "rating", "relevance", "title", "viewCount"],
                  description: "Sort order (default: 'relevance')",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "youtube_get_video",
            description: "Get details of a YouTube video.",
            inputSchema: {
              type: "object",
              properties: {
                videoId: {
                  type: "string",
                  description: "The video ID",
                },
              },
              required: ["videoId"],
            },
          },
          {
            name: "youtube_get_channel",
            description: "Get details of a YouTube channel.",
            inputSchema: {
              type: "object",
              properties: {
                channelId: {
                  type: "string",
                  description: "The channel ID",
                },
              },
              required: ["channelId"],
            },
          },
          {
            name: "youtube_get_my_channel",
            description: "Get the authenticated user's YouTube channel.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "youtube_list_playlists",
            description: "List the user's YouTube playlists.",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 25)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "youtube_get_playlist_items",
            description: "Get videos in a YouTube playlist.",
            inputSchema: {
              type: "object",
              properties: {
                playlistId: {
                  type: "string",
                  description: "The playlist ID",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["playlistId"],
            },
          },
          {
            name: "youtube_get_video_comments",
            description: "Get comments on a YouTube video.",
            inputSchema: {
              type: "object",
              properties: {
                videoId: {
                  type: "string",
                  description: "The video ID",
                },
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 20)",
                },
                order: {
                  type: "string",
                  enum: ["time", "relevance"],
                  description: "Sort order (default: 'relevance')",
                },
              },
              required: ["videoId"],
            },
          },
          {
            name: "youtube_list_subscriptions",
            description: "List the user's YouTube subscriptions.",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "youtube_list_liked_videos",
            description: "List videos liked by the user.",
            inputSchema: {
              type: "object",
              properties: {
                maxResults: {
                  type: "number",
                  description: "Maximum results (default: 25)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "youtube_rate_video",
            description: "Like, dislike, or remove rating from a video.",
            inputSchema: {
              type: "object",
              properties: {
                videoId: {
                  type: "string",
                  description: "The video ID",
                },
                rating: {
                  type: "string",
                  enum: ["like", "dislike", "none"],
                  description: "Rating to apply",
                },
              },
              required: ["videoId", "rating"],
            },
          },

          // Slides Tools
          {
            name: "slides_create",
            description: "Create a new Google Slides presentation.",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Presentation title",
                },
                folderId: {
                  type: "string",
                  description: "Folder to create in (optional)",
                },
              },
              required: ["title"],
            },
          },
          {
            name: "slides_get",
            description: "Get a Google Slides presentation.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
              },
              required: ["presentationId"],
            },
          },
          {
            name: "slides_list",
            description: "List all Google Slides presentations.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of presentations (default: 50)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "slides_add_slide",
            description: "Add a new slide to a presentation.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
                layoutType: {
                  type: "string",
                  enum: ["BLANK", "CAPTION_ONLY", "TITLE", "TITLE_AND_BODY", "TITLE_AND_TWO_COLUMNS", "TITLE_ONLY", "SECTION_HEADER", "MAIN_POINT", "BIG_NUMBER"],
                  description: "Slide layout (default: BLANK)",
                },
                insertionIndex: {
                  type: "number",
                  description: "Position to insert the slide",
                },
              },
              required: ["presentationId"],
            },
          },
          {
            name: "slides_delete_slide",
            description: "Delete a slide from a presentation.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
                slideObjectId: {
                  type: "string",
                  description: "The slide object ID",
                },
              },
              required: ["presentationId", "slideObjectId"],
            },
          },
          {
            name: "slides_add_text",
            description: "Add a text box to a slide.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
                slideObjectId: {
                  type: "string",
                  description: "The slide object ID",
                },
                text: {
                  type: "string",
                  description: "Text content",
                },
                x: {
                  type: "number",
                  description: "X position in points",
                },
                y: {
                  type: "number",
                  description: "Y position in points",
                },
                width: {
                  type: "number",
                  description: "Width in points",
                },
                height: {
                  type: "number",
                  description: "Height in points",
                },
              },
              required: ["presentationId", "slideObjectId", "text"],
            },
          },
          {
            name: "slides_add_image",
            description: "Add an image to a slide.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
                slideObjectId: {
                  type: "string",
                  description: "The slide object ID",
                },
                imageUrl: {
                  type: "string",
                  description: "URL of the image",
                },
                x: {
                  type: "number",
                  description: "X position in points",
                },
                y: {
                  type: "number",
                  description: "Y position in points",
                },
                width: {
                  type: "number",
                  description: "Width in points",
                },
                height: {
                  type: "number",
                  description: "Height in points",
                },
              },
              required: ["presentationId", "slideObjectId", "imageUrl"],
            },
          },
          {
            name: "slides_replace_text",
            description: "Find and replace text in a presentation.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
                searchText: {
                  type: "string",
                  description: "Text to find",
                },
                replaceText: {
                  type: "string",
                  description: "Text to replace with",
                },
                matchCase: {
                  type: "boolean",
                  description: "Match case (default: true)",
                },
              },
              required: ["presentationId", "searchText", "replaceText"],
            },
          },
          {
            name: "slides_duplicate_slide",
            description: "Duplicate a slide.",
            inputSchema: {
              type: "object",
              properties: {
                presentationId: {
                  type: "string",
                  description: "The presentation ID",
                },
                slideObjectId: {
                  type: "string",
                  description: "The slide object ID to duplicate",
                },
              },
              required: ["presentationId", "slideObjectId"],
            },
          },

          // Google Forms Tools
          {
            name: "forms_create",
            description: "Create a new Google Form.",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "The title of the form",
                },
                documentTitle: {
                  type: "string",
                  description: "The document title (defaults to title)",
                },
                description: {
                  type: "string",
                  description: "The description of the form",
                },
              },
              required: ["title"],
            },
          },
          {
            name: "forms_get",
            description: "Get a Google Form by ID.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
              },
              required: ["formId"],
            },
          },
          {
            name: "forms_update_info",
            description: "Update form title and description.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                title: {
                  type: "string",
                  description: "New title",
                },
                description: {
                  type: "string",
                  description: "New description",
                },
              },
              required: ["formId"],
            },
          },
          {
            name: "forms_add_question",
            description: "Add a question to a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                title: {
                  type: "string",
                  description: "Question title",
                },
                description: {
                  type: "string",
                  description: "Question description",
                },
                required: {
                  type: "boolean",
                  description: "Whether the question is required",
                },
                index: {
                  type: "number",
                  description: "Position to insert (0-based)",
                },
                questionType: {
                  type: "string",
                  enum: ["short_answer", "paragraph", "multiple_choice", "checkboxes", "dropdown", "linear_scale", "date", "time"],
                  description: "Type of question",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Options for choice questions",
                },
                scaleConfig: {
                  type: "object",
                  properties: {
                    low: { type: "number" },
                    high: { type: "number" },
                    lowLabel: { type: "string" },
                    highLabel: { type: "string" },
                  },
                  description: "Configuration for linear scale questions",
                },
              },
              required: ["formId", "title", "questionType"],
            },
          },
          {
            name: "forms_delete_item",
            description: "Delete an item from a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                itemIndex: {
                  type: "number",
                  description: "Index of the item to delete (0-based)",
                },
              },
              required: ["formId", "itemIndex"],
            },
          },
          {
            name: "forms_list_responses",
            description: "List responses to a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                pageSize: {
                  type: "number",
                  description: "Number of responses to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["formId"],
            },
          },
          {
            name: "forms_get_response",
            description: "Get a specific form response.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                responseId: {
                  type: "string",
                  description: "The response ID",
                },
              },
              required: ["formId", "responseId"],
            },
          },
          {
            name: "forms_add_page_break",
            description: "Add a page break to a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                title: {
                  type: "string",
                  description: "Title for the new section",
                },
                index: {
                  type: "number",
                  description: "Position to insert (0-based)",
                },
              },
              required: ["formId", "title"],
            },
          },
          {
            name: "forms_add_text",
            description: "Add a text/description item to a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                title: {
                  type: "string",
                  description: "Title of the text item",
                },
                description: {
                  type: "string",
                  description: "Description text",
                },
                index: {
                  type: "number",
                  description: "Position to insert (0-based)",
                },
              },
              required: ["formId", "title"],
            },
          },
          {
            name: "forms_add_image",
            description: "Add an image to a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                sourceUri: {
                  type: "string",
                  description: "URL of the image",
                },
                title: {
                  type: "string",
                  description: "Title for the image",
                },
                altText: {
                  type: "string",
                  description: "Alt text for accessibility",
                },
                index: {
                  type: "number",
                  description: "Position to insert (0-based)",
                },
              },
              required: ["formId", "sourceUri"],
            },
          },
          {
            name: "forms_add_video",
            description: "Add a YouTube video to a form.",
            inputSchema: {
              type: "object",
              properties: {
                formId: {
                  type: "string",
                  description: "The form ID",
                },
                youtubeUri: {
                  type: "string",
                  description: "YouTube video URL",
                },
                title: {
                  type: "string",
                  description: "Title for the video",
                },
                caption: {
                  type: "string",
                  description: "Caption for the video",
                },
                index: {
                  type: "number",
                  description: "Position to insert (0-based)",
                },
              },
              required: ["formId", "youtubeUri"],
            },
          },

          // Google Chat Tools
          {
            name: "chat_list_spaces",
            description: "List Google Chat spaces.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of spaces to return (default 100)",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: [],
            },
          },
          {
            name: "chat_get_space",
            description: "Get a Google Chat space by name.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name (e.g., spaces/AAAAA)",
                },
              },
              required: ["spaceName"],
            },
          },
          {
            name: "chat_create_space",
            description: "Create a new Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                displayName: {
                  type: "string",
                  description: "Display name for the space",
                },
                spaceType: {
                  type: "string",
                  enum: ["SPACE", "GROUP_CHAT", "DIRECT_MESSAGE"],
                  description: "Type of space (default: SPACE)",
                },
                externalUserAllowed: {
                  type: "boolean",
                  description: "Whether external users can join",
                },
                description: {
                  type: "string",
                  description: "Description of the space",
                },
                guidelines: {
                  type: "string",
                  description: "Guidelines for the space",
                },
              },
              required: ["displayName"],
            },
          },
          {
            name: "chat_delete_space",
            description: "Delete a Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
              },
              required: ["spaceName"],
            },
          },
          {
            name: "chat_list_messages",
            description: "List messages in a Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
                pageSize: {
                  type: "number",
                  description: "Number of messages to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
                filter: {
                  type: "string",
                  description: "Filter expression",
                },
                orderBy: {
                  type: "string",
                  description: "Order by field",
                },
              },
              required: ["spaceName"],
            },
          },
          {
            name: "chat_get_message",
            description: "Get a specific message from Google Chat.",
            inputSchema: {
              type: "object",
              properties: {
                messageName: {
                  type: "string",
                  description: "The message resource name",
                },
              },
              required: ["messageName"],
            },
          },
          {
            name: "chat_send_message",
            description: "Send a message to a Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
                text: {
                  type: "string",
                  description: "Message text",
                },
                threadKey: {
                  type: "string",
                  description: "Thread key for threading messages",
                },
              },
              required: ["spaceName", "text"],
            },
          },
          {
            name: "chat_update_message",
            description: "Update a message in Google Chat.",
            inputSchema: {
              type: "object",
              properties: {
                messageName: {
                  type: "string",
                  description: "The message resource name",
                },
                text: {
                  type: "string",
                  description: "New message text",
                },
              },
              required: ["messageName", "text"],
            },
          },
          {
            name: "chat_delete_message",
            description: "Delete a message from Google Chat.",
            inputSchema: {
              type: "object",
              properties: {
                messageName: {
                  type: "string",
                  description: "The message resource name",
                },
                force: {
                  type: "boolean",
                  description: "Force delete even if message has replies",
                },
              },
              required: ["messageName"],
            },
          },
          {
            name: "chat_list_members",
            description: "List members of a Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
                pageSize: {
                  type: "number",
                  description: "Number of members to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["spaceName"],
            },
          },
          {
            name: "chat_add_member",
            description: "Add a member to a Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
                userId: {
                  type: "string",
                  description: "User ID to add (e.g., users/123456)",
                },
                role: {
                  type: "string",
                  enum: ["ROLE_MEMBER", "ROLE_MANAGER"],
                  description: "Role for the member (default: ROLE_MEMBER)",
                },
              },
              required: ["spaceName", "userId"],
            },
          },
          {
            name: "chat_remove_member",
            description: "Remove a member from a Google Chat space.",
            inputSchema: {
              type: "object",
              properties: {
                memberName: {
                  type: "string",
                  description: "The member resource name",
                },
              },
              required: ["memberName"],
            },
          },
          {
            name: "chat_add_reaction",
            description: "Add an emoji reaction to a message.",
            inputSchema: {
              type: "object",
              properties: {
                messageName: {
                  type: "string",
                  description: "The message resource name",
                },
                emoji: {
                  type: "string",
                  description: "Emoji to react with (Unicode)",
                },
              },
              required: ["messageName", "emoji"],
            },
          },

          // Google Meet Tools
          {
            name: "meet_create_space",
            description: "Create a new Google Meet meeting space.",
            inputSchema: {
              type: "object",
              properties: {
                accessType: {
                  type: "string",
                  enum: ["OPEN", "TRUSTED", "RESTRICTED"],
                  description: "Access type for the meeting",
                },
                entryPointAccess: {
                  type: "string",
                  enum: ["ALL", "CREATOR_APP_ONLY"],
                  description: "Who can join from entry points",
                },
              },
              required: [],
            },
          },
          {
            name: "meet_get_space",
            description: "Get a Google Meet space by name.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
              },
              required: ["spaceName"],
            },
          },
          {
            name: "meet_end_conference",
            description: "End an active conference in a Meet space.",
            inputSchema: {
              type: "object",
              properties: {
                spaceName: {
                  type: "string",
                  description: "The space resource name",
                },
              },
              required: ["spaceName"],
            },
          },
          {
            name: "meet_schedule",
            description: "Schedule a Google Meet meeting via Calendar.",
            inputSchema: {
              type: "object",
              properties: {
                summary: {
                  type: "string",
                  description: "Meeting title",
                },
                description: {
                  type: "string",
                  description: "Meeting description",
                },
                startTime: {
                  type: "string",
                  description: "Start time in ISO 8601 format",
                },
                endTime: {
                  type: "string",
                  description: "End time in ISO 8601 format",
                },
                attendees: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of attendee email addresses",
                },
                timeZone: {
                  type: "string",
                  description: "Time zone (default: UTC)",
                },
                sendUpdates: {
                  type: "string",
                  enum: ["all", "externalOnly", "none"],
                  description: "Whether to send email notifications",
                },
              },
              required: ["summary", "startTime", "endTime"],
            },
          },
          {
            name: "meet_create_instant",
            description: "Create an instant Google Meet meeting.",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "meet_get_by_event",
            description: "Get meeting details from a calendar event.",
            inputSchema: {
              type: "object",
              properties: {
                eventId: {
                  type: "string",
                  description: "Calendar event ID",
                },
              },
              required: ["eventId"],
            },
          },
          {
            name: "meet_list_upcoming",
            description: "List upcoming meetings from calendar.",
            inputSchema: {
              type: "object",
              properties: {
                days: {
                  type: "number",
                  description: "Number of days to look ahead (default: 7)",
                },
              },
              required: [],
            },
          },
          {
            name: "meet_list_conference_records",
            description: "List past conference records.",
            inputSchema: {
              type: "object",
              properties: {
                pageSize: {
                  type: "number",
                  description: "Number of records to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
                filter: {
                  type: "string",
                  description: "Filter expression",
                },
              },
              required: [],
            },
          },
          {
            name: "meet_get_conference_record",
            description: "Get a specific conference record.",
            inputSchema: {
              type: "object",
              properties: {
                recordName: {
                  type: "string",
                  description: "The conference record resource name",
                },
              },
              required: ["recordName"],
            },
          },
          {
            name: "meet_list_participants",
            description: "List participants of a conference.",
            inputSchema: {
              type: "object",
              properties: {
                conferenceRecordName: {
                  type: "string",
                  description: "The conference record resource name",
                },
                pageSize: {
                  type: "number",
                  description: "Number of participants to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["conferenceRecordName"],
            },
          },
          {
            name: "meet_list_recordings",
            description: "List recordings of a conference.",
            inputSchema: {
              type: "object",
              properties: {
                conferenceRecordName: {
                  type: "string",
                  description: "The conference record resource name",
                },
                pageSize: {
                  type: "number",
                  description: "Number of recordings to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["conferenceRecordName"],
            },
          },
          {
            name: "meet_get_recording",
            description: "Get a specific recording.",
            inputSchema: {
              type: "object",
              properties: {
                recordingName: {
                  type: "string",
                  description: "The recording resource name",
                },
              },
              required: ["recordingName"],
            },
          },
          {
            name: "meet_list_transcripts",
            description: "List transcripts of a conference.",
            inputSchema: {
              type: "object",
              properties: {
                conferenceRecordName: {
                  type: "string",
                  description: "The conference record resource name",
                },
                pageSize: {
                  type: "number",
                  description: "Number of transcripts to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["conferenceRecordName"],
            },
          },
          {
            name: "meet_get_transcript",
            description: "Get a specific transcript.",
            inputSchema: {
              type: "object",
              properties: {
                transcriptName: {
                  type: "string",
                  description: "The transcript resource name",
                },
              },
              required: ["transcriptName"],
            },
          },
          {
            name: "meet_list_transcript_entries",
            description: "List entries in a transcript.",
            inputSchema: {
              type: "object",
              properties: {
                transcriptName: {
                  type: "string",
                  description: "The transcript resource name",
                },
                pageSize: {
                  type: "number",
                  description: "Number of entries to return",
                },
                pageToken: {
                  type: "string",
                  description: "Token for pagination",
                },
              },
              required: ["transcriptName"],
            },
          },
        ],
      };
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "google://auth/status",
            name: "Authentication Status",
            description: "Current Google OAuth authentication status",
            mimeType: "application/json",
          },
          {
            uri: "google://auth/credentials-path",
            name: "Credentials Path",
            description: "Path where Google OAuth credentials should be placed",
            mimeType: "text/plain",
          },
        ],
      };
    });

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === "google://auth/status") {
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  authenticated: oauth.isReady(),
                  credentialsPath: oauth.getCredentialsPath(),
                  tokenPath: oauth.getTokenPath(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (uri === "google://auth/credentials-path") {
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: oauth.getCredentialsPath(),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Authentication tools don't require being authenticated
        if (name === "google_auth") {
          // First try to initialize (loads existing valid tokens)
          const initialized = await oauth.initialize();
          if (initialized && oauth.isReady()) {
            this.initializeServices();
            return {
              content: [
                {
                  type: "text",
                  text: "Already authenticated with Google!",
                },
              ],
            };
          }

          // Check if credentials file exists before attempting auth
          const authUrl = oauth.getAuthUrl();
          if (!authUrl) {
            return {
              content: [
                {
                  type: "text",
                  text: `Please place your Google OAuth credentials at: ${oauth.getCredentialsPath()}\n\nYou can download credentials from: https://console.cloud.google.com/apis/credentials\n\n1. Create a new OAuth 2.0 Client ID\n2. Download the JSON file\n3. Save it as 'credentials.json' at the path above`,
                },
              ],
              isError: true,
            };
          }

          // Automatically start the OAuth flow - opens browser and handles callback
          console.error("Starting OAuth authentication flow...");
          const authenticated = await oauth.authenticate();

          if (authenticated) {
            this.initializeServices();
            return {
              content: [
                {
                  type: "text",
                  text: "Successfully authenticated with Google! You can now use all Google Workspace tools.",
                },
              ],
            };
          }

          // If automatic flow failed, provide manual instructions
          return {
            content: [
              {
                type: "text",
                text: `Automatic authentication failed. Please try manually:\n\n1. Visit: ${authUrl}\n2. Complete the authentication\n3. Use the google_auth_code tool with the code from the URL`,
              },
            ],
            isError: true,
          };
        }

        if (name === "google_auth_status") {
          await oauth.initialize();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    authenticated: oauth.isReady(),
                    credentialsPath: oauth.getCredentialsPath(),
                    tokenPath: oauth.getTokenPath(),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "google_auth_code") {
          const { code } = args as { code: string };
          const success = await oauth.setAuthCode(code);
          if (success) {
            this.initializeServices();
            return {
              content: [
                {
                  type: "text",
                  text: "Successfully authenticated with Google!",
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text",
                text: "Failed to authenticate with the provided code.",
              },
            ],
            isError: true,
          };
        }

        if (name === "google_logout") {
          await oauth.logout();
          this.drive = null;
          this.docs = null;
          this.sheets = null;
          this.tasks = null;
          this.calendar = null;
          this.gmail = null;
          this.people = null;
          this.youtube = null;
          this.slidesService = null;
          return {
            content: [
              {
                type: "text",
                text: "Successfully logged out from Google.",
              },
            ],
          };
        }

        // All other tools require authentication
        this.ensureAuthenticated();

        // Google Drive tools
        if (name === "drive_list_files") {
          const options = DriveListOptionsSchema.parse(args);
          const result = await this.drive!.listFiles(options);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_get_file") {
          const { fileId } = args as { fileId: string };
          const result = await this.drive!.getFile(fileId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_download_file") {
          const { fileId } = DriveDownloadSchema.parse(args);
          const content = await this.drive!.downloadFile(fileId);
          return {
            content: [
              {
                type: "text",
                text: content,
              },
            ],
          };
        }

        if (name === "drive_upload_file") {
          const { name: fileName, content, mimeType, folderId } = DriveUploadSchema.parse(args);
          const result = await this.drive!.uploadFile(fileName, content, mimeType, folderId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_delete_file") {
          const { fileId } = DriveDeleteSchema.parse(args);
          await this.drive!.deleteFile(fileId);
          return {
            content: [
              {
                type: "text",
                text: `File ${fileId} deleted successfully.`,
              },
            ],
          };
        }

        if (name === "drive_create_folder") {
          const { name: folderName, parentFolderId } = DriveCreateFolderSchema.parse(args);
          const result = await this.drive!.createFolder(folderName, parentFolderId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_search") {
          const { query, pageSize, pageToken } = DriveSearchSchema.parse(args);
          const result = await this.drive!.search(query, pageSize, pageToken);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_move_file") {
          const { fileId, newFolderId } = args as { fileId: string; newFolderId: string };
          const result = await this.drive!.moveFile(fileId, newFolderId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_copy_file") {
          const { fileId, newName, folderId } = args as {
            fileId: string;
            newName?: string;
            folderId?: string;
          };
          const result = await this.drive!.copyFile(fileId, newName, folderId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "drive_rename_file") {
          const { fileId, newName } = args as { fileId: string; newName: string };
          const result = await this.drive!.renameFile(fileId, newName);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Google Docs tools
        if (name === "docs_create") {
          const { title, content, folderId } = DocCreateOptionsSchema.parse(args);
          const result = await this.docs!.createDocument(title, content, folderId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "docs_read") {
          const { documentId } = DocReadOptionsSchema.parse(args);
          const result = await this.docs!.getDocument(documentId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "docs_insert_text") {
          const { documentId, text, index } = DocUpdateTextSchema.parse(args);
          await this.docs!.insertText(documentId, text, index);
          return {
            content: [
              {
                type: "text",
                text: `Text inserted at index ${index}.`,
              },
            ],
          };
        }

        if (name === "docs_append_text") {
          const { documentId, text } = args as { documentId: string; text: string };
          await this.docs!.appendText(documentId, text);
          return {
            content: [
              {
                type: "text",
                text: "Text appended to document.",
              },
            ],
          };
        }

        if (name === "docs_replace_text") {
          const { documentId, searchText, replaceText, matchCase } =
            DocReplaceTextSchema.parse(args);
          const count = await this.docs!.replaceAllText(
            documentId,
            searchText,
            replaceText,
            matchCase
          );
          return {
            content: [
              {
                type: "text",
                text: `Replaced ${count} occurrence(s) of "${searchText}".`,
              },
            ],
          };
        }

        if (name === "docs_list") {
          const { pageSize, pageToken } = args as {
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.docs!.listDocuments(pageSize, pageToken);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Google Sheets tools
        if (name === "sheets_create") {
          const { title, sheets, folderId } = SheetCreateOptionsSchema.parse(args);
          const result = await this.sheets!.createSpreadsheet(title, sheets, folderId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "sheets_get") {
          const { spreadsheetId } = args as { spreadsheetId: string };
          const result = await this.sheets!.getSpreadsheet(spreadsheetId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "sheets_read") {
          const { spreadsheetId, range } = SheetReadOptionsSchema.parse(args);
          const result = await this.sheets!.getValues(spreadsheetId, range || "A1:ZZ1000");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "sheets_update") {
          const { spreadsheetId, range, values, valueInputOption } =
            SheetUpdateOptionsSchema.parse(args);
          const result = await this.sheets!.updateValues(
            spreadsheetId,
            range,
            values,
            valueInputOption
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "sheets_append") {
          const { spreadsheetId, range, values, valueInputOption } =
            SheetAppendOptionsSchema.parse(args);
          const result = await this.sheets!.appendValues(
            spreadsheetId,
            range,
            values,
            valueInputOption
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "sheets_clear") {
          const { spreadsheetId, range } = args as {
            spreadsheetId: string;
            range: string;
          };
          await this.sheets!.clearValues(spreadsheetId, range);
          return {
            content: [
              {
                type: "text",
                text: `Range ${range} cleared.`,
              },
            ],
          };
        }

        if (name === "sheets_add_sheet") {
          const { spreadsheetId, title } = args as {
            spreadsheetId: string;
            title: string;
          };
          const result = await this.sheets!.addSheet(spreadsheetId, title);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "sheets_delete_sheet") {
          const { spreadsheetId, sheetId } = args as {
            spreadsheetId: string;
            sheetId: number;
          };
          await this.sheets!.deleteSheet(spreadsheetId, sheetId);
          return {
            content: [
              {
                type: "text",
                text: `Sheet ${sheetId} deleted.`,
              },
            ],
          };
        }

        if (name === "sheets_list") {
          const { pageSize, pageToken } = args as {
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.sheets!.listSpreadsheets(pageSize, pageToken);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Google Tasks tools
        if (name === "tasks_list_tasklists") {
          const result = await this.tasks!.listTaskLists();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "tasks_create_tasklist") {
          const { title } = TaskListCreateSchema.parse(args);
          const result = await this.tasks!.createTaskList(title);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "tasks_delete_tasklist") {
          const { taskListId } = args as { taskListId: string };
          await this.tasks!.deleteTaskList(taskListId);
          return {
            content: [
              {
                type: "text",
                text: `Task list ${taskListId} deleted.`,
              },
            ],
          };
        }

        if (name === "tasks_list_tasks") {
          const { taskListId, showCompleted, maxResults, pageToken } = args as {
            taskListId: string;
            showCompleted?: boolean;
            maxResults?: number;
            pageToken?: string;
          };
          const result = await this.tasks!.listTasks(taskListId, {
            showCompleted,
            maxResults,
            pageToken,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "tasks_create_task") {
          const { taskListId, title, notes, due } = TaskCreateOptionsSchema.parse(args);
          const result = await this.tasks!.createTask(taskListId, { title, notes, due });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "tasks_update_task") {
          const { taskListId, taskId, title, notes, status, due } =
            TaskUpdateOptionsSchema.parse(args);
          const result = await this.tasks!.updateTask(taskListId, taskId, {
            title,
            notes,
            status,
            due,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "tasks_delete_task") {
          const { taskListId, taskId } = args as {
            taskListId: string;
            taskId: string;
          };
          await this.tasks!.deleteTask(taskListId, taskId);
          return {
            content: [
              {
                type: "text",
                text: `Task ${taskId} deleted.`,
              },
            ],
          };
        }

        if (name === "tasks_complete_task") {
          const { taskListId, taskId } = args as {
            taskListId: string;
            taskId: string;
          };
          const result = await this.tasks!.completeTask(taskListId, taskId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Notes (Keep-like) tools
        if (name === "notes_create") {
          const { title, content } = args as { title: string; content: string };
          const result = await this.tasks!.createNote(title, content);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "notes_list") {
          const result = await this.tasks!.listNotes();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "notes_update") {
          const { taskId, title, content } = args as {
            taskId: string;
            title?: string;
            content?: string;
          };
          const result = await this.tasks!.updateNote(taskId, title, content);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "notes_delete") {
          const { taskId } = args as { taskId: string };
          await this.tasks!.deleteNote(taskId);
          return {
            content: [
              {
                type: "text",
                text: `Note ${taskId} deleted.`,
              },
            ],
          };
        }

        // Google Calendar tools
        if (name === "calendar_list") {
          const result = await this.calendar!.listCalendars();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_get") {
          const { calendarId } = args as { calendarId: string };
          const result = await this.calendar!.getCalendar(calendarId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_list_events") {
          const { calendarId, timeMin, timeMax, maxResults, q, pageToken } = args as {
            calendarId?: string;
            timeMin?: string;
            timeMax?: string;
            maxResults?: number;
            q?: string;
            pageToken?: string;
          };
          const result = await this.calendar!.listEvents(calendarId || "primary", {
            timeMin,
            timeMax,
            maxResults,
            q,
            pageToken,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_get_event") {
          const { calendarId, eventId } = args as {
            calendarId?: string;
            eventId: string;
          };
          const result = await this.calendar!.getEvent(calendarId || "primary", eventId);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_create_event") {
          const {
            calendarId,
            summary,
            description,
            location,
            startDateTime,
            endDateTime,
            startDate,
            endDate,
            timeZone,
            attendees,
            sendUpdates,
          } = args as {
            calendarId?: string;
            summary: string;
            description?: string;
            location?: string;
            startDateTime?: string;
            endDateTime?: string;
            startDate?: string;
            endDate?: string;
            timeZone?: string;
            attendees?: string[];
            sendUpdates?: "all" | "externalOnly" | "none";
          };

          const start = startDateTime
            ? { dateTime: startDateTime, timeZone }
            : { date: startDate };
          const end = endDateTime
            ? { dateTime: endDateTime, timeZone }
            : { date: endDate };

          const result = await this.calendar!.createEvent({
            calendarId,
            summary,
            description,
            location,
            start,
            end,
            attendees,
            sendUpdates,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_update_event") {
          const {
            calendarId,
            eventId,
            summary,
            description,
            location,
            startDateTime,
            endDateTime,
            timeZone,
            attendees,
            sendUpdates,
          } = args as {
            calendarId?: string;
            eventId: string;
            summary?: string;
            description?: string;
            location?: string;
            startDateTime?: string;
            endDateTime?: string;
            timeZone?: string;
            attendees?: string[];
            sendUpdates?: "all" | "externalOnly" | "none";
          };

          const start = startDateTime
            ? { dateTime: startDateTime, timeZone }
            : undefined;
          const end = endDateTime
            ? { dateTime: endDateTime, timeZone }
            : undefined;

          const result = await this.calendar!.updateEvent({
            calendarId,
            eventId,
            summary,
            description,
            location,
            start,
            end,
            attendees,
            sendUpdates,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_delete_event") {
          const { calendarId, eventId, sendUpdates } = args as {
            calendarId?: string;
            eventId: string;
            sendUpdates?: "all" | "externalOnly" | "none";
          };
          await this.calendar!.deleteEvent(calendarId || "primary", eventId, sendUpdates);
          return {
            content: [
              {
                type: "text",
                text: `Event ${eventId} deleted.`,
              },
            ],
          };
        }

        if (name === "calendar_quick_add") {
          const { calendarId, text, sendUpdates } = args as {
            calendarId?: string;
            text: string;
            sendUpdates?: "all" | "externalOnly" | "none";
          };
          const result = await this.calendar!.quickAddEvent(
            calendarId || "primary",
            text,
            sendUpdates
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_get_freebusy") {
          const { timeMin, timeMax, calendarIds } = args as {
            timeMin: string;
            timeMax: string;
            calendarIds?: string[];
          };
          const result = await this.calendar!.getFreeBusy(
            timeMin,
            timeMax,
            calendarIds || ["primary"]
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_today") {
          const { calendarId } = args as { calendarId?: string };
          const result = await this.calendar!.getTodayEvents(calendarId || "primary");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        if (name === "calendar_upcoming") {
          const { calendarId, days, maxResults } = args as {
            calendarId?: string;
            days?: number;
            maxResults?: number;
          };
          const result = await this.calendar!.getUpcomingEvents(
            calendarId || "primary",
            days || 7,
            maxResults || 20
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Gmail tools
        if (name === "gmail_get_profile") {
          const result = await this.gmail!.getProfile();
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_list_labels") {
          const result = await this.gmail!.listLabels();
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_list_messages") {
          const { maxResults, q, labelIds, pageToken } = args as {
            maxResults?: number;
            q?: string;
            labelIds?: string[];
            pageToken?: string;
          };
          const result = await this.gmail!.listMessages({ maxResults, q, labelIds, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_get_message") {
          const { messageId } = args as { messageId: string };
          const result = await this.gmail!.getMessage(messageId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_send") {
          const { to, subject, body, cc, bcc, isHtml } = args as {
            to: string;
            subject: string;
            body: string;
            cc?: string;
            bcc?: string;
            isHtml?: boolean;
          };
          const result = await this.gmail!.sendEmail({ to, subject, body, cc, bcc, isHtml });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_reply") {
          const { messageId, body, isHtml } = args as {
            messageId: string;
            body: string;
            isHtml?: boolean;
          };
          const result = await this.gmail!.replyToEmail(messageId, body, isHtml);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_trash") {
          const { messageId } = args as { messageId: string };
          await this.gmail!.trashMessage(messageId);
          return {
            content: [{ type: "text", text: `Message ${messageId} moved to trash.` }],
          };
        }

        if (name === "gmail_mark_read") {
          const { messageId } = args as { messageId: string };
          await this.gmail!.markAsRead(messageId);
          return {
            content: [{ type: "text", text: `Message ${messageId} marked as read.` }],
          };
        }

        if (name === "gmail_mark_unread") {
          const { messageId } = args as { messageId: string };
          await this.gmail!.markAsUnread(messageId);
          return {
            content: [{ type: "text", text: `Message ${messageId} marked as unread.` }],
          };
        }

        if (name === "gmail_search") {
          const { query, maxResults } = args as { query: string; maxResults?: number };
          const result = await this.gmail!.searchEmails(query, maxResults || 20);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_get_unread") {
          const { maxResults } = args as { maxResults?: number };
          const result = await this.gmail!.getUnreadEmails(maxResults || 20);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "gmail_get_thread") {
          const { threadId } = args as { threadId: string };
          const result = await this.gmail!.getThread(threadId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // Contacts tools
        if (name === "contacts_list") {
          const { pageSize, pageToken, sortOrder } = args as {
            pageSize?: number;
            pageToken?: string;
            sortOrder?: "LAST_MODIFIED_ASCENDING" | "LAST_MODIFIED_DESCENDING" | "FIRST_NAME_ASCENDING" | "LAST_NAME_ASCENDING";
          };
          const result = await this.people!.listContacts({ pageSize, pageToken, sortOrder });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "contacts_get") {
          const { resourceName } = args as { resourceName: string };
          const result = await this.people!.getContact(resourceName);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "contacts_search") {
          const { query, maxResults } = args as { query: string; maxResults?: number };
          const result = await this.people!.searchContacts(query, maxResults || 30);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "contacts_create") {
          const { givenName, familyName, email, phone, organization, jobTitle, notes } = args as {
            givenName: string;
            familyName?: string;
            email?: string;
            phone?: string;
            organization?: string;
            jobTitle?: string;
            notes?: string;
          };
          const result = await this.people!.createContact({
            givenName,
            familyName,
            emails: email ? [{ value: email }] : undefined,
            phoneNumbers: phone ? [{ value: phone }] : undefined,
            organization: organization || jobTitle ? { name: organization, title: jobTitle } : undefined,
            notes,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "contacts_delete") {
          const { resourceName } = args as { resourceName: string };
          await this.people!.deleteContact(resourceName);
          return {
            content: [{ type: "text", text: `Contact ${resourceName} deleted.` }],
          };
        }

        if (name === "contacts_list_groups") {
          const result = await this.people!.listContactGroups();
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "contacts_get_group") {
          const { resourceName } = args as { resourceName: string };
          const result = await this.people!.getContactGroup(resourceName);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        // YouTube tools
        if (name === "youtube_search") {
          const { query, type, maxResults, order, pageToken } = args as {
            query: string;
            type?: "video" | "channel" | "playlist";
            maxResults?: number;
            order?: "date" | "rating" | "relevance" | "title" | "viewCount";
            pageToken?: string;
          };
          const result = await this.youtube!.search({ query, type, maxResults, order, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_get_video") {
          const { videoId } = args as { videoId: string };
          const result = await this.youtube!.getVideo(videoId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_get_channel") {
          const { channelId } = args as { channelId: string };
          const result = await this.youtube!.getChannel(channelId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_get_my_channel") {
          const result = await this.youtube!.getMyChannel();
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_list_playlists") {
          const { maxResults, pageToken } = args as { maxResults?: number; pageToken?: string };
          const result = await this.youtube!.listMyPlaylists({ maxResults, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_get_playlist_items") {
          const { playlistId, maxResults, pageToken } = args as {
            playlistId: string;
            maxResults?: number;
            pageToken?: string;
          };
          const result = await this.youtube!.getPlaylistItems(playlistId, { maxResults, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_get_video_comments") {
          const { videoId, maxResults, order } = args as {
            videoId: string;
            maxResults?: number;
            order?: "time" | "relevance";
          };
          const result = await this.youtube!.getVideoComments(videoId, { maxResults, order });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_list_subscriptions") {
          const { maxResults, pageToken } = args as { maxResults?: number; pageToken?: string };
          const result = await this.youtube!.listMySubscriptions({ maxResults, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_list_liked_videos") {
          const { maxResults, pageToken } = args as { maxResults?: number; pageToken?: string };
          const result = await this.youtube!.listLikedVideos({ maxResults, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "youtube_rate_video") {
          const { videoId, rating } = args as { videoId: string; rating: "like" | "dislike" | "none" };
          await this.youtube!.rateVideo(videoId, rating);
          return {
            content: [{ type: "text", text: `Video ${videoId} rated as '${rating}'.` }],
          };
        }

        // Slides tools
        if (name === "slides_create") {
          const { title, folderId } = args as { title: string; folderId?: string };
          const result = await this.slidesService!.createPresentation({ title, folderId });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "slides_get") {
          const { presentationId } = args as { presentationId: string };
          const result = await this.slidesService!.getPresentation(presentationId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "slides_list") {
          const { pageSize, pageToken } = args as { pageSize?: number; pageToken?: string };
          const result = await this.slidesService!.listPresentations(pageSize || 50, pageToken);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "slides_add_slide") {
          const { presentationId, layoutType, insertionIndex } = args as {
            presentationId: string;
            layoutType?: "BLANK" | "CAPTION_ONLY" | "TITLE" | "TITLE_AND_BODY" | "TITLE_AND_TWO_COLUMNS" | "TITLE_ONLY" | "SECTION_HEADER" | "MAIN_POINT" | "BIG_NUMBER";
            insertionIndex?: number;
          };
          const slideId = await this.slidesService!.addSlide({ presentationId, layoutType, insertionIndex });
          return {
            content: [{ type: "text", text: JSON.stringify({ slideId }, null, 2) }],
          };
        }

        if (name === "slides_delete_slide") {
          const { presentationId, slideObjectId } = args as { presentationId: string; slideObjectId: string };
          await this.slidesService!.deleteSlide(presentationId, slideObjectId);
          return {
            content: [{ type: "text", text: `Slide ${slideObjectId} deleted.` }],
          };
        }

        if (name === "slides_add_text") {
          const { presentationId, slideObjectId, text, x, y, width, height } = args as {
            presentationId: string;
            slideObjectId: string;
            text: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          };
          const textBoxId = await this.slidesService!.addTextBox({
            presentationId,
            slideObjectId,
            text,
            x,
            y,
            width,
            height,
          });
          return {
            content: [{ type: "text", text: JSON.stringify({ textBoxId }, null, 2) }],
          };
        }

        if (name === "slides_add_image") {
          const { presentationId, slideObjectId, imageUrl, x, y, width, height } = args as {
            presentationId: string;
            slideObjectId: string;
            imageUrl: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
          };
          const imageId = await this.slidesService!.addImage({
            presentationId,
            slideObjectId,
            imageUrl,
            x,
            y,
            width,
            height,
          });
          return {
            content: [{ type: "text", text: JSON.stringify({ imageId }, null, 2) }],
          };
        }

        if (name === "slides_replace_text") {
          const { presentationId, searchText, replaceText, matchCase } = args as {
            presentationId: string;
            searchText: string;
            replaceText: string;
            matchCase?: boolean;
          };
          const count = await this.slidesService!.replaceAllText(
            presentationId,
            searchText,
            replaceText,
            matchCase ?? true
          );
          return {
            content: [{ type: "text", text: `Replaced ${count} occurrence(s).` }],
          };
        }

        if (name === "slides_duplicate_slide") {
          const { presentationId, slideObjectId } = args as { presentationId: string; slideObjectId: string };
          const newSlideId = await this.slidesService!.duplicateSlide(presentationId, slideObjectId);
          return {
            content: [{ type: "text", text: JSON.stringify({ newSlideId }, null, 2) }],
          };
        }

        // Google Forms handlers
        if (name === "forms_create") {
          this.ensureAuthenticated();
          const { title, documentTitle, description } = args as {
            title: string;
            documentTitle?: string;
            description?: string;
          };
          const form = await this.forms!.createForm({ title, documentTitle, description });
          return {
            content: [{ type: "text", text: JSON.stringify(form, null, 2) }],
          };
        }

        if (name === "forms_get") {
          this.ensureAuthenticated();
          const { formId } = args as { formId: string };
          const form = await this.forms!.getForm(formId);
          return {
            content: [{ type: "text", text: JSON.stringify(form, null, 2) }],
          };
        }

        if (name === "forms_update_info") {
          this.ensureAuthenticated();
          const { formId, title, description } = args as {
            formId: string;
            title?: string;
            description?: string;
          };
          const form = await this.forms!.updateFormInfo(formId, { title, description });
          return {
            content: [{ type: "text", text: JSON.stringify(form, null, 2) }],
          };
        }

        if (name === "forms_add_question") {
          this.ensureAuthenticated();
          const { formId, title, description, required, index, questionType, options, scaleConfig } = args as {
            formId: string;
            title: string;
            description?: string;
            required?: boolean;
            index?: number;
            questionType: "short_answer" | "paragraph" | "multiple_choice" | "checkboxes" | "dropdown" | "linear_scale" | "date" | "time";
            options?: string[];
            scaleConfig?: { low: number; high: number; lowLabel?: string; highLabel?: string };
          };
          const item = await this.forms!.addQuestion({
            formId,
            title,
            description,
            required,
            index,
            questionType,
            options,
            scaleConfig,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
          };
        }

        if (name === "forms_delete_item") {
          this.ensureAuthenticated();
          const { formId, itemIndex } = args as { formId: string; itemIndex: number };
          await this.forms!.deleteItem(formId, itemIndex);
          return {
            content: [{ type: "text", text: `Item at index ${itemIndex} deleted.` }],
          };
        }

        if (name === "forms_list_responses") {
          this.ensureAuthenticated();
          const { formId, pageSize, pageToken } = args as {
            formId: string;
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.forms!.listResponses(formId, { pageSize, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "forms_get_response") {
          this.ensureAuthenticated();
          const { formId, responseId } = args as { formId: string; responseId: string };
          const response = await this.forms!.getResponse(formId, responseId);
          return {
            content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          };
        }

        if (name === "forms_add_page_break") {
          this.ensureAuthenticated();
          const { formId, title, index } = args as { formId: string; title: string; index?: number };
          const item = await this.forms!.addPageBreak(formId, title, index);
          return {
            content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
          };
        }

        if (name === "forms_add_text") {
          this.ensureAuthenticated();
          const { formId, title, description, index } = args as {
            formId: string;
            title: string;
            description?: string;
            index?: number;
          };
          const item = await this.forms!.addTextItem(formId, title, description, index);
          return {
            content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
          };
        }

        if (name === "forms_add_image") {
          this.ensureAuthenticated();
          const { formId, sourceUri, title, altText, index } = args as {
            formId: string;
            sourceUri: string;
            title?: string;
            altText?: string;
            index?: number;
          };
          const item = await this.forms!.addImage(formId, sourceUri, { title, altText, index });
          return {
            content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
          };
        }

        if (name === "forms_add_video") {
          this.ensureAuthenticated();
          const { formId, youtubeUri, title, caption, index } = args as {
            formId: string;
            youtubeUri: string;
            title?: string;
            caption?: string;
            index?: number;
          };
          const item = await this.forms!.addVideo(formId, youtubeUri, { title, caption, index });
          return {
            content: [{ type: "text", text: JSON.stringify(item, null, 2) }],
          };
        }

        // Google Chat handlers
        if (name === "chat_list_spaces") {
          this.ensureAuthenticated();
          const { pageSize, pageToken } = args as { pageSize?: number; pageToken?: string };
          const result = await this.chat!.listSpaces(pageSize, pageToken);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "chat_get_space") {
          this.ensureAuthenticated();
          const { spaceName } = args as { spaceName: string };
          const space = await this.chat!.getSpace(spaceName);
          return {
            content: [{ type: "text", text: JSON.stringify(space, null, 2) }],
          };
        }

        if (name === "chat_create_space") {
          this.ensureAuthenticated();
          const { displayName, spaceType, externalUserAllowed, description, guidelines } = args as {
            displayName: string;
            spaceType?: "SPACE" | "GROUP_CHAT" | "DIRECT_MESSAGE";
            externalUserAllowed?: boolean;
            description?: string;
            guidelines?: string;
          };
          const space = await this.chat!.createSpace({
            displayName,
            spaceType,
            externalUserAllowed,
            spaceDetails: description || guidelines ? { description, guidelines } : undefined,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(space, null, 2) }],
          };
        }

        if (name === "chat_delete_space") {
          this.ensureAuthenticated();
          const { spaceName } = args as { spaceName: string };
          await this.chat!.deleteSpace(spaceName);
          return {
            content: [{ type: "text", text: `Space ${spaceName} deleted.` }],
          };
        }

        if (name === "chat_list_messages") {
          this.ensureAuthenticated();
          const { spaceName, pageSize, pageToken, filter, orderBy } = args as {
            spaceName: string;
            pageSize?: number;
            pageToken?: string;
            filter?: string;
            orderBy?: string;
          };
          const result = await this.chat!.listMessages(spaceName, { pageSize, pageToken, filter, orderBy });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "chat_get_message") {
          this.ensureAuthenticated();
          const { messageName } = args as { messageName: string };
          const message = await this.chat!.getMessage(messageName);
          return {
            content: [{ type: "text", text: JSON.stringify(message, null, 2) }],
          };
        }

        if (name === "chat_send_message") {
          this.ensureAuthenticated();
          const { spaceName, text, threadKey } = args as {
            spaceName: string;
            text: string;
            threadKey?: string;
          };
          const message = await this.chat!.sendMessage({ spaceName, text, threadKey });
          return {
            content: [{ type: "text", text: JSON.stringify(message, null, 2) }],
          };
        }

        if (name === "chat_update_message") {
          this.ensureAuthenticated();
          const { messageName, text } = args as { messageName: string; text: string };
          const message = await this.chat!.updateMessage({ messageName, text });
          return {
            content: [{ type: "text", text: JSON.stringify(message, null, 2) }],
          };
        }

        if (name === "chat_delete_message") {
          this.ensureAuthenticated();
          const { messageName, force } = args as { messageName: string; force?: boolean };
          await this.chat!.deleteMessage(messageName, force);
          return {
            content: [{ type: "text", text: `Message ${messageName} deleted.` }],
          };
        }

        if (name === "chat_list_members") {
          this.ensureAuthenticated();
          const { spaceName, pageSize, pageToken } = args as {
            spaceName: string;
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.chat!.listMembers(spaceName, { pageSize, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "chat_add_member") {
          this.ensureAuthenticated();
          const { spaceName, userId, role } = args as {
            spaceName: string;
            userId: string;
            role?: "ROLE_MEMBER" | "ROLE_MANAGER";
          };
          const member = await this.chat!.addMember(spaceName, userId, role);
          return {
            content: [{ type: "text", text: JSON.stringify(member, null, 2) }],
          };
        }

        if (name === "chat_remove_member") {
          this.ensureAuthenticated();
          const { memberName } = args as { memberName: string };
          await this.chat!.removeMember(memberName);
          return {
            content: [{ type: "text", text: `Member ${memberName} removed.` }],
          };
        }

        if (name === "chat_add_reaction") {
          this.ensureAuthenticated();
          const { messageName, emoji } = args as { messageName: string; emoji: string };
          await this.chat!.addReaction(messageName, emoji);
          return {
            content: [{ type: "text", text: `Reaction ${emoji} added to ${messageName}.` }],
          };
        }

        // Google Meet handlers
        if (name === "meet_create_space") {
          this.ensureAuthenticated();
          const { accessType, entryPointAccess } = args as {
            accessType?: "OPEN" | "TRUSTED" | "RESTRICTED";
            entryPointAccess?: "ALL" | "CREATOR_APP_ONLY";
          };
          const space = await this.meet!.createSpace({ accessType, entryPointAccess });
          return {
            content: [{ type: "text", text: JSON.stringify(space, null, 2) }],
          };
        }

        if (name === "meet_get_space") {
          this.ensureAuthenticated();
          const { spaceName } = args as { spaceName: string };
          const space = await this.meet!.getSpace(spaceName);
          return {
            content: [{ type: "text", text: JSON.stringify(space, null, 2) }],
          };
        }

        if (name === "meet_end_conference") {
          this.ensureAuthenticated();
          const { spaceName } = args as { spaceName: string };
          await this.meet!.endActiveConference(spaceName);
          return {
            content: [{ type: "text", text: `Conference in ${spaceName} ended.` }],
          };
        }

        if (name === "meet_schedule") {
          this.ensureAuthenticated();
          const { summary, description, startTime, endTime, attendees, timeZone, sendUpdates } = args as {
            summary: string;
            description?: string;
            startTime: string;
            endTime: string;
            attendees?: string[];
            timeZone?: string;
            sendUpdates?: "all" | "externalOnly" | "none";
          };
          const meeting = await this.meet!.scheduleMeeting({
            summary,
            description,
            startTime,
            endTime,
            attendees,
            timeZone,
            sendUpdates,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(meeting, null, 2) }],
          };
        }

        if (name === "meet_create_instant") {
          this.ensureAuthenticated();
          const meeting = await this.meet!.createInstantMeeting();
          return {
            content: [{ type: "text", text: JSON.stringify(meeting, null, 2) }],
          };
        }

        if (name === "meet_get_by_event") {
          this.ensureAuthenticated();
          const { eventId } = args as { eventId: string };
          const meeting = await this.meet!.getMeetingByCalendarEvent(eventId);
          return {
            content: [{ type: "text", text: JSON.stringify(meeting, null, 2) }],
          };
        }

        if (name === "meet_list_upcoming") {
          this.ensureAuthenticated();
          const { days } = args as { days?: number };
          const meetings = await this.meet!.listUpcomingMeetings(days);
          return {
            content: [{ type: "text", text: JSON.stringify(meetings, null, 2) }],
          };
        }

        if (name === "meet_list_conference_records") {
          this.ensureAuthenticated();
          const { pageSize, pageToken, filter } = args as {
            pageSize?: number;
            pageToken?: string;
            filter?: string;
          };
          const result = await this.meet!.listConferenceRecords({ pageSize, pageToken, filter });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "meet_get_conference_record") {
          this.ensureAuthenticated();
          const { recordName } = args as { recordName: string };
          const record = await this.meet!.getConferenceRecord(recordName);
          return {
            content: [{ type: "text", text: JSON.stringify(record, null, 2) }],
          };
        }

        if (name === "meet_list_participants") {
          this.ensureAuthenticated();
          const { conferenceRecordName, pageSize, pageToken } = args as {
            conferenceRecordName: string;
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.meet!.listParticipants(conferenceRecordName, { pageSize, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "meet_list_recordings") {
          this.ensureAuthenticated();
          const { conferenceRecordName, pageSize, pageToken } = args as {
            conferenceRecordName: string;
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.meet!.listRecordings(conferenceRecordName, { pageSize, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "meet_get_recording") {
          this.ensureAuthenticated();
          const { recordingName } = args as { recordingName: string };
          const recording = await this.meet!.getRecording(recordingName);
          return {
            content: [{ type: "text", text: JSON.stringify(recording, null, 2) }],
          };
        }

        if (name === "meet_list_transcripts") {
          this.ensureAuthenticated();
          const { conferenceRecordName, pageSize, pageToken } = args as {
            conferenceRecordName: string;
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.meet!.listTranscripts(conferenceRecordName, { pageSize, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        if (name === "meet_get_transcript") {
          this.ensureAuthenticated();
          const { transcriptName } = args as { transcriptName: string };
          const transcript = await this.meet!.getTranscript(transcriptName);
          return {
            content: [{ type: "text", text: JSON.stringify(transcript, null, 2) }],
          };
        }

        if (name === "meet_list_transcript_entries") {
          this.ensureAuthenticated();
          const { transcriptName, pageSize, pageToken } = args as {
            transcriptName: string;
            pageSize?: number;
            pageToken?: string;
          };
          const result = await this.meet!.listTranscriptEntries(transcriptName, { pageSize, pageToken });
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  public async run(): Promise<void> {
    // Ensure directories exist on startup
    oauth.ensureDirectoriesExist();

    // Log configuration paths for user reference
    const paths = GoogleOAuth.getPaths();
    console.error("Google MCP Server starting...");
    console.error(`  Config directory: ${paths.configDir}`);
    console.error(`  Data directory: ${paths.dataDir}`);
    console.error(`  Credentials file: ${paths.credentialsPath}`);
    console.error(`  Token file: ${paths.tokenPath}`);

    // Try to initialize OAuth on startup, auto-triggering auth if tokens are missing/expired
    const authenticated = await oauth.initializeWithAuth();
    if (authenticated && oauth.isReady()) {
      this.initializeServices();
      console.error("  Authentication: Ready");
    } else {
      console.error("  Authentication: Not configured (run google_auth tool or add credentials)");
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Google MCP Server running on stdio");
  }
}

