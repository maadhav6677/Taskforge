import { apiRequest } from '../src/lib/api';

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('apiRequest', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    document.cookie = 'tf_csrf=csrf-token';
  });

  afterEach(() => {
    document.cookie = 'tf_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('refreshes and replays current-session restore after an expired access cookie', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'AUTH_INVALID' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { refreshed: true }, requestId: 'refresh' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            user: {
              id: 'a3c78a05-12a1-4f58-8eb5-90230a197bda',
              email: 'user@taskforge.local',
              role: 'USER',
            },
          },
          requestId: 'session',
        }),
      );

    await expect(apiRequest('/auth/me')).resolves.toMatchObject({
      data: { user: { email: 'user@taskforge.local' } },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:4000/api/v1/auth/me');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:4000/api/v1/auth/refresh');
    expect(fetchMock.mock.calls[2][0]).toBe('http://localhost:4000/api/v1/auth/me');
  });

  it('sends decoded CSRF cookie values on state-changing requests', async () => {
    document.cookie = `tf_csrf=${encodeURIComponent('csrf/token=value')}`;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        data: {
          user: {
            id: 'a3c78a05-12a1-4f58-8eb5-90230a197bda',
            email: 'new@taskforge.local',
            role: 'USER',
          },
        },
        requestId: 'register',
      }),
    );

    await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@taskforge.local', password: 'TaskForge123!' }),
    });

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-csrf-token')).toBe('csrf/token=value');
  });
});
