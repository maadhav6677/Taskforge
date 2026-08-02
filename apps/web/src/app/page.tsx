'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '../lib/api';
import type { User } from '../lib/types';
import { AuthView } from '../components/AuthView';
import { TaskApp } from '../components/TaskApp';
import { AdminApp } from '../components/AdminApp';

export default function HomePage() {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => apiRequest<{ user: User }>('/auth/me'),
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 1,
  });
  const setUser = (user: User) =>
    queryClient.setQueryData(['session'], { data: { user }, requestId: '' });
  const logout = async () => {
    await apiRequest('/auth/logout', { method: 'POST' }, false);
    queryClient.clear();
  };
  if (session.isLoading)
    return (
      <main className="loading-screen">
        <span className="brand-mark">TF</span>
        <p>Opening your workspace…</p>
      </main>
    );
  const user = session.data?.data.user;
  if (!user) return <AuthView onAuthenticated={setUser} />;
  return user.role === 'ADMIN' ? (
    <AdminApp user={user} onLogout={logout} />
  ) : (
    <TaskApp user={user} onLogout={logout} />
  );
}
