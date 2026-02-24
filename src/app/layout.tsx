import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ServiceWorkerProvider } from '@/components/providers/ServiceWorkerProvider';
import { Toaster } from 'react-hot-toast';

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme_preference');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-primary antialiased">
        <ServiceWorkerProvider>
          <QueryProvider>{children}</QueryProvider>
        </ServiceWorkerProvider>
        {/* Dedicated portal root for image/video lightboxes.
            Rendered as the last child of body so Radix Dialog's hideOthers()
            (which only traverses body children present when the dialog opens)
            never marks it aria-hidden — lightbox buttons stay fully interactive
            even when a Settings or Profile dialog is open. */}
        <div id="lightbox-root" />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 5000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#10B981',
                secondary: '#fff',
              },
            },
            error: {
              duration: 4000,
              iconTheme: {
                primary: '#EF4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
