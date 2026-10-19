'use client';

import Shell from '@/components/Shell';
import ExploreOptions, { type Group } from '@/components/ExploreOptions';
import { getUser } from '@/lib/api';

const ADMIN_GROUPS: Group[] = [
  { title: 'Core', actions: [
    { label: 'Admission', href: '/students/admission' },
    { label: 'Manage Student', href: '/students/manage' },
    { label: 'Advance Search', href: '/students/search' },
    { label: 'TC Issue', href: '/students/tc' },
    { label: 'Student Pending Documents', href: '/students/documents' },
    { label: 'Send Usernames and Password', href: '/send-credentials?role=student' },
  ]},
  { title: 'Reports', actions: [
    { label: 'TC Issue Report', href: '/report/tc-issue' },
    { label: 'Admission And Registration Report', href: '/report/admission-registration' },
    { label: 'Student Strength Report', href: '/report/student-strength' },
    { label: 'Admission/Withdrawl Report', href: '/report/admission-withdrawal' },
    { label: 'Student Age Report', href: '/report/student-age' },
    { label: 'Student Activate/Deactivate Report', href: '/report/student-status' },
    { label: 'Pending Documents Report', href: '/report/student-pending-documents' },
    { label: 'Download Student Id Card', href: '/academic/id-cards?type=student' },
  ]},
  { title: 'Registrations & Prospectus', actions: [
    { label: 'Add Student Registrations', href: '/students/registrations' },
    { label: 'Student Registrations Report', href: '/report/student-registrations' },
    { label: 'Registrations & Prospectus Report', href: '/report/registrations-prospectus' },
    { label: 'Prospectus & Registration Summary', href: '/report/prospectus-registration-summary' },
    { label: 'Admission Summary', href: '/report/admission-summary' },
    { label: 'Student Prospectus Settings', href: '/students/settings' },
  ]},
  { title: 'Custom Fields & Lists', actions: [
    { label: 'Student Customized Fields Report', href: '/report/student-custom-fields' },
    { label: 'Manage Custom Fields', href: '/masters/student-custom-fields' },
    { label: 'Document Checklist', href: '/masters/student-documents' },
    { label: 'Houses', href: '/masters/student-houses' },
    { label: 'Student Categories', href: '/masters/student-categories' },
  ]},
];

// Teachers can look up students and run the staff reports, but admissions, TCs and settings are admin-only.
const TEACHER_GROUPS: Group[] = [
  { title: 'Core', actions: [
    { label: 'Manage Student', href: '/students/manage' },
    { label: 'Advance Search', href: '/students/search' },
    { label: 'Student Pending Documents', href: '/students/documents' },
  ]},
  { title: 'Reports', actions: [
    { label: 'Student Activate/Deactivate Report', href: '/report/student-status' },
    { label: 'Pending Documents Report', href: '/report/student-pending-documents' },
    { label: 'Student Customized Fields Report', href: '/report/student-custom-fields' },
  ]},
];

export default function StudentsPage() {
  const isAdmin = getUser<any>()?.role === 'admin';
  return (
    <Shell>
      <ExploreOptions
        icon="👤"
        title="Student"
        subtitle="Admissions, Records & Reports — Explore Options"
        breadcrumb={['Dashboard', 'Student']}
        columns={4}
        groups={isAdmin ? ADMIN_GROUPS : TEACHER_GROUPS}
      />
    </Shell>
  );
}
