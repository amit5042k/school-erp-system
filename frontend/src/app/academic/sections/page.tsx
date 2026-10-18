'use client';
import Shell from '@/components/Shell';
import SectionsPanel from '../_components/SectionsPanel';
import { PageTitle } from '../_components/common';

export default function Page() {
  return (
    <Shell>
      <PageTitle crumb="Settings › Manage Section" title="Manage Section" subtitle="Sections, strength and class teachers" />
      <SectionsPanel />
    </Shell>
  );
}
