import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { AuthView } from '../src/components/AuthView';
import HomePage from '../src/app/page';
import { apiRequest } from '../src/lib/api';
import { makeStore } from '../src/store/store';

jest.mock('socket.io-client', () => ({
  io: () => ({ on: jest.fn(), disconnect: jest.fn() }),
}));

jest.mock('../src/lib/api', () => ({
  ApiError: class ApiError extends Error {
    public constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  apiAssetUrl: (path: string) => `http://localhost:4000/api/v1${path}`,
  apiRequest: jest.fn(),
}));

const renderHomePage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <Provider store={makeStore()}>
      <QueryClientProvider client={queryClient}>
        <HomePage />
      </QueryClientProvider>
    </Provider>,
  );
};

describe('Home page', () => {
  const apiRequestMock = jest.mocked(apiRequest);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('presents the product value and accessible login form', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthView onAuthenticated={() => undefined} />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /turn queued work into a clear/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /sign in to taskforge/i })).toBeVisible();
    expect(screen.getByLabelText('Email')).toBeVisible();
    expect(screen.getByLabelText('Password')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('clears seeded credentials when switching to registration', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthView onAuthenticated={() => undefined} />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText('Email')).toHaveValue('user@taskforge.local');

    fireEvent.click(screen.getByRole('button', { name: /need an account\? register/i }));

    expect(screen.getByRole('heading', { level: 2, name: /start building tasks/i })).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('returns to the login form after logout clears the server session', async () => {
    apiRequestMock.mockImplementation((path) => {
      if (path === '/auth/me') {
        return Promise.resolve({
          data: {
            user: {
              id: 'd42be8bb-0589-4bad-a0e2-e3f35acf4110',
              email: 'user@taskforge.local',
              role: 'USER',
            },
          },
          requestId: 'session',
        });
      }
      if (path === '/dashboard/summary') {
        return Promise.resolve({
          data: { counts: { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 } },
          requestId: 'summary',
        });
      }
      if (path.startsWith('/tasks?')) {
        return Promise.resolve({
          data: { tasks: [] },
          meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
          requestId: 'tasks',
        });
      }
      if (path === '/auth/logout') {
        return Promise.resolve({ data: undefined, requestId: 'logout' });
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    renderHomePage();

    fireEvent.click(await screen.findByRole('button', { name: /log out/i }));

    expect(apiRequestMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' }, false);
    expect(
      await screen.findByRole('heading', { level: 2, name: /sign in to taskforge/i }),
    ).toBeVisible();
  });
});
