'use client';

import Shell from '@/components/Shell';

export default function ComingSoon({ title, breadcrumb, description }: {
  title: string;
  breadcrumb?: string;
  description?: string;
}) {
  return (
    <Shell>
      {breadcrumb && <div className="text-xs text-gray-500 mb-1">{breadcrumb}</div>}
      <h2 className="text-xl font-bold text-brand-700 mb-4">{title}</h2>
      <div className="card p-8 text-center">
        <div className="text-5xl mb-3">🛠</div>
        <div className="font-semibold text-brand-700 mb-1">Module under construction</div>
        <p className="text-sm text-gray-600 max-w-md mx-auto">
          {description || 'This module is part of the EduSecure feature set and will be wired up to the backend soon. The navigation item is live so the menu mirrors the reference portal.'}
        </p>
      </div>
    </Shell>
  );
}
