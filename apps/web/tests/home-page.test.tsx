import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePage from '../src/app/page';

describe('Home page', () => {
  it('presents the TaskForge product and current foundation status', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'TaskForge' })).toBeInTheDocument();
    expect(screen.getByText(/task automation platform with asynchronous execution/i)).toBeVisible();
    expect(screen.getByText(/core auth, tasks, queue, storage, and persistence/i)).toBeVisible();
  });
});
