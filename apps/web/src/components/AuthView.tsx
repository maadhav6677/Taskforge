'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../lib/api';
import type { User } from '../lib/types';

interface Credentials {
  email: string;
  password: string;
}

const loginDefaults: Credentials = {
  email: 'user@taskforge.local',
  password: 'TaskForge123!',
};

const registerDefaults: Credentials = {
  email: '',
  password: '',
};

export function AuthView({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [passwordRulesOpen, setPasswordRulesOpen] = useState(false);
  const { register, handleSubmit, formState, reset, watch } = useForm<Credentials>({
    defaultValues: loginDefaults,
  });
  const passwordValue = watch('password');
  const passwordLengthValid = passwordValue.length >= 12 && passwordValue.length <= 128;
  const showPasswordRules =
    mode === 'register' && (passwordRulesOpen || (formState.submitCount > 0 && !passwordLengthValid));
  const passwordField = register('password', { required: true, minLength: 12, maxLength: 128 });
  const mutation = useMutation({
    mutationFn: (values: Credentials) =>
      apiRequest<{ user: User }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: (result) => onAuthenticated(result.data.user),
  });
  const switchMode = () => {
    const nextMode = mode === 'login' ? 'register' : 'login';
    setMode(nextMode);
    reset(nextMode === 'login' ? loginDefaults : registerDefaults);
    setPasswordRulesOpen(nextMode === 'register');
    mutation.reset();
  };

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="welcome-title">
        <div className="brand-mark" aria-hidden="true">
          TF
        </div>
        <p className="eyebrow">Asynchronous work, made visible</p>
        <h1 id="welcome-title">Turn queued work into a clear, trustworthy timeline.</h1>
        <p>
          TaskForge separates durable task state from execution, so every transition stays
          inspectable—even through retries and infrastructure interruptions.
        </p>
        <div className="trust-row">
          <span>PostgreSQL truth</span>
          <span>BullMQ execution</span>
          <span>Private files</span>
        </div>
      </section>
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create workspace'}</p>
        <h2 id="auth-title">
          {mode === 'login' ? 'Sign in to TaskForge' : 'Start building tasks'}
        </h2>
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
          <label>
            Email
            <input type="email" autoComplete="email" {...register('email', { required: true })} />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              aria-describedby={mode === 'register' ? 'password-rules' : undefined}
              aria-invalid={mode === 'register' && formState.errors.password ? true : undefined}
              {...passwordField}
              onBlur={(event) => {
                void passwordField.onBlur(event);
                setPasswordRulesOpen(false);
              }}
              onFocus={() => {
                if (mode === 'register') setPasswordRulesOpen(true);
              }}
            />
          </label>
          {showPasswordRules ? (
            <div className="password-rules-popover" id="password-rules" role="status">
              <strong>Password rules</strong>
              <ul>
                <li className={passwordLengthValid ? 'met' : undefined}>
                  Use 12 to 128 characters.
                </li>
                <li>Email must be new and valid.</li>
              </ul>
            </div>
          ) : null}
          {mutation.error ? (
            <p className="form-error" role="alert">
              {mutation.error.message}
            </p>
          ) : null}
          <button
            className="primary-button"
            disabled={mutation.isPending || formState.isSubmitting}
          >
            {mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button className="text-button" onClick={switchMode}>
          {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
        </button>
        <p className="demo-hint">Development seed: user@taskforge.local / TaskForge123!</p>
      </section>
    </main>
  );
}
