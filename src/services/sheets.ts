import { google, type sheets_v4, type Auth } from "googleapis";
import { type SpreadsheetInfo, type SheetInfo, type SheetRange } from "../types/index.js";
import { DriveService } from "./drive.js";

export class SheetsService {
  private readonly sheets: sheets_v4.Sheets;
  private readonly drive: DriveService;

  constructor(authClient: Auth.OAuth2Client) {
    this.sheets = google.sheets({ version: "v4", auth: authClient });
    this.drive = new DriveService(authClient);
  }

  public async createSpreadsheet(
    title: string,
    sheetNames?: string[],
    folderId?: string
  ): Promise<SpreadsheetInfo> {
    const sheets: sheets_v4.Schema$SheetProperties[] = sheetNames
      ? sheetNames.map((name, index) => ({
          title: name,
          index,
        }))
      : [{ title: "Sheet1", index: 0 }];

    const response = await this.sheets.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: sheets.map((s) => ({ properties: s })),
      },
    });

    const spreadsheetId = response.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error("Sheets API did not return a spreadsheetId for the created spreadsheet.");
    }

    // Move to folder if specified
    if (folderId) {
      await this.drive.moveFile(spreadsheetId, folderId);
    }

    return this.formatSpreadsheetInfo(response.data);
  }

  public async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    const response = await this.sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    return this.formatSpreadsheetInfo(response.data);
  }

  private formatSpreadsheetInfo(data: sheets_v4.Schema$Spreadsheet): SpreadsheetInfo {
    if (!data.spreadsheetId) {
      throw new Error("Sheets API returned a spreadsheet without a spreadsheetId.");
    }
    return {
      spreadsheetId: data.spreadsheetId,
      title: data.properties?.title || "",
      spreadsheetUrl: data.spreadsheetUrl || "",
      sheets: (data.sheets || []).map((s) => ({
        sheetId: s.properties?.sheetId || 0,
        title: s.properties?.title || "",
        index: s.properties?.index || 0,
        rowCount: s.properties?.gridProperties?.rowCount || 0,
        columnCount: s.properties?.gridProperties?.columnCount || 0,
      })),
    };
  }

  public async getValues(spreadsheetId: string, range: string): Promise<SheetRange> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    return {
      spreadsheetId,
      range: response.data.range || range,
      values: (response.data.values as unknown[][]) || [],
    };
  }

  public async updateValues(
    spreadsheetId: string,
    range: string,
    values: unknown[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
  ): Promise<SheetRange> {
    const response = await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption,
      requestBody: { values },
    });

    return {
      spreadsheetId,
      range: response.data.updatedRange || range,
      values,
    };
  }

  public async appendValues(
    spreadsheetId: string,
    range: string,
    values: unknown[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
  ): Promise<SheetRange> {
    const response = await this.sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption,
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    return {
      spreadsheetId,
      range: response.data.updates?.updatedRange || range,
      values,
    };
  }

  public async clearValues(spreadsheetId: string, range: string): Promise<void> {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });
  }

  public async addSheet(spreadsheetId: string, title: string): Promise<SheetInfo> {
    const response = await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title },
            },
          },
        ],
      },
    });

    const addedSheet = response.data.replies?.[0]?.addSheet?.properties;

    return {
      sheetId: addedSheet?.sheetId || 0,
      title: addedSheet?.title || title,
      index: addedSheet?.index || 0,
      rowCount: addedSheet?.gridProperties?.rowCount || 1000,
      columnCount: addedSheet?.gridProperties?.columnCount || 26,
    };
  }

  public async deleteSheet(spreadsheetId: string, sheetId: number): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteSheet: { sheetId },
          },
        ],
      },
    });
  }

  public async renameSheet(
    spreadsheetId: string,
    sheetId: number,
    newTitle: string
  ): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                title: newTitle,
              },
              fields: "title",
            },
          },
        ],
      },
    });
  }

  public async formatCells(
    spreadsheetId: string,
    sheetId: number,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    format: {
      bold?: boolean;
      italic?: boolean;
      backgroundColor?: { red: number; green: number; blue: number };
      textColor?: { red: number; green: number; blue: number };
    }
  ): Promise<void> {
    const cellFormat: sheets_v4.Schema$CellFormat = {};
    const fields: string[] = [];

    if (format.bold !== undefined || format.italic !== undefined) {
      cellFormat.textFormat = {};
      if (format.bold !== undefined) {
        cellFormat.textFormat.bold = format.bold;
        fields.push("userEnteredFormat.textFormat.bold");
      }
      if (format.italic !== undefined) {
        cellFormat.textFormat.italic = format.italic;
        fields.push("userEnteredFormat.textFormat.italic");
      }
    }

    if (format.backgroundColor) {
      cellFormat.backgroundColor = format.backgroundColor;
      fields.push("userEnteredFormat.backgroundColor");
    }

    if (format.textColor) {
      cellFormat.textFormat = cellFormat.textFormat || {};
      cellFormat.textFormat.foregroundColor = format.textColor;
      fields.push("userEnteredFormat.textFormat.foregroundColor");
    }

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: startRow,
                endRowIndex: endRow,
                startColumnIndex: startCol,
                endColumnIndex: endCol,
              },
              cell: {
                userEnteredFormat: cellFormat,
              },
              fields: fields.join(","),
            },
          },
        ],
      },
    });
  }

  public async insertRows(
    spreadsheetId: string,
    sheetId: number,
    startIndex: number,
    numRows: number
  ): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex,
                endIndex: startIndex + numRows,
              },
              inheritFromBefore: startIndex > 0,
            },
          },
        ],
      },
    });
  }

  public async insertColumns(
    spreadsheetId: string,
    sheetId: number,
    startIndex: number,
    numCols: number
  ): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            insertDimension: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex,
                endIndex: startIndex + numCols,
              },
              inheritFromBefore: startIndex > 0,
            },
          },
        ],
      },
    });
  }

  public async deleteRows(
    spreadsheetId: string,
    sheetId: number,
    startIndex: number,
    numRows: number
  ): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex,
                endIndex: startIndex + numRows,
              },
            },
          },
        ],
      },
    });
  }

  public async deleteColumns(
    spreadsheetId: string,
    sheetId: number,
    startIndex: number,
    numCols: number
  ): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "COLUMNS",
                startIndex,
                endIndex: startIndex + numCols,
              },
            },
          },
        ],
      },
    });
  }

  public async listSpreadsheets(pageSize = 50, pageToken?: string): Promise<{
    spreadsheets: Array<{ id: string; name: string; modifiedTime?: string }>;
    nextPageToken?: string;
  }> {
    const result = await this.drive.listFiles({
      pageSize,
      pageToken,
      query: "mimeType = 'application/vnd.google-apps.spreadsheet'",
      orderBy: "modifiedTime desc",
    });

    return {
      spreadsheets: result.files.map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      })),
      nextPageToken: result.nextPageToken,
    };
  }

  public async batchGetValues(
    spreadsheetId: string,
    ranges: string[]
  ): Promise<SheetRange[]> {
    const response = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    return (response.data.valueRanges || []).map((vr) => ({
      spreadsheetId,
      range: vr.range || "",
      values: (vr.values as unknown[][]) || [],
    }));
  }

  public async batchUpdateValues(
    spreadsheetId: string,
    data: Array<{ range: string; values: unknown[][] }>,
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED"
  ): Promise<void> {
    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption,
        data: data.map((d) => ({
          range: d.range,
          values: d.values,
        })),
      },
    });
  }
}

