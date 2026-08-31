# Google MCP Server

A comprehensive Model Context Protocol (MCP) server for Google integration, providing access to Google Calendar, Docs, Sheets, Slides, Drive, Gmail, Contacts, YouTube, Tasks, Forms, Chat, and Meet.

## Features

### Google Forms
- Create and manage Google Forms
- Add questions (multiple choice, short answer, checkboxes, etc.)
- Add page breaks, text items, images, and videos
- List and retrieve form responses
- Update form settings (quiz mode, etc.)

### Google Chat
- List, create, and manage Chat spaces
- Send, update, and delete messages
- Add and remove reactions
- Manage space members
- Thread support for conversations

### Google Meet
- Create meeting spaces with access controls
- Schedule meetings via Calendar integration
- Create instant meetings
- List and access conference records
- View participant information
- Access meeting recordings and transcripts

### Google Calendar
- List calendars and events
- Create, update, and delete events
- Quick add events using natural language
- Get today's events and upcoming events
- Check free/busy availability

### Google Gmail
- Read, search, and list emails
- Send emails and reply to threads
- Mark as read/unread, trash messages
- List labels and organize emails

### Google Contacts (People API)
- List, search, and manage contacts
- Create, update, and delete contacts
- List contact groups

### Google Drive
- List, search, and browse files and folders
- Upload, download, copy, move, and delete files
- Create folders
- Rename files

### Google Docs
- Create new documents with optional initial content
- Read document content
- Insert and append text
- Find and replace text
- List all documents

### Google Sheets
- Create spreadsheets with multiple sheets
- Read values from ranges
- Update and append values
- Clear ranges
- Add and delete sheets
- List all spreadsheets

### Google Slides
- Create and manage presentations
- Add, delete, and duplicate slides
- Add text boxes and images
- Find and replace text
- List all presentations

### Google YouTube
- Search videos, channels, and playlists
- Get video and channel details
- View and manage playlists
- Get video comments
- View subscriptions and liked videos
- Rate videos

### Google Tasks (Keep Alternative)
- Manage task lists (similar to Keep categories)
- Create, update, complete, and delete tasks
- Tasks support notes/descriptions (similar to Keep notes)
- Convenience "notes" tools that provide Keep-like functionality

> **Note:** Google Keep does not have an official public API. This server uses Google Tasks API as an alternative, which provides similar note-taking capabilities through tasks with descriptions.

## Installation

```bash
# Clone the repository
cd google-mcp

# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Google Cloud Setup

Before using this server, you need to set up Google Cloud credentials:

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Calendar API
   - Google Docs API
   - Google Sheets API
   - Google Slides API
   - Google Drive API
   - Gmail API
   - People API (Contacts)
   - YouTube Data API v3
   - Google Tasks API
   - Google Forms API
   - Google Chat API
   - Google Meet REST API

### 2. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Select **Desktop app** as the application type
4. Download the JSON file

### 3. Place Credentials File

Save the downloaded JSON file as `credentials.json` at the appropriate location for your platform:

**Linux:**
```
~/.config/google-mcp/credentials.json
```
(or `$XDG_CONFIG_HOME/google-mcp/credentials.json` if XDG_CONFIG_HOME is set)

**macOS:**
```
~/Library/Application Support/google-mcp/credentials.json
```

**Windows:**
```
%APPDATA%\google-mcp\credentials.json
```
(typically `C:\Users\<username>\AppData\Roaming\google-mcp\credentials.json`)

The file should look like:
```json
{
  "installed": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": ["http://localhost:3000/oauth2callback"]
  }
}
```

## Usage with Cursor/Claude

The server runs as a long-lived SSE worker, not as a stdio subprocess. Start it
once, then point clients at its `/sse` endpoint.

Start the worker:

```bash
node /path/to/google-mcp/dist/index.js
# or from the project directory:
pnpm dev
```

It listens on `127.0.0.1:3015` by default. Override with `GOOGLE_MCP_HOST` and
`GOOGLE_MCP_PORT` (or `PORT`).

Add to your MCP settings configuration:

```json
{
  "mcpServers": {
    "google": {
      "url": "http://127.0.0.1:3015/sse"
    }
  }
}
```

Every client that connects gets its own MCP session while sharing one
authenticated Google session, so you only complete the OAuth flow once no
matter how many clients or agents attach.

## Authentication

On first use, call the `google_auth` tool to initiate OAuth authentication:

1. The server will provide a URL to authenticate
2. Open the URL in a browser and sign in with your Google account
3. Grant the requested permissions
4. Authentication will complete automatically

Tokens are stored locally and will be refreshed automatically:
- **Linux:** `~/.local/share/google-mcp/tokens.json` (or `$XDG_DATA_HOME/google-mcp/`)
- **macOS:** `~/Library/Application Support/google-mcp/tokens.json`
- **Windows:** `%APPDATA%\google-mcp\tokens.json`

## Available Tools

### Authentication
| Tool | Description |
|------|-------------|
| `google_auth` | Initiate OAuth authentication |
| `google_auth_status` | Check authentication status |
| `google_auth_code` | Manually set auth code |
| `google_logout` | Log out and clear tokens |

### Google Calendar
| Tool | Description |
|------|-------------|
| `calendar_list` | List all calendars |
| `calendar_get` | Get calendar details |
| `calendar_list_events` | List events from calendar |
| `calendar_get_event` | Get event details |
| `calendar_create_event` | Create new event |
| `calendar_update_event` | Update existing event |
| `calendar_delete_event` | Delete an event |
| `calendar_quick_add` | Add event via natural language |
| `calendar_get_freebusy` | Check availability |
| `calendar_today` | Get today's events |
| `calendar_upcoming` | Get upcoming events |

### Google Gmail
| Tool | Description |
|------|-------------|
| `gmail_get_profile` | Get Gmail profile info |
| `gmail_list_labels` | List Gmail labels |
| `gmail_list_messages` | List emails |
| `gmail_get_message` | Get specific email |
| `gmail_send` | Send an email |
| `gmail_reply` | Reply to an email |
| `gmail_trash` | Move to trash |
| `gmail_mark_read` | Mark as read |
| `gmail_mark_unread` | Mark as unread |
| `gmail_search` | Search emails |
| `gmail_get_unread` | Get unread emails |
| `gmail_get_thread` | Get email thread |

### Google Contacts
| Tool | Description |
|------|-------------|
| `contacts_list` | List contacts |
| `contacts_get` | Get contact details |
| `contacts_search` | Search contacts |
| `contacts_create` | Create contact |
| `contacts_delete` | Delete contact |
| `contacts_list_groups` | List contact groups |

### Google Drive
| Tool | Description |
|------|-------------|
| `drive_list_files` | List files with filtering |
| `drive_get_file` | Get file metadata |
| `drive_download_file` | Download file content |
| `drive_upload_file` | Upload a new file |
| `drive_delete_file` | Delete a file |
| `drive_create_folder` | Create a new folder |
| `drive_search` | Search files by content |
| `drive_move_file` | Move file to folder |
| `drive_copy_file` | Copy a file |
| `drive_rename_file` | Rename a file |

### Google Docs
| Tool | Description |
|------|-------------|
| `docs_create` | Create a new document |
| `docs_read` | Read document content |
| `docs_insert_text` | Insert text at position |
| `docs_append_text` | Append text to end |
| `docs_replace_text` | Find and replace text |
| `docs_list` | List all documents |

### Google Sheets
| Tool | Description |
|------|-------------|
| `sheets_create` | Create spreadsheet |
| `sheets_get` | Get spreadsheet info |
| `sheets_read` | Read values from range |
| `sheets_update` | Update values in range |
| `sheets_append` | Append rows |
| `sheets_clear` | Clear a range |
| `sheets_add_sheet` | Add a new sheet |
| `sheets_delete_sheet` | Delete a sheet |
| `sheets_list` | List all spreadsheets |

### Google Slides
| Tool | Description |
|------|-------------|
| `slides_create` | Create presentation |
| `slides_get` | Get presentation |
| `slides_list` | List presentations |
| `slides_add_slide` | Add a slide |
| `slides_delete_slide` | Delete a slide |
| `slides_add_text` | Add text box |
| `slides_add_image` | Add image |
| `slides_replace_text` | Find/replace text |
| `slides_duplicate_slide` | Duplicate slide |

### Google YouTube
| Tool | Description |
|------|-------------|
| `youtube_search` | Search YouTube |
| `youtube_get_video` | Get video details |
| `youtube_get_channel` | Get channel details |
| `youtube_get_my_channel` | Get your channel |
| `youtube_list_playlists` | List your playlists |
| `youtube_get_playlist_items` | Get playlist videos |
| `youtube_get_video_comments` | Get video comments |
| `youtube_list_subscriptions` | List subscriptions |
| `youtube_list_liked_videos` | List liked videos |
| `youtube_rate_video` | Like/dislike video |

### Google Tasks
| Tool | Description |
|------|-------------|
| `tasks_list_tasklists` | List task lists |
| `tasks_create_tasklist` | Create task list |
| `tasks_delete_tasklist` | Delete task list |
| `tasks_list_tasks` | List tasks |
| `tasks_create_task` | Create a task |
| `tasks_update_task` | Update a task |
| `tasks_delete_task` | Delete a task |
| `tasks_complete_task` | Mark task complete |

### Notes (Keep-like)
| Tool | Description |
|------|-------------|
| `notes_create` | Create a quick note |
| `notes_list` | List all notes |
| `notes_update` | Update a note |
| `notes_delete` | Delete a note |

### Google Forms
| Tool | Description |
|------|-------------|
| `forms_create` | Create a new form |
| `forms_get` | Get form details |
| `forms_update_info` | Update title/description |
| `forms_add_question` | Add a question |
| `forms_delete_item` | Delete form item |
| `forms_list_responses` | List form responses |
| `forms_get_response` | Get specific response |
| `forms_add_page_break` | Add page break |
| `forms_add_text` | Add text item |
| `forms_add_image` | Add image |
| `forms_add_video` | Add YouTube video |

### Google Chat
| Tool | Description |
|------|-------------|
| `chat_list_spaces` | List Chat spaces |
| `chat_get_space` | Get space details |
| `chat_create_space` | Create a space |
| `chat_delete_space` | Delete a space |
| `chat_list_messages` | List messages |
| `chat_get_message` | Get message details |
| `chat_send_message` | Send a message |
| `chat_update_message` | Update a message |
| `chat_delete_message` | Delete a message |
| `chat_list_members` | List space members |
| `chat_add_member` | Add a member |
| `chat_remove_member` | Remove a member |
| `chat_add_reaction` | Add emoji reaction |

### Google Meet
| Tool | Description |
|------|-------------|
| `meet_create_space` | Create meeting space |
| `meet_get_space` | Get space details |
| `meet_end_conference` | End active meeting |
| `meet_schedule` | Schedule a meeting |
| `meet_create_instant` | Create instant meeting |
| `meet_get_by_event` | Get meeting from event |
| `meet_list_upcoming` | List upcoming meetings |
| `meet_list_conference_records` | List past meetings |
| `meet_get_conference_record` | Get meeting record |
| `meet_list_participants` | List participants |
| `meet_list_recordings` | List recordings |
| `meet_get_recording` | Get recording |
| `meet_list_transcripts` | List transcripts |
| `meet_get_transcript` | Get transcript |
| `meet_list_transcript_entries` | Get transcript text |

## Examples

### Send an Email
```
Use gmail_send with to "recipient@example.com", subject "Hello", and body "This is a test email."
```

### Create a Calendar Event
```
Use calendar_create_event with summary "Team Meeting", startDateTime "2025-01-15T10:00:00-05:00", and endDateTime "2025-01-15T11:00:00-05:00"
```

### Search YouTube
```
Use youtube_search with query "MCP tutorial" and type "video"
```

### Create a Google Doc
```
Use docs_create with title "Meeting Notes" and content "# Weekly Meeting\n\nAttendees: ..."
```

### Read a Spreadsheet
```
Use sheets_read with spreadsheetId "abc123" and range "Sheet1!A1:D10"
```

### Search Drive
```
Use drive_search with query "quarterly report"
```

### Create a Note
```
Use notes_create with title "Shopping List" and content "- Milk\n- Eggs\n- Bread"
```

### Create a Google Form
```
Use forms_create with title "Customer Survey" and description "Help us improve our service"
```

### Send a Chat Message
```
Use chat_send_message with spaceName "spaces/AAAAA" and text "Hello team!"
```

### Schedule a Google Meet
```
Use meet_schedule with summary "Team Standup", startTime "2025-01-15T09:00:00-05:00", and endTime "2025-01-15T09:30:00-05:00"
```

## Development

```bash
# Run in development mode with hot reload
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
