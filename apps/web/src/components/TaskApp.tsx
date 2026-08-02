'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import type { Task, User } from '../lib/types';

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '-';

export function TaskApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const summary = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<{ counts: Record<string, number> }>('/dashboard/summary'),
    refetchInterval: 10_000,
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'overview'],
    queryFn: () => apiRequest<{ tasks: Task[] }>('/tasks?pageSize=5'),
    refetchInterval: 10_000,
  });

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
          <p>Track durable task state without hiding worker execution behind a spinner.</p>
        </div>
      </section>
      <section className="metric-grid" aria-label="Task summary">
        {(['total', 'pending', 'processing', 'completed', 'failed'] as const).map((key) => (
          <article className={`metric ${key}`} key={key}>
            <span>{key}</span>
            <strong>{summary.data?.data.counts[key] ?? '-'}</strong>
          </article>
        ))}
      </section>
      <section className="task-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent work</p>
            <h2>Latest tasks</h2>
          </div>
          <span className="result-count">
            {tasks.data?.meta?.totalItems ?? tasks.data?.data.tasks.length ?? 0} total
          </span>
        </div>
        {tasks.isLoading ? (
          <TaskSkeleton />
        ) : tasks.error ? (
          <Empty title="Could not load tasks" body={tasks.error.message} />
        ) : tasks.data?.data.tasks.length === 0 ? (
          <Empty title="No tasks yet" body="Created tasks will appear here once the API returns them." />
        ) : (
          <div className="task-list">
            {tasks.data?.data.tasks.map((task) => (
              <div className="task-row" key={task.id}>
                <span className={`status-dot ${task.status.toLowerCase()}`} />
                <span className="task-copy">
                  <strong>{task.title}</strong>
                  <small>
                    {task.type.replace('_', ' ').toLowerCase()} - {formatDate(task.createdAt)}
                  </small>
                </span>
                <span className={`status-pill ${task.status.toLowerCase()}`}>{task.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function TaskSkeleton() {
  return (
    <div className="task-list" aria-label="Loading tasks">
      {[0, 1, 2].map((item) => (
        <div className="task-row skeleton" key={item}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
