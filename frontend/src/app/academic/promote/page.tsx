'use client';
import Shell from '@/components/Shell';
import PromotePanel from '../_components/PromotePanel';
import { PageTitle } from '../_components/common';

export default function Page() {
  return (
    <Shell>
      <PageTitle crumb="Settings › Promote Students" title="Promote Students" subtitle="Move students to the next class and session" />
      <PromotePanel />
    </Shell>
  );
}
