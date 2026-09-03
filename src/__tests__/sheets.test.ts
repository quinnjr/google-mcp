import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "googleapis";

const mockSpreadsheetsCreate = vi.fn();
const mockSpreadsheetsGet = vi.fn();
const mockSpreadsheetsBatchUpdate = vi.fn();
const mockValuesGet = vi.fn();
const mockValuesUpdate = vi.fn();
const mockValuesAppend = vi.fn();
const mockValuesClear = vi.fn();
const mockValuesBatchGet = vi.fn();
const mockValuesBatchUpdate = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesUpdate = vi.fn();
const mockFilesList = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        create: mockSpreadsheetsCreate,
        get: mockSpreadsheetsGet,
        batchUpdate: mockSpreadsheetsBatchUpdate,
        values: {
          get: mockValuesGet,
          update: mockValuesUpdate,
          append: mockValuesAppend,
          clear: mockValuesClear,
          batchGet: mockValuesBatchGet,
          batchUpdate: mockValuesBatchUpdate,
        },
      },
    }),
    drive: () => ({
      files: {
        get: mockFilesGet,
        update: mockFilesUpdate,
        list: mockFilesList,
      },
    }),
  },
}));

import { SheetsService } from "../services/sheets.js";

describe("SheetsService", () => {
  let service: SheetsService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SheetsService(mockAuth);
  });

  describe("createSpreadsheet", () => {
    it("should create spreadsheet", async () => {
      mockSpreadsheetsCreate.mockResolvedValue({
        data: {
          spreadsheetId: "sheet1",
          properties: { title: "New Sheet" },
          spreadsheetUrl: "https://sheets.google.com/sheet1",
          sheets: [{ properties: { sheetId: 0, title: "Sheet1", index: 0, gridProperties: { rowCount: 1000, columnCount: 26 } } }],
        },
      });

      const result = await service.createSpreadsheet("New Sheet");

      expect(result.spreadsheetId).toBe("sheet1");
      expect(result.sheets).toHaveLength(1);
    });

    it("should create with custom sheets", async () => {
      mockSpreadsheetsCreate.mockResolvedValue({
        data: { spreadsheetId: "sheet1", properties: { title: "Multi" }, sheets: [] },
      });

      await service.createSpreadsheet("Multi", ["Data", "Summary"]);

      expect(mockSpreadsheetsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            sheets: expect.arrayContaining([
              { properties: { title: "Data", index: 0 } },
            ]),
          }),
        })
      );
    });
  });

  describe("getSpreadsheet", () => {
    it("should get spreadsheet info", async () => {
      mockSpreadsheetsGet.mockResolvedValue({
        data: {
          spreadsheetId: "sheet1",
          properties: { title: "Test" },
          spreadsheetUrl: "https://url",
          sheets: [{ properties: { sheetId: 0, title: "Sheet1", index: 0, gridProperties: { rowCount: 100, columnCount: 10 } } }],
        },
      });

      const result = await service.getSpreadsheet("sheet1");

      expect(result.spreadsheetId).toBe("sheet1");
      expect(result.sheets[0].rowCount).toBe(100);
    });
  });

  describe("getValues", () => {
    it("should get cell values", async () => {
      mockValuesGet.mockResolvedValue({
        data: { range: "A1:B2", values: [["a", "b"], ["c", "d"]] },
      });

      const result = await service.getValues("sheet1", "A1:B2");

      expect(result.values).toEqual([["a", "b"], ["c", "d"]]);
    });

    it("should handle empty range", async () => {
      mockValuesGet.mockResolvedValue({ data: { range: "A1" } });

      const result = await service.getValues("sheet1", "A1");

      expect(result.values).toEqual([]);
    });
  });

  describe("updateValues", () => {
    it("should update cells", async () => {
      mockValuesUpdate.mockResolvedValue({ data: { updatedRange: "A1:B2" } });

      const result = await service.updateValues("sheet1", "A1:B2", [["x", "y"]]);

      expect(mockValuesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ valueInputOption: "USER_ENTERED" })
      );
      expect(result.values).toEqual([["x", "y"]]);
    });

    it("should support RAW input", async () => {
      mockValuesUpdate.mockResolvedValue({ data: {} });

      await service.updateValues("sheet1", "A1", [["=1+1"]], "RAW");

      expect(mockValuesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ valueInputOption: "RAW" })
      );
    });
  });

  describe("appendValues", () => {
    it("should append rows", async () => {
      mockValuesAppend.mockResolvedValue({
        data: { updates: { updatedRange: "A10:B10" } },
      });

      const result = await service.appendValues("sheet1", "A:B", [["new", "row"]]);

      expect(mockValuesAppend).toHaveBeenCalledWith(
        expect.objectContaining({ insertDataOption: "INSERT_ROWS" })
      );
      expect(result.values).toEqual([["new", "row"]]);
    });
  });

  describe("clearValues", () => {
    it("should clear range", async () => {
      mockValuesClear.mockResolvedValue({ data: {} });

      await service.clearValues("sheet1", "A1:Z100");

      expect(mockValuesClear).toHaveBeenCalledWith({
        spreadsheetId: "sheet1",
        range: "A1:Z100",
      });
    });
  });

  describe("addSheet", () => {
    it("should add new sheet", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({
        data: {
          replies: [{ addSheet: { properties: { sheetId: 1, title: "New", index: 1, gridProperties: { rowCount: 1000, columnCount: 26 } } } }],
        },
      });

      const result = await service.addSheet("sheet1", "New");

      expect(result.title).toBe("New");
      expect(result.sheetId).toBe(1);
    });
  });

  describe("deleteSheet", () => {
    it("should delete sheet", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.deleteSheet("sheet1", 1);

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "sheet1",
        requestBody: { requests: [{ deleteSheet: { sheetId: 1 } }] },
      });
    });
  });

  describe("renameSheet", () => {
    it("should rename sheet", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.renameSheet("sheet1", 0, "Renamed");

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "sheet1",
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: 0, title: "Renamed" },
              fields: "title",
            },
          }],
        },
      });
    });
  });

  describe("batchGetValues", () => {
    it("should get multiple ranges", async () => {
      mockValuesBatchGet.mockResolvedValue({
        data: {
          valueRanges: [
            { range: "A1:A5", values: [["1"]] },
            { range: "B1:B5", values: [["2"]] },
          ],
        },
      });

      const result = await service.batchGetValues("sheet1", ["A1:A5", "B1:B5"]);

      expect(result).toHaveLength(2);
    });
  });

  describe("batchUpdateValues", () => {
    it("should update multiple ranges", async () => {
      mockValuesBatchUpdate.mockResolvedValue({ data: {} });

      await service.batchUpdateValues("sheet1", [
        { range: "A1", values: [["x"]] },
      ]);

      expect(mockValuesBatchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "sheet1",
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [{ range: "A1", values: [["x"]] }],
        },
      });
    });

    it("should use RAW input option", async () => {
      mockValuesBatchUpdate.mockResolvedValue({ data: {} });

      await service.batchUpdateValues("sheet1", [{ range: "A1", values: [["1"]] }], "RAW");

      expect(mockValuesBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ valueInputOption: "RAW" }),
        })
      );
    });
  });

  describe("formatCells", () => {
    it("should format cells with bold", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.formatCells("sheet1", 0, 0, 0, 5, 5, { bold: true });

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          spreadsheetId: "sheet1",
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              expect.objectContaining({
                repeatCell: expect.objectContaining({
                  cell: expect.objectContaining({
                    userEnteredFormat: expect.objectContaining({
                      textFormat: expect.objectContaining({ bold: true }),
                    }),
                  }),
                }),
              }),
            ]),
          }),
        })
      );
    });

    it("should format cells with italic", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.formatCells("sheet1", 0, 0, 0, 5, 5, { italic: true });

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalled();
    });

    it("should format cells with background color", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.formatCells("sheet1", 0, 0, 0, 5, 5, {
        backgroundColor: { red: 1, green: 0, blue: 0 },
      });

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalled();
    });

    it("should format cells with text color", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.formatCells("sheet1", 0, 0, 0, 5, 5, {
        textColor: { red: 0, green: 0, blue: 1 },
      });

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalled();
    });
  });

  describe("insertRows", () => {
    it("should insert rows", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.insertRows("sheet1", 0, 5, 3);

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              expect.objectContaining({
                insertDimension: expect.objectContaining({
                  range: expect.objectContaining({
                    dimension: "ROWS",
                    startIndex: 5,
                    endIndex: 8,
                  }),
                }),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe("insertColumns", () => {
    it("should insert columns", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.insertColumns("sheet1", 0, 2, 4);

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              expect.objectContaining({
                insertDimension: expect.objectContaining({
                  range: expect.objectContaining({
                    dimension: "COLUMNS",
                    startIndex: 2,
                    endIndex: 6,
                  }),
                }),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe("deleteRows", () => {
    it("should delete rows", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.deleteRows("sheet1", 0, 10, 5);

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              expect.objectContaining({
                deleteDimension: expect.objectContaining({
                  range: expect.objectContaining({
                    dimension: "ROWS",
                    startIndex: 10,
                    endIndex: 15,
                  }),
                }),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe("deleteColumns", () => {
    it("should delete columns", async () => {
      mockSpreadsheetsBatchUpdate.mockResolvedValue({ data: {} });

      await service.deleteColumns("sheet1", 0, 3, 2);

      expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              expect.objectContaining({
                deleteDimension: expect.objectContaining({
                  range: expect.objectContaining({
                    dimension: "COLUMNS",
                    startIndex: 3,
                    endIndex: 5,
                  }),
                }),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe("listSpreadsheets", () => {
    it("should list spreadsheets", async () => {
      mockFilesList.mockResolvedValue({
        data: {
          files: [
            { id: "sheet1", name: "Sheet 1", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2024-01-01" },
            { id: "sheet2", name: "Sheet 2", mimeType: "application/vnd.google-apps.spreadsheet", modifiedTime: "2024-01-02" },
          ],
          nextPageToken: "token",
        },
      });

      const result = await service.listSpreadsheets();

      expect(result.spreadsheets).toHaveLength(2);
      expect(result.nextPageToken).toBe("token");
    });

    it("should use pagination", async () => {
      mockFilesList.mockResolvedValue({ data: { files: [] } });

      await service.listSpreadsheets(10, "pageToken");

      expect(mockFilesList).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 10,
          pageToken: "pageToken",
        })
      );
    });
  });
});
