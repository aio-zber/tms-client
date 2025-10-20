import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'GCG Team Messaging App',
  description: 'A Viber-inspired team messaging application integrated with Team Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-primary antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
