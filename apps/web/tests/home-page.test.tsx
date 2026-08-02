import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthView } from '../src/components/AuthView';

describe('Home page', () => {
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
});
