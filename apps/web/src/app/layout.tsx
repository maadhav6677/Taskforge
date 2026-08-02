import '../styles/globals.css';
import type { ReactNode } from 'react';
import { AppProviders } from '../providers/AppProviders';

export const metadata = {
  title: 'TaskForge',
  description: 'Production-minded task automation platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
