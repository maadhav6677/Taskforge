'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDispatch, useSelector } from 'react-redux';
import { apiRequest } from '../lib/api';
import type { RootState } from '../store/store';
import { setCreatePanelOpen, setSelectedTaskId } from '../store/uiSlice';
import type { Task, TaskEvent, TaskStatus, User } from '../lib/types';

interface CreateValues {
  title: string;
  description: string;
  text: string;
  scheduledAt: string;
}

const statuses: Array<TaskStatus | 'ALL'> = ['ALL', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];
const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '-';

export function TaskApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  const { createPanelOpen, selectedTaskId } = useSelector((state: RootState) => state.ui);
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('q') ?? '',
  );
  const [status, setStatus] = useState<TaskStatus | 'ALL'>(
    () => (new URLSearchParams(window.location.search).get('status') as TaskStatus | null) ?? 'ALL',
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (status !== 'ALL') params.set('status', status);
    window.history.replaceState(null, '', params.size ? `?${params}` : window.location.pathname);
  }, [search, status]);

  const summary = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<{ counts: Record<string, number> }>('/dashboard/summary'),
    refetchInterval: 10_000,
  });
  const tasks = useQuery({
    queryKey: ['tasks', search, status],
    queryFn: () =>
      apiRequest<{ tasks: Task[] }>(
        `/tasks?${new URLSearchParams({
          ...(search ? { q: search } : {}),
          ...(status !== 'ALL' ? { status } : {}),
        })}`,
      ),
    refetchInterval: 5_000,
  });
  const selectedTask = tasks.data?.data.tasks.find((task) => task.id === selectedTaskId);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
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
            <span className="result-count">
              {tasks.data?.meta?.totalItems ?? tasks.data?.data.tasks.length ?? 0} results
            </span>
          </div>
          <div className="filters">
            <label className="search-field">
              <span className="sr-only">Search tasks</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title or description"
              />
            </label>
            <label>
              <span className="sr-only">Filter status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as TaskStatus | 'ALL')}
              >
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
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
        </div>
        <aside className="detail-panel">
          {selectedTask ? (
            <TaskDetail task={selectedTask} onChanged={invalidate} />
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
  const { register, handleSubmit, formState } = useForm<CreateValues>();
  const mutation = useMutation({
    mutationFn: (values: CreateValues) =>
      apiRequest<{ task: Task }>('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: values.title,
          description: values.description || undefined,
          type: 'TEXT_PROCESSING',
          input: { schemaVersion: 1, text: values.text },
          scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
          maxAttempts: 3,
        }),
      }),
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
            <h2 id="create-title">Create text task</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <label>
            Title
            <input autoFocus {...register('title', { required: true, maxLength: 160 })} />
          </label>
          <label>
            Description
            <textarea rows={2} {...register('description')} />
          </label>
          <label>
            Text to process
            <textarea rows={6} {...register('text', { required: true, maxLength: 2000 })} />
          </label>
          <label>
            Run later (optional)
            <input type="datetime-local" {...register('scheduledAt')} />
          </label>
          {mutation.error ? <p className="form-error">{mutation.error.message}</p> : null}
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

function TaskDetail({ task, onChanged }: { task: Task; onChanged: () => Promise<void> }) {
  const history = useQuery({
    queryKey: ['history', task.id],
    queryFn: () => apiRequest<{ events: TaskEvent[] }>(`/tasks/${task.id}/history`),
  });
  const action = useMutation({
    mutationFn: (kind: 'delete' | 'retry') =>
      apiRequest(kind === 'retry' ? `/tasks/${task.id}/retry` : `/tasks/${task.id}`, {
        method: kind === 'retry' ? 'POST' : 'DELETE',
        headers: { 'If-Match': String(task.version) },
      }),
    onSuccess: onChanged,
  });
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
      {task.errorMessage ? <p className="form-error">{task.errorMessage}</p> : null}
      <div className="button-row">
        {task.status === 'FAILED' ? (
          <button className="primary-button compact" onClick={() => action.mutate('retry')}>
            Retry task
          </button>
        ) : null}
        {task.status !== 'PROCESSING' ? (
          <button className="danger-button" onClick={() => action.mutate('delete')}>
            Delete
          </button>
        ) : null}
      </div>
      <section className="timeline">
        <h3>History</h3>
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
