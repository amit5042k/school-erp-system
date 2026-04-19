'use client';

import Shell from '@/components/Shell';
import ExploreOptions from '@/components/ExploreOptions';

export default function ExamsPage() {
  return (
    <Shell>
      <ExploreOptions
        icon="🏆"
        title="Examinations"
        subtitle="Examination & Reporting — Explore Options"
        breadcrumb={['Dashboard', 'Examinations']}
        columns={3}
        groups={[
          { title: 'Setup', actions: [
            { label: 'Scholastic Grades' },
            { label: 'Subjects' },
            { label: 'Class Subjects' },
            { label: 'Manage Pre-Primary Subjects' },
            { label: 'Manage Remarks For Report Card' },
            { label: 'Assign Subject Teachers' },
            { label: 'Student Subject Mapping' },
            { label: 'Student Subject Mapping Report' },
          ]},
          { title: 'Reports & Cards', actions: [
            { label: 'Generate Id Card' },
            { label: 'Report Card' },
            { label: 'Assessment Report' },
            { label: 'Roll No Allocation' },
            { label: 'Digital Library' },
            { label: 'Block Exam Results' },
            { label: 'Delete Marks Entry' },
          ]},
          { title: 'Operations', actions: [
            { label: 'Promote Students' },
            { label: 'Marks Entry', href: '/marks' },
            { label: 'Weekly Planner' },
            { label: 'Weekly Planner Report' },
            { label: 'Publish Result' },
            { label: 'Publish Marks' },
            { label: 'Update Attendance & Result Details' },
            { label: 'Update Health Status' },
            { label: 'Update Student Remarks' },
            { label: 'Download Award List' },
            { label: 'Examination Settings' },
          ]},
        ]}
      />
    </Shell>
  );
}
