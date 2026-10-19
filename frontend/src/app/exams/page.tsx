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
            { label: 'Manage Exams', href: '/exams/manage' },
            { label: 'Scholastic Grades', href: '/exams/grades' },
            { label: 'Subjects', href: '/masters/subjects' },
            { label: 'Class Subjects', href: '/exams/class-subjects' },
            { label: 'Manage Pre-Primary Subjects', href: '/masters/pre-primary-subjects' },
            { label: 'Manage Remarks For Report Card', href: '/masters/report-card-remarks' },
            { label: 'Assign Subject Teachers', href: '/exams/subject-teachers' },
            { label: 'Student Subject Mapping', href: '/exams/subject-mapping' },
            { label: 'Student Subject Mapping Report', href: '/report/exam-subject-mapping' },
          ]},
          { title: 'Reports & Cards', actions: [
            { label: 'Generate Id Card', href: '/academic/id-cards?type=student' },
            { label: 'Report Card', href: '/exams/report-card' },
            { label: 'Assessment Report', href: '/report/exam-assessment' },
            { label: 'Roll No Allocation', href: '/academic/roll-numbers' },
            { label: 'Digital Library', href: '/documents' },
            { label: 'Block Exam Results', href: '/exams/block-results' },
            { label: 'Delete Marks Entry', href: '/exams/delete-marks' },
          ]},
          { title: 'Operations', actions: [
            { label: 'Promote Students', href: '/academic/promote' },
            { label: 'Marks Entry', href: '/marks' },
            { label: 'Weekly Planner', href: '/exams/weekly-planner' },
            { label: 'Weekly Planner Report', href: '/report/exam-weekly-planner' },
            { label: 'Publish Result', href: '/exams/publish' },
            { label: 'Publish Marks', href: '/exams/publish' },
            { label: 'Update Attendance & Result Details', href: '/exams/term-details' },
            { label: 'Update Health Status', href: '/exams/health' },
            { label: 'Update Student Remarks', href: '/exams/remarks' },
            { label: 'Download Award List', href: '/exams/award-list' },
            { label: 'Examination Settings', href: '/exams/settings' },
          ]},
        ]}
      />
    </Shell>
  );
}
