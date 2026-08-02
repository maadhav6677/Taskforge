'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { apiAssetUrl, apiRequest } from '../lib/api';
import type { Attachment, Task, TaskEvent, TaskStatus, TaskType, User } from '../lib/types';
import type { RootState } from '../store/store';
import { setCreatePanelOpen, setSelectedTaskId } from '../store/uiSlice';

interface CreateValues {
  type: TaskType;
  title: string;
  description: string;
  text: string;
  scheduledAt: string;
  attachments: FileList;
}

interface EditValues {
  title: string;
  description: string;
  text: string;
  scheduledAt: string;
}

type SortValue =
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'updatedAt:desc'
  | 'title:asc'
  | 'title:desc'
  | 'status:asc'
  | 'scheduledAt:asc';

const statuses: Array<TaskStatus | 'ALL'> = ['ALL', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const sorts: Array<{ value: SortValue; label: string }> = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'title:asc', label: 'Title A–Z' },
  { value: 'title:desc', label: 'Title Z–A' },
  { value: 'status:asc', label: 'Status' },
  { value: 'scheduledAt:asc', label: 'Scheduled time' },
];
const pageSize = 10;

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '-';

const formatBytes = (value: number): string => {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
};

const readUrl = (): URLSearchParams =>
  typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

const initialStatus = (): TaskStatus | 'ALL' => {
  const value = readUrl().get('status');
  return statuses.includes(value as TaskStatus | 'ALL') ? (value as TaskStatus | 'ALL') : 'ALL';
};

const initialPage = (): number => {
  const value = Number(readUrl().get('page'));
  return Number.isInteger(value) && value > 0 ? value : 1;
};

const initialSort = (): SortValue => {
  const value = readUrl().get('sort');
  return sorts.some((sort) => sort.value === value) ? (value as SortValue) : 'createdAt:desc';
};

const toLocalDateTime = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const inputText = (task: Task): string => {
  if (!task.input || typeof task.input !== 'object' || !('text' in task.input)) return '';
  const text = (task.input as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
};

export function TaskApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { createPanelOpen, selectedTaskId } = useSelector((state: RootState) => state.ui);
  const [search, setSearch] = useState(() => readUrl().get('q') ?? '');
  const [status, setStatus] = useState<TaskStatus | 'ALL'>(initialStatus);
  const [sort, setSort] = useState<SortValue>(initialSort);
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (status !== 'ALL') params.set('status', status);
    if (sort !== 'createdAt:desc') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, [page, search, sort, status]);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000', {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    const refreshCanonicalState = () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['task'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    };
    socket.on('task.status.changed', refreshCanonicalState);
    socket.on('connect', refreshCanonicalState);
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const summary = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<{ counts: Record<string, number> }>('/dashboard/summary'),
    refetchInterval: 10_000,
  });
  const tasks = useQuery({
    queryKey: ['tasks', search, status, sort, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const [sortBy, sortOrder] = sort.split(':');
      if (search) params.set('q', search);
      if (status !== 'ALL') params.set('status', status);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      return apiRequest<{ tasks: Task[] }>(`/tasks?${params}`);
    },
    refetchInterval: 5_000,
  });

  const totalPages = tasks.data?.meta?.totalPages ?? 0;
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['history'] }),
    ]);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark small">TF</span>
          <div>
            <strong>TaskForge</strong>
            <small>Execution workspace</small>
          </div>
        </div>
        <div className="profile">
          <span>
            <strong>{user.email.split('@')[0]}</strong>
            <small>{user.role.toLowerCase()}</small>
          </span>
          <button className="ghost-button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <section className="hero-row">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1>Good work starts with a truthful queue.</h1>
          <p>Track every task from durable creation through worker execution.</p>
        </div>
        <button
          className="primary-button compact"
          onClick={() => dispatch(setCreatePanelOpen(true))}
        >
          + New task
        </button>
      </section>

      <section className="metric-grid" aria-label="Task summary">
        {(['total', 'pending', 'processing', 'completed', 'failed'] as const).map((key) => (
          <article className={`metric ${key}`} key={key}>
            <span>{key}</span>
            <strong>{summary.data?.data.counts[key] ?? '-'}</strong>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <div className="task-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Task ledger</p>
              <h2>All tasks</h2>
            </div>
            <span className="result-count">{tasks.data?.meta?.totalItems ?? 0} results</span>
          </div>
          <div className="filters">
            <label className="search-field">
              <span className="sr-only">Search tasks</span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search title or description"
              />
            </label>
            <label>
              <span className="sr-only">Filter status</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as TaskStatus | 'ALL');
                  setPage(1);
                }}
              >
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Sort tasks</span>
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortValue);
                  setPage(1);
                }}
              >
                {sorts.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {tasks.isLoading ? (
            <TaskSkeleton />
          ) : tasks.error ? (
            <Empty title="Could not load tasks" body={tasks.error.message} />
          ) : tasks.data?.data.tasks.length === 0 ? (
            <Empty title="No tasks found" body="Create a task or adjust your filters." />
          ) : (
            <div className="task-list">
              {tasks.data?.data.tasks.map((task) => (
                <button
                  className={`task-row ${selectedTaskId === task.id ? 'selected' : ''}`}
                  key={task.id}
                  onClick={() => dispatch(setSelectedTaskId(task.id))}
                >
                  <span className={`status-dot ${task.status.toLowerCase()}`} />
                  <span className="task-copy">
                    <strong>{task.title}</strong>
                    <small>
                      {task.type.replace('_', ' ').toLowerCase()} - {formatDate(task.createdAt)}
                    </small>
                  </span>
                  <span className={`status-pill ${task.status.toLowerCase()}`}>{task.status}</span>
                  <span aria-hidden="true">&gt;</span>
                </button>
              ))}
            </div>
          )}
          {totalPages > 1 ? (
            <nav className="pagination" aria-label="Task list pages">
              <button
                className="ghost-button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                className="ghost-button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          ) : null}
        </div>

        <aside className="detail-panel">
          {selectedTaskId ? (
            <TaskDetail
              taskId={selectedTaskId}
              onChanged={invalidate}
              onDeleted={async () => {
                dispatch(setSelectedTaskId(null));
                await invalidate();
              }}
            />
          ) : (
            <Empty
              title="Select a task"
              body="Inspect input, output, attempts, and immutable history."
            />
          )}
        </aside>
      </section>

      {createPanelOpen ? (
        <CreateTaskPanel
          onClose={() => dispatch(setCreatePanelOpen(false))}
          onCreated={async (task) => {
            dispatch(setCreatePanelOpen(false));
            dispatch(setSelectedTaskId(task.id));
            setPage(1);
            await invalidate();
          }}
        />
      ) : null}
    </main>
  );
}

function CreateTaskPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (task: Task) => Promise<void>;
}) {
  const { register, handleSubmit, watch, formState } = useForm<CreateValues>({
    defaultValues: { type: 'TEXT_PROCESSING' },
  });
  const taskType = watch('type');
  const mutation = useMutation({
    mutationFn: (values: CreateValues) => {
      const task = {
        title: values.title,
        description: values.description || undefined,
        type: values.type,
        input:
          values.type === 'TEXT_PROCESSING'
            ? { schemaVersion: 1, text: values.text }
            : { schemaVersion: 1 },
        scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
        maxAttempts: 3,
      };
      if (values.type === 'TEXT_PROCESSING') {
        return apiRequest<{ task: Task }>('/tasks', {
          method: 'POST',
          body: JSON.stringify(task),
        });
      }
      const files = Array.from(values.attachments ?? []);
      if (files.length === 0) throw new Error('Select at least one image or PDF.');
      if (files.length > 5) throw new Error('A task can contain at most five files.');
      const body = new FormData();
      body.set('task', JSON.stringify(task));
      files.forEach((file) => body.append('attachments', file));
      return apiRequest<{ task: Task }>('/tasks', { method: 'POST', body });
    },
    onSuccess: (result) => onCreated(result.data.task),
  });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">New asynchronous work</p>
            <h2 id="create-title">Create task</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <fieldset className="type-selector">
            <legend>Task type</legend>
            <label>
              <input type="radio" value="TEXT_PROCESSING" {...register('type')} />
              <span>
                Text processing
                <small>Normalize text and calculate deterministic statistics.</small>
              </span>
            </label>
            <label>
              <input type="radio" value="FILE_INSPECTION" {...register('type')} />
              <span>
                File inspection
                <small>Verify images or PDFs and calculate their SHA-256.</small>
              </span>
            </label>
          </fieldset>
          <label>
            Title
            <input autoFocus {...register('title', { required: true, maxLength: 160 })} />
          </label>
          <label>
            Description
            <textarea rows={2} maxLength={2_000} {...register('description')} />
          </label>
          {taskType === 'TEXT_PROCESSING' ? (
            <label>
              Text to process
              <textarea rows={6} {...register('text', { required: true, maxLength: 2_000 })} />
            </label>
          ) : (
            <label>
              Images or PDFs
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                multiple
                {...register('attachments', { required: true })}
              />
              <small>Up to five files, 8 MB each. File contents are verified by the API.</small>
            </label>
          )}
          <label>
            Run later (optional)
            <input type="datetime-local" {...register('scheduledAt')} />
          </label>
          {mutation.error ? (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          ) : null}
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={mutation.isPending || formState.isSubmitting}
            >
              {mutation.isPending ? 'Creating...' : 'Create and queue'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TaskDetail({
  taskId,
  onChanged,
  onDeleted,
}: {
  taskId: string;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => apiRequest<{ task: Task; attachments: Attachment[] }>(`/tasks/${taskId}`),
  });
  const history = useQuery({
    queryKey: ['history', taskId],
    queryFn: () => apiRequest<{ events: TaskEvent[] }>(`/tasks/${taskId}/history`),
  });
  const task = detail.data?.data.task;
  const attachments = detail.data?.data.attachments ?? [];
  const action = useMutation({
    mutationFn: (kind: 'delete' | 'retry') => {
      if (!task) throw new Error('Task details are not available.');
      return apiRequest<unknown>(
        kind === 'retry' ? `/tasks/${task.id}/retry` : `/tasks/${task.id}`,
        {
          method: kind === 'retry' ? 'POST' : 'DELETE',
          headers: { 'If-Match': String(task.version) },
        },
      );
    },
    onSuccess: (_result, kind) => (kind === 'delete' ? onDeleted() : onChanged()),
  });

  if (detail.isLoading) return <TaskSkeleton />;
  if (detail.error) return <Empty title="Could not load task" body={detail.error.message} />;
  if (!task) return <Empty title="Task unavailable" body="Select another task from the ledger." />;

  return (
    <div>
      <div className="detail-header">
        <span className={`status-pill ${task.status.toLowerCase()}`}>{task.status}</span>
        <h2>{task.title}</h2>
        <p>{task.description || 'No description provided.'}</p>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Type</dt>
          <dd>{task.type.replace('_', ' ')}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>v{task.executionVersion}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>
            {task.attemptsMade} / {task.maxAttempts}
          </dd>
        </div>
        <div>
          <dt>Scheduled</dt>
          <dd>{formatDate(task.scheduledAt)}</dd>
        </div>
      </dl>
      <section className="data-block">
        <h3>Input</h3>
        <pre>{JSON.stringify(task.input, null, 2)}</pre>
      </section>
      {task.result ? (
        <section className="data-block success">
          <h3>Result</h3>
          <pre>{JSON.stringify(task.result, null, 2)}</pre>
        </section>
      ) : null}
      {attachments.length > 0 ? (
        <section className="attachment-list">
          <h3>Private attachments</h3>
          {attachments.map((attachment) => (
            <a key={attachment.id} href={apiAssetUrl(`/files/${attachment.id}/download`)}>
              <span>
                <strong>{attachment.originalName}</strong>
                <small>
                  {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
                </small>
              </span>
              <span>Download</span>
            </a>
          ))}
        </section>
      ) : null}
      {task.errorMessage ? <p className="form-error">{task.errorMessage}</p> : null}

      {editing ? (
        <EditTaskForm
          key={`${task.id}:${task.version}`}
          task={task}
          onCancel={() => setEditing(false)}
          onChanged={async () => {
            setEditing(false);
            await onChanged();
          }}
        />
      ) : (
        <div className="button-row">
          {task.status === 'PENDING' ? (
            <button className="ghost-button" onClick={() => setEditing(true)}>
              Edit
            </button>
          ) : null}
          {task.status === 'FAILED' ? (
            <button
              className="primary-button compact"
              disabled={action.isPending}
              onClick={() => action.mutate('retry')}
            >
              Retry task
            </button>
          ) : null}
          {task.status !== 'PROCESSING' ? (
            <button
              className="danger-button"
              disabled={action.isPending}
              onClick={() => action.mutate('delete')}
            >
              Delete
            </button>
          ) : null}
        </div>
      )}
      {action.error ? (
        <p className="form-error" role="alert">
          {action.error.message}
        </p>
      ) : null}

      <section className="timeline">
        <h3>History</h3>
        {history.isLoading ? <p>Loading history…</p> : null}
        {history.error ? <p className="form-error">{history.error.message}</p> : null}
        {history.data?.data.events.map((event) => (
          <div className="timeline-item" key={event.id}>
            <span />
            <div>
              <strong>{event.type.replaceAll('_', ' ')}</strong>
              <small>
                {formatDate(event.occurredAt)}
                {event.attempt ? ` - attempt ${event.attempt}` : ''}
              </small>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function EditTaskForm({
  task,
  onCancel,
  onChanged,
}: {
  task: Task;
  onCancel: () => void;
  onChanged: () => Promise<void>;
}) {
  const { register, handleSubmit, formState } = useForm<EditValues>({
    defaultValues: {
      title: task.title,
      description: task.description ?? '',
      text: inputText(task),
      scheduledAt: toLocalDateTime(task.scheduledAt),
    },
  });
  const mutation = useMutation({
    mutationFn: (values: EditValues) =>
      apiRequest<{ task: Task }>(`/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': String(task.version) },
        body: JSON.stringify({
          title: values.title,
          description: values.description || null,
          scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : null,
          ...(task.type === 'TEXT_PROCESSING'
            ? { input: { schemaVersion: 1, text: values.text } }
            : {}),
        }),
      }),
    onSuccess: onChanged,
  });

  return (
    <form className="inline-editor" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
      <h3>Edit pending task</h3>
      <label>
        Title
        <input {...register('title', { required: true, maxLength: 160 })} />
      </label>
      <label>
        Description
        <textarea rows={2} maxLength={2_000} {...register('description')} />
      </label>
      {task.type === 'TEXT_PROCESSING' ? (
        <label>
          Text to process
          <textarea rows={5} {...register('text', { required: true, maxLength: 2_000 })} />
        </label>
      ) : null}
      <label>
        Run later (optional)
        <input type="datetime-local" {...register('scheduledAt')} />
      </label>
      {mutation.error ? (
        <p className="form-error" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <div className="button-row">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary-button compact"
          disabled={mutation.isPending || formState.isSubmitting}
        >
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function TaskSkeleton() {
  return (
    <div className="skeleton-stack" aria-label="Loading tasks">
      <span />
      <span />
      <span />
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
