import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { TaskApp } from '../src/components/TaskApp';
import { apiRequest } from '../src/lib/api';
import { makeStore } from '../src/store/store';
import type { ApiEnvelope, Task } from '../src/lib/types';

jest.mock('socket.io-client', () => ({
  io: () => ({ on: jest.fn(), disconnect: jest.fn() }),
}));

jest.mock('../src/lib/api', () => ({
  apiAssetUrl: (path: string) => `http://localhost:4000/api/v1${path}`,
  apiRequest: jest.fn(),
}));

const task: Task = {
  id: '36a32d8b-3904-4204-881a-8d58bf7f4664',
  ownerId: 'd42be8bb-0589-4bad-a0e2-e3f35acf4110',
  title: 'Inspect the release asset',
  description: 'A private image inspection',
  type: 'FILE_INSPECTION',
  input: { schemaVersion: 1 },
  result: null,
  status: 'PENDING',
  errorMessage: null,
  version: 1,
  executionVersion: 1,
  attemptsMade: 0,
  maxAttempts: 3,
  scheduledAt: null,
  createdAt: '2026-08-02T12:00:00.000Z',
  updatedAt: '2026-08-02T12:00:00.000Z',
};

const envelope = <T,>(data: T, meta?: ApiEnvelope<T>['meta']): ApiEnvelope<T> => ({
  data,
  requestId: 'test-request',
  ...(meta ? { meta } : {}),
});

describe('Task workspace', () => {
  const apiRequestMock = jest.mocked(apiRequest);

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    apiRequestMock.mockImplementation((path) => {
      if (path === '/dashboard/summary') {
        return Promise.resolve(
          envelope({ counts: { total: 1, pending: 1, processing: 0, completed: 0, failed: 0 } }),
        );
      }
      if (path.startsWith('/tasks?')) {
        return Promise.resolve(
          envelope({ tasks: [task] }, { page: 1, pageSize: 10, totalItems: 11, totalPages: 2 }),
        );
      }
      if (path === `/tasks/${task.id}`) {
        return Promise.resolve(
          envelope({
            task,
            attachments: [
              {
                id: '02f262e1-0dd1-4c08-80f9-0ded05c0eff4',
                originalName: 'release.png',
                mimeType: 'image/png',
                sizeBytes: 1_024,
                sha256: null,
              },
            ],
          }),
        );
      }
      if (path === `/tasks/${task.id}/history`) {
        return Promise.resolve(envelope({ events: [] }));
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads paginated tasks and exposes authorized attachment downloads', async () => {
    const replaceState = jest.spyOn(window.history, 'replaceState');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <Provider store={makeStore()}>
        <QueryClientProvider client={queryClient}>
          <TaskApp
            user={{ id: task.ownerId, email: 'user@taskforge.local', role: 'USER' }}
            onLogout={() => undefined}
          />
        </QueryClientProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /inspect the release asset/i }));

    const download = await screen.findByRole('link', { name: /release\.png.*download/i });
    expect(download).toHaveAttribute(
      'href',
      'http://localhost:4000/api/v1/files/02f262e1-0dd1-4c08-80f9-0ded05c0eff4/download',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(replaceState).toHaveBeenCalledWith(null, '', '?page=2'));
  });

  it('offers file inspection inputs without treating browser MIME as trusted', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <Provider store={makeStore()}>
        <QueryClientProvider client={queryClient}>
          <TaskApp
            user={{ id: task.ownerId, email: 'user@taskforge.local', role: 'USER' }}
            onLogout={() => undefined}
          />
        </QueryClientProvider>
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new task/i }));
    fireEvent.click(screen.getByRole('radio', { name: /file inspection/i }));

    expect(screen.getByLabelText(/^Images or PDFs/i)).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp,application/pdf',
    );
    expect(screen.getByText(/file contents are verified by the API/i)).toBeVisible();
  });
});
