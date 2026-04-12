import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "googleapis";

const mockCalendarListList = vi.fn();
const mockCalendarListGet = vi.fn();
const mockEventsList = vi.fn();
const mockEventsGet = vi.fn();
const mockEventsInsert = vi.fn();
const mockEventsUpdate = vi.fn();
const mockEventsDelete = vi.fn();
const mockEventsQuickAdd = vi.fn();
const mockFreebusyQuery = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    calendar: () => ({
      calendarList: {
        list: mockCalendarListList,
        get: mockCalendarListGet,
      },
      events: {
        list: mockEventsList,
        get: mockEventsGet,
        insert: mockEventsInsert,
        update: mockEventsUpdate,
        delete: mockEventsDelete,
        quickAdd: mockEventsQuickAdd,
      },
      freebusy: {
        query: mockFreebusyQuery,
      },
    }),
  },
}));

import { CalendarService } from "../services/calendar.js";

describe("CalendarService", () => {
  let service: CalendarService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CalendarService(mockAuth);
  });

  describe("listCalendars", () => {
    it("should list calendars", async () => {
      mockCalendarListList.mockResolvedValue({
        data: {
          items: [
            { id: "primary", summary: "Primary", primary: true, timeZone: "UTC" },
            { id: "work", summary: "Work", primary: false, timeZone: "UTC" },
          ],
        },
      });

      const result = await service.listCalendars();

      expect(result).toHaveLength(2);
      expect(result[0].primary).toBe(true);
    });

    it("should handle empty list", async () => {
      mockCalendarListList.mockResolvedValue({ data: { items: null } });

      const result = await service.listCalendars();

      expect(result).toHaveLength(0);
    });
  });

  describe("getCalendar", () => {
    it("should get calendar by ID", async () => {
      mockCalendarListGet.mockResolvedValue({
        data: { id: "primary", summary: "My Calendar", timeZone: "UTC" },
      });

      const result = await service.getCalendar("primary");

      expect(result.id).toBe("primary");
    });
  });

  describe("listEvents", () => {
    it("should list events", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            { id: "e1", summary: "Meeting", start: { dateTime: "2024-01-15T10:00:00Z" }, end: { dateTime: "2024-01-15T11:00:00Z" }, status: "confirmed" },
          ],
          nextPageToken: "token",
        },
      });

      const result = await service.listEvents("primary");

      expect(result.events).toHaveLength(1);
      expect(result.events[0].summary).toBe("Meeting");
    });

    it("should filter by time range", async () => {
      mockEventsList.mockResolvedValue({ data: { items: [] } });

      await service.listEvents("primary", {
        timeMin: "2024-01-01",
        timeMax: "2024-01-31",
      });

      expect(mockEventsList).toHaveBeenCalledWith(
        expect.objectContaining({
          timeMin: "2024-01-01",
          timeMax: "2024-01-31",
        })
      );
    });
  });

  describe("getEvent", () => {
    it("should get event by ID", async () => {
      mockEventsGet.mockResolvedValue({
        data: {
          id: "e1",
          summary: "Meeting",
          description: "Important",
          location: "Office",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
          attendees: [{ email: "user@example.com", responseStatus: "accepted" }],
        },
      });

      const result = await service.getEvent("primary", "e1");

      expect(result.summary).toBe("Meeting");
      expect(result.attendees).toHaveLength(1);
    });
  });

  describe("createEvent", () => {
    it("should create event", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "new",
          summary: "New Event",
          start: { dateTime: "2024-01-20T14:00:00Z" },
          end: { dateTime: "2024-01-20T15:00:00Z" },
          htmlLink: "https://calendar.google.com/event",
        },
      });

      const result = await service.createEvent({
        calendarId: "primary",
        summary: "New Event",
        start: { dateTime: "2024-01-20T14:00:00Z" },
        end: { dateTime: "2024-01-20T15:00:00Z" },
      });

      expect(result.id).toBe("new");
    });

    it("should create event with attendees", async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: "new", summary: "Meeting" },
      });

      await service.createEvent({
        calendarId: "primary",
        summary: "Meeting",
        start: { dateTime: "2024-01-20T14:00:00Z" },
        end: { dateTime: "2024-01-20T15:00:00Z" },
        attendees: ["user1@example.com", "user2@example.com"],
      });

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          requestBody: expect.objectContaining({
            attendees: [{ email: "user1@example.com" }, { email: "user2@example.com" }],
          }),
        })
      );
    });

    it("should attach meetLink as conferenceData when provided", async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: "new", summary: "Video Call" },
      });

      await service.createEvent({
        summary: "Video Call",
        start: { dateTime: "2026-04-30T20:30:00+02:00" },
        end: { dateTime: "2026-04-30T22:00:00+02:00" },
        meetLink: "https://meet.google.com/abc-defg-hij",
      });

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          conferenceDataVersion: 1,
          requestBody: expect.objectContaining({
            conferenceData: {
              conferenceSolution: { key: { type: "hangoutsMeet" } },
              entryPoints: [
                {
                  entryPointType: "video",
                  uri: "https://meet.google.com/abc-defg-hij",
                  label: "meet.google.com/abc-defg-hij",
                },
              ],
            },
          }),
        })
      );
    });

    it("should omit conferenceData when meetLink is not provided", async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: "new", summary: "No Video" },
      });

      await service.createEvent({
        summary: "No Video",
        start: { dateTime: "2026-04-30T20:30:00+02:00" },
        end: { dateTime: "2026-04-30T22:00:00+02:00" },
      });

      const call = mockEventsInsert.mock.calls[0][0];
      expect(call.conferenceDataVersion).toBe(0);
      expect(call.requestBody.conferenceData).toBeUndefined();
    });

    it("should pass colorId in requestBody when provided", async () => {
      mockEventsInsert.mockResolvedValue({
        data: { id: "new", summary: "Colored Event", colorId: "9" },
      });

      const result = await service.createEvent({
        summary: "Colored Event",
        start: { dateTime: "2026-12-05T21:00:00+01:00" },
        end: { dateTime: "2026-12-06T01:00:00+01:00" },
        colorId: "9",
      });

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ colorId: "9" }),
        })
      );
      expect(result.colorId).toBe("9");
    });
  });

  describe("updateEvent", () => {
    it("should update event", async () => {
      mockEventsGet.mockResolvedValue({
        data: { id: "e1", summary: "Original" },
      });
      mockEventsUpdate.mockResolvedValue({
        data: { id: "e1", summary: "Updated" },
      });

      const result = await service.updateEvent({ calendarId: "primary", eventId: "e1", summary: "Updated" });

      expect(result.summary).toBe("Updated");
    });

    it("should pass colorId in requestBody when provided", async () => {
      mockEventsGet.mockResolvedValue({
        data: { id: "e1", summary: "Party", colorId: "7" },
      });
      mockEventsUpdate.mockResolvedValue({
        data: { id: "e1", summary: "Party", colorId: "9" },
      });

      const result = await service.updateEvent({ calendarId: "primary", eventId: "e1", colorId: "9" });

      expect(mockEventsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ colorId: "9" }),
        })
      );
      expect(result.colorId).toBe("9");
    });

    it("should preserve existing colorId when not provided in update", async () => {
      mockEventsGet.mockResolvedValue({
        data: { id: "e1", summary: "Party", colorId: "9" },
      });
      mockEventsUpdate.mockResolvedValue({
        data: { id: "e1", summary: "Updated Party", colorId: "9" },
      });

      await service.updateEvent({ calendarId: "primary", eventId: "e1", summary: "Updated Party" });

      expect(mockEventsUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ colorId: "9" }),
        })
      );
    });
  });

  describe("deleteEvent", () => {
    it("should delete event", async () => {
      mockEventsDelete.mockResolvedValue({});

      await service.deleteEvent("primary", "e1");

      expect(mockEventsDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          eventId: "e1",
        })
      );
    });
  });

  describe("quickAddEvent", () => {
    it("should quick add event", async () => {
      mockEventsQuickAdd.mockResolvedValue({
        data: { id: "quick", summary: "Lunch" },
      });

      const result = await service.quickAddEvent("primary", "Lunch tomorrow at noon");

      expect(mockEventsQuickAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          text: "Lunch tomorrow at noon",
        })
      );
      expect(result.summary).toBe("Lunch");
    });
  });

  describe("getFreeBusy", () => {
    it("should get free/busy info", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            primary: { busy: [{ start: "2024-01-15T10:00:00Z", end: "2024-01-15T11:00:00Z" }] },
          },
        },
      });

      // Method signature: getFreeBusy(timeMin, timeMax, calendarIds)
      const result = await service.getFreeBusy("2024-01-15", "2024-01-16", ["primary"]);

      expect(result.calendars.primary.busy).toHaveLength(1);
    });
  });

  describe("getTodayEvents", () => {
    it("should get today's events", async () => {
      mockEventsList.mockResolvedValue({
        data: { items: [{ id: "e1", summary: "Today" }] },
      });

      const result = await service.getTodayEvents("primary");

      expect(result).toHaveLength(1);
    });
  });

  describe("getUpcomingEvents", () => {
    it("should get upcoming events", async () => {
      mockEventsList.mockResolvedValue({
        data: { items: [{ id: "e1" }, { id: "e2" }] },
      });

      const result = await service.getUpcomingEvents("primary", 7);

      expect(result).toHaveLength(2);
    });
  });
});
