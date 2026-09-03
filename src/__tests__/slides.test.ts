import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "googleapis";

const mockPresentationsCreate = vi.fn();
const mockPresentationsGet = vi.fn();
const mockPresentationsBatchUpdate = vi.fn();
const mockFilesList = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesUpdate = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    slides: () => ({
      presentations: {
        create: mockPresentationsCreate,
        get: mockPresentationsGet,
        batchUpdate: mockPresentationsBatchUpdate,
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

import { SlidesService } from "../services/slides.js";

describe("SlidesService", () => {
  let service: SlidesService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SlidesService(mockAuth);
  });

  describe("createPresentation", () => {
    it("should create presentation", async () => {
      mockPresentationsCreate.mockResolvedValue({
        data: {
          presentationId: "pres123",
          title: "New Presentation",
          slides: [{ objectId: "slide1" }],
        },
      });

      const result = await service.createPresentation({ title: "New Presentation" });

      expect(mockPresentationsCreate).toHaveBeenCalledWith({
        requestBody: { title: "New Presentation" },
      });
      expect(result.presentationId).toBe("pres123");
    });

    it("should move to folder", async () => {
      mockPresentationsCreate.mockResolvedValue({
        data: { presentationId: "pres123", title: "Test", slides: [] },
      });
      mockFilesGet.mockResolvedValue({ data: { parents: [] } });
      mockFilesUpdate.mockResolvedValue({
        data: { id: "pres1", name: "Presentation", mimeType: "application/vnd.google-apps.presentation" },
      });

      await service.createPresentation({ title: "Test", folderId: "folder123" });

      expect(mockFilesUpdate).toHaveBeenCalled();
    });
  });

  describe("getPresentation", () => {
    it("should get presentation", async () => {
      mockPresentationsGet.mockResolvedValue({
        data: {
          presentationId: "pres123",
          title: "My Presentation",
          slides: [
            { objectId: "slide1", pageElements: [] },
            { objectId: "slide2", pageElements: [] },
          ],
          pageSize: { width: { magnitude: 9144000 }, height: { magnitude: 5143500 } },
        },
      });

      const result = await service.getPresentation("pres123");

      expect(result.presentationId).toBe("pres123");
      expect(result.slides).toHaveLength(2);
    });
  });

  describe("addSlide", () => {
    it("should add slide", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({
        data: { replies: [{ createSlide: { objectId: "newSlide" } }] },
      });

      const result = await service.addSlide({
        presentationId: "pres123",
        layoutType: "TITLE_AND_BODY",
      });

      expect(mockPresentationsBatchUpdate).toHaveBeenCalled();
      // The service generates its own ID
      expect(result).toMatch(/^slide_\d+$/);
    });
  });

  describe("deleteSlide", () => {
    it("should delete slide", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: {} });

      await service.deleteSlide("pres123", "slide1");

      expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith({
        presentationId: "pres123",
        requestBody: {
          requests: [{ deleteObject: { objectId: "slide1" } }],
        },
      });
    });
  });

  describe("addTextBox", () => {
    it("should add text box to slide", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: { replies: [{}, {}] } });

      const result = await service.addTextBox({
        presentationId: "pres123",
        slideObjectId: "slide1",
        text: "Hello World",
        x: 100,
        y: 100,
        width: 300,
        height: 50,
      });

      expect(mockPresentationsBatchUpdate).toHaveBeenCalled();
      // The service generates its own ID
      expect(result).toMatch(/^textbox_\d+$/);
    });
  });

  describe("addImage", () => {
    it("should add image to slide", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: { replies: [{}] } });

      const result = await service.addImage({
        presentationId: "pres123",
        slideObjectId: "slide1",
        imageUrl: "https://example.com/image.png",
        x: 50,
        y: 50,
        width: 200,
        height: 150,
      });

      // The service generates its own ID
      expect(result).toMatch(/^image_\d+$/);
    });
  });

  describe("replaceAllText", () => {
    it("should replace text in presentation", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({
        data: { replies: [{ replaceAllText: { occurrencesChanged: 3 } }] },
      });

      const result = await service.replaceAllText("pres123", "{{name}}", "John");

      expect(result).toBe(3);
    });

    it("should return 0 when no replacements", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const result = await service.replaceAllText("pres123", "notfound", "new");

      expect(result).toBe(0);
    });
  });

  describe("listPresentations", () => {
    it("should list presentations", async () => {
      mockFilesList.mockResolvedValue({
        data: {
          files: [
            { id: "pres1", name: "Presentation 1", mimeType: "application/vnd.google-apps.presentation", modifiedTime: "2024-01-01" },
          ],
          nextPageToken: "token",
        },
      });

      const result = await service.listPresentations();

      expect(result.presentations).toHaveLength(1);
      expect(result.presentations[0].name).toBe("Presentation 1");
    });
  });

  describe("duplicateSlide", () => {
    it("should duplicate slide", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({
        data: { replies: [{ duplicateObject: {} }] },
      });

      const result = await service.duplicateSlide("pres123", "slide1");

      // The service generates its own ID
      expect(result).toMatch(/^slide_\d+$/);
      expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          presentationId: "pres123",
        })
      );
    });
  });

  describe("deleteObject", () => {
    it("should delete object", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: {} });

      await service.deleteObject("pres123", "obj1");

      expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith({
        presentationId: "pres123",
        requestBody: {
          requests: [{ deleteObject: { objectId: "obj1" } }],
        },
      });
    });
  });

  describe("moveSlide", () => {
    it("should move slide to new position", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: {} });

      await service.moveSlide("pres123", "slide1", 2);

      expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith({
        presentationId: "pres123",
        requestBody: {
          requests: [{
            updateSlidesPosition: {
              slideObjectIds: ["slide1"],
              insertionIndex: 2,
            },
          }],
        },
      });
    });
  });

  describe("setSlideBackground", () => {
    it("should set slide background color", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: {} });

      await service.setSlideBackground("pres123", "slide1", { red: 1, green: 0, blue: 0 });

      expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith({
        presentationId: "pres123",
        requestBody: {
          requests: [{
            updatePageProperties: {
              objectId: "slide1",
              pageProperties: {
                pageBackgroundFill: {
                  solidFill: {
                    color: {
                      rgbColor: { red: 1, green: 0, blue: 0 },
                    },
                  },
                },
              },
              fields: "pageBackgroundFill.solidFill.color",
            },
          }],
        },
      });
    });
  });


  describe("addTable", () => {
    it("should add table to slide", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: { replies: [{}] } });

      const result = await service.addTable("pres123", "slide1", 3, 4);

      expect(result).toMatch(/^table_\d+$/);
      expect(mockPresentationsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          presentationId: "pres123",
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              expect.objectContaining({
                createTable: expect.objectContaining({
                  rows: 3,
                  columns: 4,
                }),
              }),
            ]),
          }),
        })
      );
    });

    it("should add table with custom position", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: { replies: [{}] } });

      await service.addTable("pres123", "slide1", 2, 3, 150, 200, 500, 300);

      expect(mockPresentationsBatchUpdate).toHaveBeenCalled();
    });
  });


  describe("updateTextStyle", () => {
    it("should update text style", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: {} });

      await service.updateTextStyle("pres123", "textbox1", {
        bold: true,
        italic: false,
        fontSize: 14,
      });

      expect(mockPresentationsBatchUpdate).toHaveBeenCalled();
    });

    it("should update text color", async () => {
      mockPresentationsBatchUpdate.mockResolvedValue({ data: {} });

      await service.updateTextStyle("pres123", "textbox1", {
        foregroundColor: { red: 1, green: 0, blue: 0 },
      });

      expect(mockPresentationsBatchUpdate).toHaveBeenCalled();
    });
  });
});
