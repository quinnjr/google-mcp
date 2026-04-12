import { google, type calendar_v3, type Auth } from "googleapis";

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  htmlLink?: string;
  status?: string;
  created?: string;
  updated?: string;
  recurringEventId?: string;
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  colorId?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface EventCreateOptions {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: string[];
  sendUpdates?: "all" | "externalOnly" | "none";
  recurrence?: string[];
  meetLink?: string;
  colorId?: string;
}

export interface EventUpdateOptions {
  calendarId?: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: string[];
  sendUpdates?: "all" | "externalOnly" | "none";
  colorId?: string;
}

export class CalendarService {
  private readonly calendar: calendar_v3.Calendar;

  constructor(authClient: Auth.OAuth2Client) {
    this.calendar = google.calendar({ version: "v3", auth: authClient });
  }

  // Calendar List Operations

  public async listCalendars(): Promise<CalendarInfo[]> {
    const response = await this.calendar.calendarList.list({
      maxResults: 250,
    });

    return (response.data.items || []).map((cal) => ({
      id: cal.id!,
      summary: cal.summary || "",
      description: cal.description || undefined,
      timeZone: cal.timeZone || undefined,
      primary: cal.primary || false,
      accessRole: cal.accessRole || undefined,
      backgroundColor: cal.backgroundColor || undefined,
      foregroundColor: cal.foregroundColor || undefined,
    }));
  }

  public async getCalendar(calendarId: string): Promise<CalendarInfo> {
    const response = await this.calendar.calendarList.get({
      calendarId,
    });

    return {
      id: response.data.id!,
      summary: response.data.summary || "",
      description: response.data.description || undefined,
      timeZone: response.data.timeZone || undefined,
      primary: response.data.primary || false,
      accessRole: response.data.accessRole || undefined,
      backgroundColor: response.data.backgroundColor || undefined,
      foregroundColor: response.data.foregroundColor || undefined,
    };
  }

  // Event Operations

  public async listEvents(
    calendarId = "primary",
    options: {
      timeMin?: string;
      timeMax?: string;
      maxResults?: number;
      pageToken?: string;
      singleEvents?: boolean;
      orderBy?: "startTime" | "updated";
      q?: string;
    } = {}
  ): Promise<{ events: CalendarEvent[]; nextPageToken?: string }> {
    const response = await this.calendar.events.list({
      calendarId,
      timeMin: options.timeMin || new Date().toISOString(),
      timeMax: options.timeMax,
      maxResults: options.maxResults || 50,
      pageToken: options.pageToken,
      singleEvents: options.singleEvents ?? true,
      orderBy: options.orderBy || "startTime",
      q: options.q,
    });

    const events: CalendarEvent[] = (response.data.items || []).map((event) =>
      this.formatEvent(event)
    );

    return {
      events,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getEvent(calendarId = "primary", eventId: string): Promise<CalendarEvent> {
    const response = await this.calendar.events.get({
      calendarId,
      eventId,
    });

    return this.formatEvent(response.data);
  }

  public async createEvent(options: EventCreateOptions): Promise<CalendarEvent> {
    const calendarId = options.calendarId || "primary";

    const eventResource: calendar_v3.Schema$Event = {
      summary: options.summary,
      description: options.description,
      location: options.location,
      start: options.start,
      end: options.end,
      attendees: options.attendees?.map((email) => ({ email })),
      recurrence: options.recurrence,
      colorId: options.colorId,
    };

    if (options.meetLink) {
      const meetCode = options.meetLink.replace(/^https?:\/\/meet\.google\.com\//, "");
      eventResource.conferenceData = {
        conferenceSolution: { key: { type: "hangoutsMeet" } },
        entryPoints: [
          {
            entryPointType: "video",
            uri: options.meetLink,
            label: `meet.google.com/${meetCode}`,
          },
        ],
      };
    }

    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: eventResource,
      sendUpdates: options.sendUpdates || "none",
      conferenceDataVersion: options.meetLink ? 1 : 0,
    });

    return this.formatEvent(response.data);
  }

  public async updateEvent(options: EventUpdateOptions): Promise<CalendarEvent> {
    const calendarId = options.calendarId || "primary";

    // Get current event first
    const currentEvent = await this.calendar.events.get({
      calendarId,
      eventId: options.eventId,
    });

    const eventResource: calendar_v3.Schema$Event = {
      ...currentEvent.data,
      summary: options.summary ?? currentEvent.data.summary,
      description: options.description ?? currentEvent.data.description,
      location: options.location ?? currentEvent.data.location,
      start: options.start ?? currentEvent.data.start,
      end: options.end ?? currentEvent.data.end,
      attendees: options.attendees
        ? options.attendees.map((email) => ({ email }))
        : currentEvent.data.attendees,
      colorId: options.colorId ?? currentEvent.data.colorId,
    };

    const response = await this.calendar.events.update({
      calendarId,
      eventId: options.eventId,
      requestBody: eventResource,
      sendUpdates: options.sendUpdates || "none",
    });

    return this.formatEvent(response.data);
  }

  public async deleteEvent(
    calendarId = "primary",
    eventId: string,
    sendUpdates: "all" | "externalOnly" | "none" = "none"
  ): Promise<void> {
    await this.calendar.events.delete({
      calendarId,
      eventId,
      sendUpdates,
    });
  }

  public async quickAddEvent(
    calendarId = "primary",
    text: string,
    sendUpdates: "all" | "externalOnly" | "none" = "none"
  ): Promise<CalendarEvent> {
    const response = await this.calendar.events.quickAdd({
      calendarId,
      text,
      sendUpdates,
    });

    return this.formatEvent(response.data);
  }

  // Free/Busy Query

  public async getFreeBusy(
    timeMin: string,
    timeMax: string,
    calendarIds: string[] = ["primary"]
  ): Promise<{
    calendars: Record<
      string,
      { busy: Array<{ start: string; end: string }> }
    >;
  }> {
    const response = await this.calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    });

    const calendars: Record<
      string,
      { busy: Array<{ start: string; end: string }> }
    > = {};

    for (const [calId, data] of Object.entries(response.data.calendars || {})) {
      calendars[calId] = {
        busy: (data.busy || []).map((b) => ({
          start: b.start || "",
          end: b.end || "",
        })),
      };
    }

    return { calendars };
  }

  // Upcoming Events Helper

  public async getUpcomingEvents(
    calendarId = "primary",
    days = 7,
    maxResults = 20
  ): Promise<CalendarEvent[]> {
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);

    const { events } = await this.listEvents(calendarId, {
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    return events;
  }

  // Today's Events Helper

  public async getTodayEvents(calendarId = "primary"): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const { events } = await this.listEvents(calendarId, {
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    return events;
  }

  private formatEvent(event: calendar_v3.Schema$Event): CalendarEvent {
    return {
      id: event.id!,
      summary: event.summary || undefined,
      description: event.description || undefined,
      location: event.location || undefined,
      start: event.start
        ? {
            dateTime: event.start.dateTime || undefined,
            date: event.start.date || undefined,
            timeZone: event.start.timeZone || undefined,
          }
        : undefined,
      end: event.end
        ? {
            dateTime: event.end.dateTime || undefined,
            date: event.end.date || undefined,
            timeZone: event.end.timeZone || undefined,
          }
        : undefined,
      attendees: event.attendees?.map((a) => ({
        email: a.email || "",
        displayName: a.displayName || undefined,
        responseStatus: a.responseStatus || undefined,
      })),
      htmlLink: event.htmlLink || undefined,
      status: event.status || undefined,
      created: event.created || undefined,
      updated: event.updated || undefined,
      recurringEventId: event.recurringEventId || undefined,
      organizer: event.organizer
        ? {
            email: event.organizer.email || "",
            displayName: event.organizer.displayName || undefined,
            self: event.organizer.self || undefined,
          }
        : undefined,
      colorId: event.colorId || undefined,
    };
  }
}

