import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'MGN Urban Estate School ERP | Login',
  description: 'School ERP System for MGN Urban Estate — powered by EduSecure-style platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
