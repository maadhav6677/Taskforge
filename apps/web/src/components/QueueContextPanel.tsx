import type { QueueContext } from '../lib/types';

export function QueueContextPanel({
  queue,
  label,
}: {
  queue: QueueContext | undefined;
  label: string;
}) {
  return (
    <section className="queue-context" aria-label={label}>
      <div>
        <p className="eyebrow">{label}</p>
        <h2>{queue?.available === false ? 'Queue unavailable' : 'Execution state'}</h2>
      </div>
      <dl>
        {(['waiting', 'delayed', 'active'] as const).map((state) => (
          <div key={state}>
            <dt>{state}</dt>
            <dd>{queue?.available === false ? '-' : (queue?.[state] ?? '-')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
