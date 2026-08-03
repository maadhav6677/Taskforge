'use client';

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import type { QueueContext, Task, User } from '../lib/types';
import { QueueContextPanel } from './QueueContextPanel';

export function AdminApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const summary = useQuery({
    queryKey: ['admin-summary'],
    queryFn: () =>
      apiRequest<{ counts: Record<string, number>; queue: QueueContext }>(
        '/admin/dashboard/summary',
      ),
  });
  const tasks = useQuery({
    queryKey: ['admin-tasks'],
    queryFn: () => apiRequest<{ tasks: Task[] }>('/admin/tasks'),
  });
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark small">TF</span>
          <div>
            <strong>TaskForge Admin</strong>
            <small>Read-only operations</small>
          </div>
        </div>
        <div className="profile">
          <span>
            <strong>{user.email}</strong>
            <small>administrator</small>
          </span>
          <button className="ghost-button" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>
      <section className="hero-row">
        <div>
          <p className="eyebrow">System visibility</p>
          <h1>Operational truth, without mutation access.</h1>
          <p>Review aggregate state and recent tasks across users.</p>
        </div>
      </section>
      <section className="metric-grid">
        {Object.entries(summary.data?.data.counts ?? {}).map(([key, value]) => (
          <article className={`metric ${key}`} key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <QueueContextPanel queue={summary.data?.data.queue} label="Global queue" />
      <section className="task-panel admin-table">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Global ledger</p>
            <h2>Recent tasks</h2>
          </div>
        </div>
        <div className="task-list">
          {tasks.data?.data.tasks.map((task) => (
            <div className="task-row" key={task.id}>
              <span className={`status-dot ${task.status.toLowerCase()}`} />
              <span className="task-copy">
                <strong>{task.title}</strong>
                <small>{task.ownerId}</small>
              </span>
              <span className={`status-pill ${task.status.toLowerCase()}`}>{task.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
