'use client';

/** Explains what to put in backend/.env when SMS or email isn't set up yet. */
export default function ConfigNotice({ status, channel }: { status: { sms: boolean; email: boolean } | null; channel?: 'sms' | 'email' }) {
  if (!status) return null;
  const missing = (channel ? [channel] : (['sms', 'email'] as const)).filter(c => !status[c]);
  if (!missing.length) return null;
  return (
    <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded px-3 py-2 mb-4">
      <div className="font-semibold">{missing.map(m => m.toUpperCase()).join(' and ')} not configured on the server</div>
      <div className="mt-1">
        Messages can still be composed; they are recorded in the Sent Box as <b>not configured</b> and can be resent once it is set up.
        Ask your administrator to add these to <code>backend/.env</code> and restart the backend:
      </div>
      <pre className="mt-2 text-xs bg-white/70 border rounded p-2 overflow-x-auto whitespace-pre">
{missing.includes('sms') ? `# SMS: your provider's HTTP API, with {to} and {message} placeholders
SMS_API_URL=https://your-sms-provider/send?apikey=KEY&sender=SCHOOL&numbers={to}&message={message}
` : ''}{missing.includes('email') ? `# Email (e.g. Gmail / Google Workspace app password, or your host's SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=office@yourschool.org
SMTP_PASS=app-password
SMTP_FROM="School Office <office@yourschool.org>"` : ''}
      </pre>
    </div>
  );
}
