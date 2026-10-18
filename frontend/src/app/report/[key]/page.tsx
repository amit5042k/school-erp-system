'use client';
import Shell from '@/components/Shell';
import ReportView from '@/components/ReportView';

export default function ReportPage({ params, searchParams }: { params: { key: string }; searchParams: Record<string, string> }) {
  return <Shell><ReportView reportKey={params.key} initial={searchParams} /></Shell>;
}
