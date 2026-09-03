import { google, type tasks_v1, type Auth } from "googleapis";
import { type TaskList, type Task } from "../types/index.js";

/**
 * Tasks Service - Alternative to Google Keep
 *
 * Note: Google Keep does not have an official public API.
 * The Google Tasks API is used as a similar alternative for managing
 * notes and task lists. Tasks can include notes/descriptions.
 */
/**
 * Maps a Tasks API task-list resource to our TaskList shape. The SDK types
 * id/title as nullable; our TaskList requires them, so a resource missing
 * either is malformed and throws rather than coercing a null into a string.
 */
const toTaskList = (item: tasks_v1.Schema$TaskList): TaskList => {
  if (!item.id || !item.title) {
    throw new Error(
      `Tasks API returned a task list missing a required field (id/title): ${JSON.stringify(
        { id: item.id, title: item.title }
      )}`
    );
  }
  return {
    id: item.id,
    title: item.title,
    updated: item.updated || undefined,
  };
};

/**
 * Maps a Tasks API task resource to our Task shape, guarding the required
 * id/title fields the SDK types as nullable.
 */
const toTask = (item: tasks_v1.Schema$Task): Task => {
  if (!item.id || !item.title) {
    throw new Error(
      `Tasks API returned a task missing a required field (id/title): ${JSON.stringify(
        { id: item.id, title: item.title }
      )}`
    );
  }
  return {
    id: item.id,
    title: item.title,
    notes: item.notes || undefined,
    status: (item.status as "needsAction" | "completed") || "needsAction",
    due: item.due || undefined,
    completed: item.completed || undefined,
    parent: item.parent || undefined,
    position: item.position || undefined,
  };
};

export class TasksService {
  private readonly tasks: tasks_v1.Tasks;

  constructor(authClient: Auth.OAuth2Client) {
    this.tasks = google.tasks({ version: "v1", auth: authClient });
  }

  // Task Lists Operations

  public async listTaskLists(): Promise<TaskList[]> {
    const response = await this.tasks.tasklists.list({
      maxResults: 100,
    });

    return (response.data.items || []).map(toTaskList);
  }

  public async getTaskList(taskListId: string): Promise<TaskList> {
    const response = await this.tasks.tasklists.get({
      tasklist: taskListId,
    });

    return toTaskList(response.data);
  }

  public async createTaskList(title: string): Promise<TaskList> {
    const response = await this.tasks.tasklists.insert({
      requestBody: { title },
    });

    return toTaskList(response.data);
  }

  public async updateTaskList(taskListId: string, title: string): Promise<TaskList> {
    const response = await this.tasks.tasklists.update({
      tasklist: taskListId,
      requestBody: { title },
    });

    return toTaskList(response.data);
  }

  public async deleteTaskList(taskListId: string): Promise<void> {
    await this.tasks.tasklists.delete({
      tasklist: taskListId,
    });
  }

  // Tasks Operations

  public async listTasks(
    taskListId: string,
    options: {
      showCompleted?: boolean;
      showDeleted?: boolean;
      showHidden?: boolean;
      maxResults?: number;
      pageToken?: string;
    } = {}
  ): Promise<{ tasks: Task[]; nextPageToken?: string }> {
    const response = await this.tasks.tasks.list({
      tasklist: taskListId,
      showCompleted: options.showCompleted ?? true,
      showDeleted: options.showDeleted ?? false,
      showHidden: options.showHidden ?? false,
      maxResults: options.maxResults ?? 100,
      pageToken: options.pageToken,
    });

    const tasks: Task[] = (response.data.items || []).map(toTask);

    return {
      tasks,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getTask(taskListId: string, taskId: string): Promise<Task> {
    const response = await this.tasks.tasks.get({
      tasklist: taskListId,
      task: taskId,
    });

    return toTask(response.data);
  }

  public async createTask(
    taskListId: string,
    options: {
      title: string;
      notes?: string;
      due?: string;
      parent?: string;
    }
  ): Promise<Task> {
    const response = await this.tasks.tasks.insert({
      tasklist: taskListId,
      requestBody: {
        title: options.title,
        notes: options.notes,
        due: options.due,
      },
      parent: options.parent,
    });

    return toTask(response.data);
  }

  public async updateTask(
    taskListId: string,
    taskId: string,
    updates: {
      title?: string;
      notes?: string;
      status?: "needsAction" | "completed";
      due?: string;
    }
  ): Promise<Task> {
    // Get current task first
    const currentTask = await this.getTask(taskListId, taskId);

    const response = await this.tasks.tasks.update({
      tasklist: taskListId,
      task: taskId,
      requestBody: {
        id: taskId,
        title: updates.title ?? currentTask.title,
        notes: updates.notes ?? currentTask.notes,
        status: updates.status ?? currentTask.status,
        due: updates.due ?? currentTask.due,
      },
    });

    return toTask(response.data);
  }

  public async deleteTask(taskListId: string, taskId: string): Promise<void> {
    await this.tasks.tasks.delete({
      tasklist: taskListId,
      task: taskId,
    });
  }

  public async completeTask(taskListId: string, taskId: string): Promise<Task> {
    return this.updateTask(taskListId, taskId, { status: "completed" });
  }

  public async uncompleteTask(taskListId: string, taskId: string): Promise<Task> {
    return this.updateTask(taskListId, taskId, { status: "needsAction" });
  }

  public async moveTask(
    taskListId: string,
    taskId: string,
    options: {
      parent?: string;
      previous?: string;
    }
  ): Promise<Task> {
    const response = await this.tasks.tasks.move({
      tasklist: taskListId,
      task: taskId,
      parent: options.parent,
      previous: options.previous,
    });

    return toTask(response.data);
  }

  public async clearCompletedTasks(taskListId: string): Promise<void> {
    await this.tasks.tasks.clear({
      tasklist: taskListId,
    });
  }

  // Convenience methods to use tasks as notes (similar to Keep)

  public async createNote(title: string, content: string): Promise<{ taskListId: string; task: Task }> {
    // Find or create a "Notes" task list
    const lists = await this.listTaskLists();
    let notesList = lists.find((l) => l.title === "Notes");

    if (!notesList) {
      notesList = await this.createTaskList("Notes");
    }

    const task = await this.createTask(notesList.id, {
      title,
      notes: content,
    });

    return { taskListId: notesList.id, task };
  }

  public async listNotes(): Promise<Task[]> {
    const lists = await this.listTaskLists();
    const notesList = lists.find((l) => l.title === "Notes");

    if (!notesList) {
      return [];
    }

    const result = await this.listTasks(notesList.id, { showCompleted: true });
    return result.tasks;
  }

  public async updateNote(taskId: string, title?: string, content?: string): Promise<Task> {
    const lists = await this.listTaskLists();
    const notesList = lists.find((l) => l.title === "Notes");

    if (!notesList) {
      throw new Error("Notes list not found");
    }

    return this.updateTask(notesList.id, taskId, {
      title,
      notes: content,
    });
  }

  public async deleteNote(taskId: string): Promise<void> {
    const lists = await this.listTaskLists();
    const notesList = lists.find((l) => l.title === "Notes");

    if (!notesList) {
      throw new Error("Notes list not found");
    }

    await this.deleteTask(notesList.id, taskId);
  }
}

