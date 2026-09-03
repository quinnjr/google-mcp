import { google, type forms_v1, type Auth } from "googleapis";

export interface FormInfo {
  formId: string;
  title: string;
  description?: string;
  documentTitle?: string;
  responderUri?: string;
  linkedSheetId?: string;
}

export interface FormItem {
  itemId: string;
  title?: string;
  description?: string;
  questionItem?: QuestionItem;
  pageBreakItem?: Record<string, unknown>;
  textItem?: Record<string, unknown>;
  imageItem?: ImageItem;
  videoItem?: VideoItem;
}

export interface QuestionItem {
  question: {
    questionId: string;
    required?: boolean;
    choiceQuestion?: ChoiceQuestion;
    textQuestion?: TextQuestion;
    scaleQuestion?: ScaleQuestion;
    dateQuestion?: DateQuestion;
    timeQuestion?: TimeQuestion;
    fileUploadQuestion?: FileUploadQuestion;
    rowQuestion?: RowQuestion;
  };
  image?: ImageItem;
}

export interface ChoiceQuestion {
  type: "RADIO" | "CHECKBOX" | "DROP_DOWN";
  options: Array<{
    value: string;
    image?: ImageItem;
    isOther?: boolean;
    goToAction?: "NEXT_SECTION" | "RESTART_FORM" | "SUBMIT_FORM";
    goToSectionId?: string;
  }>;
  shuffle?: boolean;
}

export interface TextQuestion {
  paragraph?: boolean;
}

export interface ScaleQuestion {
  low: number;
  high: number;
  lowLabel?: string;
  highLabel?: string;
}

export interface DateQuestion {
  includeTime?: boolean;
  includeYear?: boolean;
}

export interface TimeQuestion {
  duration?: boolean;
}

export interface FileUploadQuestion {
  folderId: string;
  maxFiles?: number;
  maxFileSize?: string;
  types?: Array<"ANY" | "DOCUMENT" | "PRESENTATION" | "SPREADSHEET" | "DRAWING" | "PDF" | "IMAGE" | "VIDEO" | "AUDIO">;
}

export interface RowQuestion {
  title: string;
}

export interface ImageItem {
  sourceUri?: string;
  altText?: string;
  contentUri?: string;
}

export interface VideoItem {
  youtubeUri: string;
  caption?: string;
}

export interface FormResponse {
  responseId: string;
  createTime: string;
  lastSubmittedTime: string;
  respondentEmail?: string;
  answers: Record<string, FormAnswer>;
  totalScore?: number;
}

export interface FormAnswer {
  questionId: string;
  textAnswers?: {
    answers: Array<{ value: string }>;
  };
  fileUploadAnswers?: {
    answers: Array<{
      fileId: string;
      fileName: string;
      mimeType: string;
    }>;
  };
  grade?: {
    score: number;
    correct: boolean;
    feedback?: {
      text: string;
      material?: Array<{
        link?: { uri: string; displayText?: string };
        video?: { youtubeUri: string; displayText?: string };
      }>;
    };
  };
}

export interface CreateFormOptions {
  title: string;
  documentTitle?: string;
  description?: string;
}

export interface CreateQuestionOptions {
  formId: string;
  title: string;
  description?: string;
  required?: boolean;
  index?: number;
  questionType: "short_answer" | "paragraph" | "multiple_choice" | "checkboxes" | "dropdown" | "linear_scale" | "date" | "time";
  options?: string[];
  scaleConfig?: {
    low: number;
    high: number;
    lowLabel?: string;
    highLabel?: string;
  };
}

export class FormsService {
  private readonly forms: forms_v1.Forms;

  constructor(authClient: Auth.OAuth2Client) {
    this.forms = google.forms({ version: "v1", auth: authClient });
  }

  // Form Operations

  public async createForm(options: CreateFormOptions): Promise<FormInfo> {
    const response = await this.forms.forms.create({
      requestBody: {
        info: {
          title: options.title,
          documentTitle: options.documentTitle || options.title,
        },
      },
    });

    // If description is provided, update the form
    if (options.description && response.data.formId) {
      await this.forms.forms.batchUpdate({
        formId: response.data.formId,
        requestBody: {
          requests: [
            {
              updateFormInfo: {
                info: {
                  description: options.description,
                },
                updateMask: "description",
              },
            },
          ],
        },
      });
    }

    return this.formatForm(response.data);
  }

  public async getForm(formId: string): Promise<FormInfo & { items: FormItem[] }> {
    const response = await this.forms.forms.get({
      formId,
    });

    const items = (response.data.items || []).map((item) => this.formatItem(item));

    return {
      ...this.formatForm(response.data),
      items,
    };
  }

  public async updateFormInfo(
    formId: string,
    options: { title?: string; description?: string }
  ): Promise<FormInfo> {
    const updateFields: string[] = [];
    const info: forms_v1.Schema$Info = {};

    if (options.title !== undefined) {
      info.title = options.title;
      updateFields.push("title");
    }
    if (options.description !== undefined) {
      info.description = options.description;
      updateFields.push("description");
    }

    await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            updateFormInfo: {
              info,
              updateMask: updateFields.join(","),
            },
          },
        ],
      },
    });

    return this.getForm(formId);
  }

  // Question Operations

  public async addQuestion(options: CreateQuestionOptions): Promise<FormItem> {
    const question = this.buildQuestion(options);

    const response = await this.forms.forms.batchUpdate({
      formId: options.formId,
      requestBody: {
        requests: [
          {
            createItem: {
              item: {
                title: options.title,
                description: options.description,
                questionItem: {
                  question,
                },
              },
              location: {
                index: options.index ?? 0,
              },
            },
          },
        ],
      },
    });

    const reply = response.data.replies?.[0]?.createItem;
    const createdItemId = reply?.itemId || "";
    return {
      itemId: createdItemId,
      title: options.title,
      description: options.description,
      questionItem: { question: { questionId: "", required: question.required || false } },
    };
  }

  public async updateQuestion(
    formId: string,
    itemIndex: number,
    options: {
      title?: string;
      description?: string;
      required?: boolean;
    }
  ): Promise<void> {
    const updateMask: string[] = [];
    const item: forms_v1.Schema$Item = {};

    if (options.title !== undefined) {
      item.title = options.title;
      updateMask.push("title");
    }
    if (options.description !== undefined) {
      item.description = options.description;
      updateMask.push("description");
    }
    if (options.required !== undefined) {
      item.questionItem = {
        question: {
          required: options.required,
        },
      };
      updateMask.push("questionItem.question.required");
    }

    await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            updateItem: {
              item,
              location: { index: itemIndex },
              updateMask: updateMask.join(","),
            },
          },
        ],
      },
    });
  }

  public async deleteItem(formId: string, itemIndex: number): Promise<void> {
    await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            deleteItem: {
              location: { index: itemIndex },
            },
          },
        ],
      },
    });
  }

  public async moveItem(
    formId: string,
    fromIndex: number,
    toIndex: number
  ): Promise<void> {
    await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            moveItem: {
              originalLocation: { index: fromIndex },
              newLocation: { index: toIndex },
            },
          },
        ],
      },
    });
  }

  // Response Operations

  public async listResponses(
    formId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
      filter?: string;
    } = {}
  ): Promise<{ responses: FormResponse[]; nextPageToken?: string }> {
    const response = await this.forms.forms.responses.list({
      formId,
      pageSize: options.pageSize || 50,
      pageToken: options.pageToken,
      filter: options.filter,
    });

    const responses = (response.data.responses || []).map((r) =>
      this.formatResponse(r)
    );

    return {
      responses,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getResponse(
    formId: string,
    responseId: string
  ): Promise<FormResponse> {
    const response = await this.forms.forms.responses.get({
      formId,
      responseId,
    });

    return this.formatResponse(response.data);
  }

  // Page Break Operations

  public async addPageBreak(
    formId: string,
    title: string,
    index?: number
  ): Promise<FormItem> {
    const response = await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            createItem: {
              item: {
                title,
                pageBreakItem: {},
              },
              location: {
                index: index ?? 0,
              },
            },
          },
        ],
      },
    });

    const reply = response.data.replies?.[0]?.createItem;
    return {
      itemId: reply?.itemId || "",
      title,
      pageBreakItem: {},
    };
  }

  // Text/Description Operations

  public async addTextItem(
    formId: string,
    title: string,
    description?: string,
    index?: number
  ): Promise<FormItem> {
    const response = await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            createItem: {
              item: {
                title,
                description,
                textItem: {},
              },
              location: {
                index: index ?? 0,
              },
            },
          },
        ],
      },
    });

    const reply = response.data.replies?.[0]?.createItem;
    return {
      itemId: reply?.itemId || "",
      title,
      description,
      textItem: {},
    };
  }

  // Image Operations

  public async addImage(
    formId: string,
    sourceUri: string,
    options: {
      title?: string;
      altText?: string;
      index?: number;
    } = {}
  ): Promise<FormItem> {
    const response = await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            createItem: {
              item: {
                title: options.title,
                imageItem: {
                  image: {
                    sourceUri,
                    altText: options.altText,
                  },
                },
              },
              location: {
                index: options.index ?? 0,
              },
            },
          },
        ],
      },
    });

    const reply = response.data.replies?.[0]?.createItem;
    return {
      itemId: reply?.itemId || "",
      title: options.title,
      imageItem: {
        sourceUri,
        altText: options.altText,
      },
    };
  }

  // Video Operations

  public async addVideo(
    formId: string,
    youtubeUri: string,
    options: {
      title?: string;
      caption?: string;
      index?: number;
    } = {}
  ): Promise<FormItem> {
    const response = await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            createItem: {
              item: {
                title: options.title,
                videoItem: {
                  video: {
                    youtubeUri,
                  },
                  caption: options.caption,
                },
              },
              location: {
                index: options.index ?? 0,
              },
            },
          },
        ],
      },
    });

    const reply = response.data.replies?.[0]?.createItem;
    return {
      itemId: reply?.itemId || "",
      title: options.title,
      videoItem: {
        youtubeUri,
        caption: options.caption,
      },
    };
  }

  // Settings Operations

  public async updateSettings(
    formId: string,
    options: {
      quizMode?: boolean;
      collectEmail?: boolean;
      allowResponseEdits?: boolean;
      limitToOneResponse?: boolean;
      confirmationMessage?: string;
    }
  ): Promise<void> {
    const settings: forms_v1.Schema$FormSettings = {};
    const updateMask: string[] = [];

    if (options.quizMode !== undefined) {
      settings.quizSettings = { isQuiz: options.quizMode };
      updateMask.push("quizSettings.isQuiz");
    }

    await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            updateSettings: {
              settings,
              updateMask: updateMask.join(","),
            },
          },
        ],
      },
    });
  }

  // Private helpers

  private buildQuestion(options: CreateQuestionOptions): forms_v1.Schema$Question {
    const question: forms_v1.Schema$Question = {
      required: options.required ?? false,
    };

    switch (options.questionType) {
      case "short_answer":
        question.textQuestion = { paragraph: false };
        break;
      case "paragraph":
        question.textQuestion = { paragraph: true };
        break;
      case "multiple_choice":
        question.choiceQuestion = {
          type: "RADIO",
          options: (options.options || []).map((value) => ({ value })),
        };
        break;
      case "checkboxes":
        question.choiceQuestion = {
          type: "CHECKBOX",
          options: (options.options || []).map((value) => ({ value })),
        };
        break;
      case "dropdown":
        question.choiceQuestion = {
          type: "DROP_DOWN",
          options: (options.options || []).map((value) => ({ value })),
        };
        break;
      case "linear_scale":
        if (options.scaleConfig) {
          question.scaleQuestion = {
            low: options.scaleConfig.low,
            high: options.scaleConfig.high,
            lowLabel: options.scaleConfig.lowLabel,
            highLabel: options.scaleConfig.highLabel,
          };
        }
        break;
      case "date":
        question.dateQuestion = { includeTime: false, includeYear: true };
        break;
      case "time":
        question.timeQuestion = { duration: false };
        break;
    }

    return question;
  }

  private formatForm(form: forms_v1.Schema$Form): FormInfo {
    if (!form.formId) {
      throw new Error("Forms API returned a form without a formId.");
    }
    return {
      formId: form.formId,
      title: form.info?.title || "",
      description: form.info?.description || undefined,
      documentTitle: form.info?.documentTitle || undefined,
      responderUri: form.responderUri || undefined,
      linkedSheetId: form.linkedSheetId || undefined,
    };
  }

  private formatItem(item: forms_v1.Schema$Item): FormItem {
    const formatted: FormItem = {
      itemId: item.itemId || "",
      title: item.title || undefined,
      description: item.description || undefined,
    };

    if (item.questionItem) {
      formatted.questionItem = {
        question: {
          questionId: item.questionItem.question?.questionId || "",
          required: item.questionItem.question?.required || false,
          choiceQuestion: item.questionItem.question?.choiceQuestion as ChoiceQuestion | undefined,
          textQuestion: item.questionItem.question?.textQuestion as TextQuestion | undefined,
          scaleQuestion: item.questionItem.question?.scaleQuestion as ScaleQuestion | undefined,
          dateQuestion: item.questionItem.question?.dateQuestion as DateQuestion | undefined,
          timeQuestion: item.questionItem.question?.timeQuestion as TimeQuestion | undefined,
          fileUploadQuestion: item.questionItem.question?.fileUploadQuestion as FileUploadQuestion | undefined,
          rowQuestion: item.questionItem.question?.rowQuestion as RowQuestion | undefined,
        },
      };
    }

    if (item.pageBreakItem) {
      formatted.pageBreakItem = { ...item.pageBreakItem };
    }

    if (item.textItem) {
      formatted.textItem = { ...item.textItem };
    }

    if (item.imageItem) {
      formatted.imageItem = {
        sourceUri: item.imageItem.image?.sourceUri || undefined,
        altText: item.imageItem.image?.altText || undefined,
        contentUri: item.imageItem.image?.contentUri || undefined,
      };
    }

    if (item.videoItem) {
      formatted.videoItem = {
        youtubeUri: item.videoItem.video?.youtubeUri || "",
        caption: item.videoItem.caption || undefined,
      };
    }

    return formatted;
  }

  private formatResponse(response: forms_v1.Schema$FormResponse): FormResponse {
    const answers: Record<string, FormAnswer> = {};

    if (response.answers) {
      for (const [questionId, answer] of Object.entries(response.answers)) {
        answers[questionId] = {
          questionId,
          textAnswers: answer.textAnswers as FormAnswer["textAnswers"],
          fileUploadAnswers: answer.fileUploadAnswers as FormAnswer["fileUploadAnswers"],
          grade: answer.grade as FormAnswer["grade"],
        };
      }
    }

    return {
      responseId: response.responseId || "",
      createTime: response.createTime || "",
      lastSubmittedTime: response.lastSubmittedTime || "",
      respondentEmail: response.respondentEmail || undefined,
      answers,
      totalScore: response.totalScore !== undefined && response.totalScore !== null ? response.totalScore : undefined,
    };
  }
}

