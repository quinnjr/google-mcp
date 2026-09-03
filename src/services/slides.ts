import { google, type slides_v1, type Auth } from "googleapis";
import { DriveService } from "./drive.js";

export interface Presentation {
  presentationId: string;
  title: string;
  slides: SlideInfo[];
  pageSize?: { width: number; height: number };
  locale?: string;
}

export interface SlideInfo {
  objectId: string;
  pageType?: string;
  pageElements?: PageElement[];
}

export interface PageElement {
  objectId: string;
  size?: { width: number; height: number };
  transform?: {
    scaleX?: number;
    scaleY?: number;
    translateX?: number;
    translateY?: number;
  };
  type: "shape" | "image" | "table" | "video" | "line" | "other";
  text?: string;
}

export interface CreatePresentationOptions {
  title: string;
  folderId?: string;
}

export interface AddSlideOptions {
  presentationId: string;
  insertionIndex?: number;
  layoutType?:
    | "BLANK"
    | "CAPTION_ONLY"
    | "TITLE"
    | "TITLE_AND_BODY"
    | "TITLE_AND_TWO_COLUMNS"
    | "TITLE_ONLY"
    | "SECTION_HEADER"
    | "SECTION_TITLE_AND_DESCRIPTION"
    | "ONE_COLUMN_TEXT"
    | "MAIN_POINT"
    | "BIG_NUMBER";
}

export interface AddTextOptions {
  presentationId: string;
  slideObjectId: string;
  text: string;
  shapeType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface AddImageOptions {
  presentationId: string;
  slideObjectId: string;
  imageUrl: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class SlidesService {
  private readonly slides: slides_v1.Slides;
  private readonly drive: DriveService;

  constructor(authClient: Auth.OAuth2Client) {
    this.slides = google.slides({ version: "v1", auth: authClient });
    this.drive = new DriveService(authClient);
  }

  public async createPresentation(options: CreatePresentationOptions): Promise<Presentation> {
    const response = await this.slides.presentations.create({
      requestBody: {
        title: options.title,
      },
    });

    const presentationId = response.data.presentationId;
    if (!presentationId) {
      throw new Error("Slides API did not return a presentationId for the created presentation.");
    }

    // Move to folder if specified
    if (options.folderId) {
      await this.drive.moveFile(presentationId, options.folderId);
    }

    return this.formatPresentation(response.data);
  }

  public async getPresentation(presentationId: string): Promise<Presentation> {
    const response = await this.slides.presentations.get({
      presentationId,
    });

    return this.formatPresentation(response.data);
  }

  public async addSlide(options: AddSlideOptions): Promise<string> {
    const slideId = `slide_${Date.now()}`;

    await this.slides.presentations.batchUpdate({
      presentationId: options.presentationId,
      requestBody: {
        requests: [
          {
            createSlide: {
              objectId: slideId,
              insertionIndex: options.insertionIndex,
              slideLayoutReference: options.layoutType
                ? { predefinedLayout: options.layoutType }
                : undefined,
            },
          },
        ],
      },
    });

    return slideId;
  }

  public async deleteSlide(presentationId: string, slideObjectId: string): Promise<void> {
    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            deleteObject: {
              objectId: slideObjectId,
            },
          },
        ],
      },
    });
  }

  public async addTextBox(options: AddTextOptions): Promise<string> {
    const textBoxId = `textbox_${Date.now()}`;

    // Default dimensions in EMU (English Metric Units)
    const x = (options.x || 100) * 9525; // Convert points to EMU
    const y = (options.y || 100) * 9525;
    const width = (options.width || 300) * 9525;
    const height = (options.height || 100) * 9525;

    await this.slides.presentations.batchUpdate({
      presentationId: options.presentationId,
      requestBody: {
        requests: [
          {
            createShape: {
              objectId: textBoxId,
              shapeType: "TEXT_BOX",
              elementProperties: {
                pageObjectId: options.slideObjectId,
                size: {
                  width: { magnitude: width, unit: "EMU" },
                  height: { magnitude: height, unit: "EMU" },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: x,
                  translateY: y,
                  unit: "EMU",
                },
              },
            },
          },
          {
            insertText: {
              objectId: textBoxId,
              insertionIndex: 0,
              text: options.text,
            },
          },
        ],
      },
    });

    return textBoxId;
  }

  public async addImage(options: AddImageOptions): Promise<string> {
    const imageId = `image_${Date.now()}`;

    const x = (options.x || 100) * 9525;
    const y = (options.y || 100) * 9525;
    const width = (options.width || 200) * 9525;
    const height = (options.height || 200) * 9525;

    await this.slides.presentations.batchUpdate({
      presentationId: options.presentationId,
      requestBody: {
        requests: [
          {
            createImage: {
              objectId: imageId,
              url: options.imageUrl,
              elementProperties: {
                pageObjectId: options.slideObjectId,
                size: {
                  width: { magnitude: width, unit: "EMU" },
                  height: { magnitude: height, unit: "EMU" },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: x,
                  translateY: y,
                  unit: "EMU",
                },
              },
            },
          },
        ],
      },
    });

    return imageId;
  }

  public async replaceAllText(
    presentationId: string,
    searchText: string,
    replaceText: string,
    matchCase = true
  ): Promise<number> {
    const response = await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: {
                text: searchText,
                matchCase,
              },
              replaceText,
            },
          },
        ],
      },
    });

    const replies = response.data.replies;
    if (replies && replies.length > 0 && replies[0].replaceAllText) {
      return replies[0].replaceAllText.occurrencesChanged || 0;
    }
    return 0;
  }

  public async updateTextStyle(
    presentationId: string,
    objectId: string,
    style: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      fontSize?: number;
      fontFamily?: string;
      foregroundColor?: { red: number; green: number; blue: number };
    },
    startIndex?: number,
    endIndex?: number
  ): Promise<void> {
    const textStyle: slides_v1.Schema$TextStyle = {};
    const fields: string[] = [];

    if (style.bold !== undefined) {
      textStyle.bold = style.bold;
      fields.push("bold");
    }
    if (style.italic !== undefined) {
      textStyle.italic = style.italic;
      fields.push("italic");
    }
    if (style.underline !== undefined) {
      textStyle.underline = style.underline;
      fields.push("underline");
    }
    if (style.fontSize !== undefined) {
      textStyle.fontSize = { magnitude: style.fontSize, unit: "PT" };
      fields.push("fontSize");
    }
    if (style.fontFamily !== undefined) {
      textStyle.fontFamily = style.fontFamily;
      fields.push("fontFamily");
    }
    if (style.foregroundColor) {
      textStyle.foregroundColor = {
        opaqueColor: {
          rgbColor: style.foregroundColor,
        },
      };
      fields.push("foregroundColor");
    }

    const textRange: slides_v1.Schema$Range =
      startIndex !== undefined && endIndex !== undefined
        ? { type: "FIXED_RANGE", startIndex, endIndex }
        : { type: "ALL" };

    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            updateTextStyle: {
              objectId,
              textRange,
              style: textStyle,
              fields: fields.join(","),
            },
          },
        ],
      },
    });
  }

  public async setSlideBackground(
    presentationId: string,
    slideObjectId: string,
    color: { red: number; green: number; blue: number }
  ): Promise<void> {
    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            updatePageProperties: {
              objectId: slideObjectId,
              pageProperties: {
                pageBackgroundFill: {
                  solidFill: {
                    color: {
                      rgbColor: color,
                    },
                  },
                },
              },
              fields: "pageBackgroundFill.solidFill.color",
            },
          },
        ],
      },
    });
  }

  public async deleteObject(presentationId: string, objectId: string): Promise<void> {
    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            deleteObject: {
              objectId,
            },
          },
        ],
      },
    });
  }

  public async duplicateSlide(
    presentationId: string,
    slideObjectId: string
  ): Promise<string> {
    const newSlideId = `slide_${Date.now()}`;

    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            duplicateObject: {
              objectId: slideObjectId,
              objectIds: {
                [slideObjectId]: newSlideId,
              },
            },
          },
        ],
      },
    });

    return newSlideId;
  }

  public async moveSlide(
    presentationId: string,
    slideObjectId: string,
    insertionIndex: number
  ): Promise<void> {
    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            updateSlidesPosition: {
              slideObjectIds: [slideObjectId],
              insertionIndex,
            },
          },
        ],
      },
    });
  }

  public async listPresentations(pageSize = 50, pageToken?: string): Promise<{
    presentations: Array<{ id: string; name: string; modifiedTime?: string }>;
    nextPageToken?: string;
  }> {
    const result = await this.drive.listFiles({
      pageSize,
      pageToken,
      query: "mimeType = 'application/vnd.google-apps.presentation'",
      orderBy: "modifiedTime desc",
    });

    return {
      presentations: result.files.map((f) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      })),
      nextPageToken: result.nextPageToken,
    };
  }

  public async addTable(
    presentationId: string,
    slideObjectId: string,
    rows: number,
    columns: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): Promise<string> {
    const tableId = `table_${Date.now()}`;

    const xPos = (x || 100) * 9525;
    const yPos = (y || 100) * 9525;
    const tableWidth = (width || 400) * 9525;
    const tableHeight = (height || 200) * 9525;

    await this.slides.presentations.batchUpdate({
      presentationId,
      requestBody: {
        requests: [
          {
            createTable: {
              objectId: tableId,
              elementProperties: {
                pageObjectId: slideObjectId,
                size: {
                  width: { magnitude: tableWidth, unit: "EMU" },
                  height: { magnitude: tableHeight, unit: "EMU" },
                },
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: xPos,
                  translateY: yPos,
                  unit: "EMU",
                },
              },
              rows,
              columns,
            },
          },
        ],
      },
    });

    return tableId;
  }

  private formatPresentation(data: slides_v1.Schema$Presentation): Presentation {
    const slides: SlideInfo[] = (data.slides || []).map((slide) => ({
      objectId: slide.objectId || "",
      pageType: slide.pageType || undefined,
      pageElements: (slide.pageElements || []).map((el) => {
        let type: PageElement["type"] = "other";
        let text: string | undefined;

        if (el.shape) {
          type = "shape";
          if (el.shape.text?.textElements) {
            text = el.shape.text.textElements
              .filter((te) => te.textRun?.content)
              .map((te) => te.textRun?.content)
              .join("");
          }
        } else if (el.image) {
          type = "image";
        } else if (el.table) {
          type = "table";
        } else if (el.video) {
          type = "video";
        } else if (el.line) {
          type = "line";
        }

        return {
          objectId: el.objectId || "",
          size: el.size
            ? {
                width: el.size.width?.magnitude || 0,
                height: el.size.height?.magnitude || 0,
              }
            : undefined,
          transform: el.transform
            ? {
                scaleX: el.transform.scaleX || undefined,
                scaleY: el.transform.scaleY || undefined,
                translateX: el.transform.translateX || undefined,
                translateY: el.transform.translateY || undefined,
              }
            : undefined,
          type,
          text,
        };
      }),
    }));

    return {
      presentationId: data.presentationId || "",
      title: data.title || "",
      slides,
      pageSize: data.pageSize
        ? {
            width: data.pageSize.width?.magnitude || 0,
            height: data.pageSize.height?.magnitude || 0,
          }
        : undefined,
      locale: data.locale || undefined,
    };
  }
}

