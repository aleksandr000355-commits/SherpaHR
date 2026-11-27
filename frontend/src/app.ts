import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Api } from "./api";
import {
  AttentionResult,
  Comment,
  Context,
  Project,
  Task,
  TaskDetail,
  TaskStatus,
} from "./models";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./app.html",
})
export class AppComponent {
  api = inject(Api);
  context = signal<Context | null>(null);
  projects = signal<Project[]>([]);
  project = signal<Project | null>(null);
  tasks = signal<Task[]>([]);
  attention = signal<AttentionResult | null>(null);
  overview = signal(true);
  detail = signal<TaskDetail | null>(null);
  detailProject = signal<Project | null>(null);
  loading = signal(false);
  detailLoading = signal(false);
  saving = signal(false);
  error = signal("");
  detailError = signal("");
  notice = signal("");
  status = "";
  search = "";
  reason = signal("");
  overviewSearch = signal("");
  overviewProject = signal("");
  comment = "";
  creating = signal(false);
  draft = this.emptyDraft();
  private generation = 0;
  private detailGeneration = 0;
  readonly statuses: { value: TaskStatus; label: string }[] = [
    { value: "open", label: "Открыта" },
    { value: "in_progress", label: "В работе" },
    { value: "blocked", label: "Заблокирована" },
    { value: "done", label: "Готово" },
  ];
  readonly reasons = [
    { value: "blocked", label: "Блокировки" },
    { value: "overdue", label: "Просрочено" },
    { value: "request", label: "Просьбы о помощи" },
    { value: "unassigned", label: "Без исполнителя" },
    { value: "soon", label: "Ближайший срок" },
  ];
  ownedProjects = computed(() =>
    this.projects().filter(
      (p) => !p.archived && p.owner_id === this.context()?.user.id,
    ),
  );
  visibleAttention = computed(() =>
    (this.attention()?.items ?? []).filter(
      (t) =>
        (!this.reason() || t.signals.some((s) => s.code === this.reason())) &&
        (!this.overviewProject() ||
          String(t.project_id) === this.overviewProject()) &&
        (
          t.title +
          " " +
          t.project_name +
          " " +
          t.description +
          " " +
          (t.evidence?.body ?? "")
        )
          .toLocaleLowerCase("ru")
          .includes(this.overviewSearch().toLocaleLowerCase("ru").trim()),
    ),
  );
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set("");
    try {
      const [context, projects, attention] = await Promise.all([
        this.api.request<Context>("/context"),
        this.api.request<Project[]>("/projects"),
        this.api.request<AttentionResult>("/attention"),
      ]);
      if (generation !== this.generation) return;
      this.context.set(context);
      this.projects.set(projects);
      this.attention.set(attention);
      if (!this.overview() && this.project()) {
        const p = projects.find((p) => p.id === this.project()?.id);
        if (p) await this.selectProject(p);
      }
    } catch (error) {
      if (generation === this.generation) this.error.set(this.message(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  switchUser(value: string): void {
    this.api.userId = Number(value);
    this.closeDetail();
    this.project.set(null);
    this.projects.set([]);
    this.tasks.set([]);
    this.context.set(null);
    this.attention.set(null);
    this.overview.set(true);
    this.notice.set("");
    this.resetAttentionFilters();
    void this.load();
  }
  showOverview(): void {
    ++this.generation;
    this.overview.set(true);
    this.project.set(null);
    this.closeDetail();
    this.error.set("");
    this.loading.set(false);
    void this.load();
  }
  resetAttentionFilters(): void {
    this.reason.set("");
    this.overviewSearch.set("");
    this.overviewProject.set("");
  }
  async selectProject(project: Project): Promise<void> {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set("");
    this.notice.set("");
    this.overview.set(false);
    this.project.set(project);
    this.tasks.set([]);
    this.status = "";
    this.search = "";
    this.closeDetail();
    try {
      const tasks = await this.api.request<Task[]>(
        "/projects/" + project.id + "/tasks",
      );
      if (generation === this.generation) this.tasks.set(tasks);
    } catch (error) {
      if (generation === this.generation) this.error.set(this.message(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  filteredTasks(): Task[] {
    return this.tasks().filter(
      (task) =>
        (!this.status || task.status === this.status) &&
        task.title
          .toLocaleLowerCase("ru")
          .includes(this.search.toLocaleLowerCase("ru")),
    );
  }
  async openTask(task: Task): Promise<void> {
    const generation = ++this.detailGeneration;
    this.detailError.set("");
    this.notice.set("");
    this.creating.set(false);
    this.detail.set(null);
    this.detailProject.set(
      this.projects().find((p) => p.id === task.project_id) ?? null,
    );
    this.detailLoading.set(true);
    try {
      const detail = await this.api.request<TaskDetail>("/tasks/" + task.id);
      if (generation !== this.detailGeneration) return;
      this.detail.set(detail);
      this.comment = "";
      this.setDraft(detail);
      setTimeout(
        () => document.querySelector<HTMLElement>(".detail input")?.focus(),
        0,
      );
    } catch (error) {
      if (generation === this.detailGeneration)
        this.detailError.set(this.message(error));
    } finally {
      if (generation === this.detailGeneration) this.detailLoading.set(false);
    }
  }
  closeDetail(): void {
    ++this.detailGeneration;
    this.detail.set(null);
    this.detailProject.set(null);
    this.creating.set(false);
    this.detailLoading.set(false);
    this.detailError.set("");
    this.comment = "";
  }
  createTask(): void {
    this.closeDetail();
    this.detailProject.set(this.project());
    this.draft = this.emptyDraft();
    this.creating.set(true);
  }
  async saveTask(): Promise<void> {
    const project = this.detailProject();
    if (!project || this.saving()) return;
    const validation = this.validateDraft();
    if (validation) {
      this.detailError.set(validation);
      return;
    }
    const userId = this.api.userId,
      generation = this.detailGeneration,
      existing = this.detail();
    this.saving.set(true);
    this.detailError.set("");
    try {
      const data = {
        ...this.draft,
        due_at: this.draft.due_at
          ? this.draft.due_at.slice(0, 16) + ":00Z"
          : null,
        ...(existing ? { version: existing.version } : {}),
      };
      const task = await this.api.request<Task>(
        existing
          ? "/tasks/" + existing.id
          : "/projects/" + project.id + "/tasks",
        existing ? "PATCH" : "POST",
        data,
      );
      if (userId !== this.api.userId) return;
      if (!existing)
        this.projects.update((list) =>
          list.map((p) =>
            p.id === project.id ? { ...p, task_count: p.task_count + 1 } : p,
          ),
        );
      if (this.project()?.id === project.id)
        this.tasks.update((list) =>
          existing
            ? list.map((t) => (t.id === task.id ? task : t))
            : [...list, task],
        );
      if (generation === this.detailGeneration) {
        this.detail.set({ ...task, comments: existing?.comments ?? [] });
        this.creating.set(false);
        this.setDraft(task);
        this.notice.set("Задача сохранена");
      }
      await this.refreshAttention(userId);
    } catch (error) {
      if (generation === this.detailGeneration)
        this.detailError.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  async addComment(): Promise<void> {
    const task = this.detail();
    if (!task || this.saving()) return;
    if (this.bytes(this.comment.trim()) > 5000) {
      this.detailError.set(
        "Комментарий: максимум 5000 байт UTF-8. Сократите текст.",
      );
      return;
    }
    const generation = this.detailGeneration,
      userId = this.api.userId;
    this.saving.set(true);
    this.detailError.set("");
    try {
      const comment = await this.api.request<Comment>(
        "/tasks/" + task.id + "/comments",
        "POST",
        { body: this.comment },
      );
      if (generation !== this.detailGeneration) return;
      this.detail.update((current) =>
        current
          ? { ...current, comments: [...current.comments, comment] }
          : current,
      );
      this.comment = "";
      this.notice.set("Комментарий добавлен");
      await this.refreshAttention(userId);
    } catch (error) {
      if (generation === this.detailGeneration)
        this.detailError.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  private async refreshAttention(userId: number): Promise<void> {
    try {
      const result = await this.api.request<AttentionResult>("/attention");
      if (userId === this.api.userId) this.attention.set(result);
    } catch {
      if (userId === this.api.userId)
        this.error.set(
          "Изменение сохранено, но обзор не обновился. Нажмите «Обновить».",
        );
    }
  }
  private setDraft(task: Task): void {
    this.draft = {
      title: task.title,
      description: task.description,
      status: task.status,
      assignee_id: task.assignee_id,
      due_at: task.due_at?.slice(0, 16) ?? "",
    };
  }
  bytes(value: string): number {
    return new TextEncoder().encode(value).length;
  }
  private validateDraft(): string {
    if (!this.draft.title.trim()) return "Введите название задачи.";
    if (this.bytes(this.draft.title.trim()) > 200)
      return "Название: максимум 200 байт UTF-8.";
    if (this.bytes(this.draft.description.trim()) > 10000)
      return "Описание: максимум 10000 байт UTF-8.";
    return "";
  }
  statusLabel(status: string): string {
    return this.statuses.find((s) => s.value === status)?.label ?? status;
  }
  userName(id: number | null): string {
    return (
      this.context()?.users.find((u) => u.id === id)?.name ?? "Не назначен"
    );
  }
  private message(error: unknown): string {
    return error instanceof Error
      ? error.message
      : "Не удалось выполнить запрос";
  }
  private emptyDraft(): {
    title: string;
    description: string;
    status: TaskStatus;
    assignee_id: number | null;
    due_at: string;
  } {
    return {
      title: "",
      description: "",
      status: "open",
      assignee_id: null,
      due_at: "",
    };
  }
}
