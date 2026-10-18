'use client';
import Shell from '@/components/Shell';
import SwapPanel from '../_components/SwapPanel';
import { PageTitle } from '../_components/common';

export default function Page() {
  return (
    <Shell>
      <PageTitle crumb="Settings › Swap Section" title="Swap Section" subtitle="Move students between sections of the same class" />
      <SwapPanel />
    </Shell>
  );
}
