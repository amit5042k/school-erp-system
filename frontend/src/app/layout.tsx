import type { Metadata } from 'next';
import '../styles/globals.css';
import LanguageGate from '@/components/LanguageGate';

export const metadata: Metadata = {
  title: 'School Management System',
  description: 'School ERP — Next.js + Node.js',
  manifest: '/manifest.webmanifest',
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><LanguageGate>{children}</LanguageGate></body>
    </html>
  );
}
