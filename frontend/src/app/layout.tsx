import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import LanguageGate from '@/components/LanguageGate';
import { PwaBridge } from '@/components/Pwa';

export const metadata: Metadata = {
  title: 'School Management System',
  description: 'School ERP — Next.js + Node.js',
  manifest: '/manifest.webmanifest',
  icons: { apple: '/icons/apple-touch-icon.png' },
  // iPhone: opens full screen from the Home Screen icon, with the school's name under it.
  appleWebApp: { capable: true, title: 'School ERP', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#133b7a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><PwaBridge /><LanguageGate>{children}</LanguageGate></body>
    </html>
  );
}
