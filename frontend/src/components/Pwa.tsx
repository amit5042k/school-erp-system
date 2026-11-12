'use client';

// The website as an installable app (PWA): registers the service worker, offers "Install app", and turns on Web Push
// notifications for the signed-in user. Works on Android, desktop browsers, and iPhone (iOS 16.4+, once the site has
// been added to the Home Screen).
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { t } from '@/lib/i18n';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredInstall: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(f => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as InstallEvent; changed(); });
  window.addEventListener('appinstalled', () => { deferredInstall = null; changed(); });
}

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js');
}

/** Subscribe this browser to the signed-in user's notifications (asks permission if needed). */
export async function enableNotifications(): Promise<'on' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (perm !== 'granted') return 'denied';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api<{ publicKey: string }>('/push/public-key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
  return 'on';
}

/** On sign-out: this browser stops receiving that user's notifications. */
export async function disableNotifications() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (getToken()) await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Mounted once by Shell: keeps the service worker registered and this browser's subscription linked to the user. */
export function PwaBridge() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    registration().catch(() => {});
    if (pushSupported() && Notification.permission === 'granted' && getToken()) enableNotifications().catch(() => {});
  }, []);
  return null;
}

/** "Install the app" and "Turn on notifications", shown on Home and Notifications until both are done. */
export function AppSetup() {
  const [, force] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>('unsupported');
  useEffect(() => {
    const f = () => force(n => n + 1);
    listeners.add(f);
    setPerm(pushSupported() ? Notification.permission : 'unsupported');
    return () => { listeners.delete(f); };
  }, []);

  const installed = isStandalone();
  const canInstall = !installed && !!deferredInstall;
  const iosHint = !installed && isIos();
  const askPush = perm === 'default';
  if (!canInstall && !iosHint && !askPush && perm !== 'denied') return null;

  async function install() {
    if (!deferredInstall) return;
    await deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => null);
    deferredInstall = null; changed();
  }
  async function turnOn() {
    const r = await enableNotifications().catch(() => 'unsupported' as const);
    setPerm(pushSupported() ? Notification.permission : 'unsupported');
    setMsg(r === 'on' ? t('Notifications are on for this device.') : r === 'denied'
      ? t('Notifications are blocked. Allow them for this site in your browser settings.') : t('This browser cannot show notifications.'));
  }

  return (
    <div className="card p-3 mb-4 text-sm bg-brand-50 border-brand-100">
      <div className="font-semibold text-brand-700 mb-1">{t('Use School ERP like an app')}</div>
      {canInstall && <div className="flex items-center justify-between gap-3 py-1">
        <span>{t('Add it to your home screen: it opens full screen, without the browser bar.')}</span>
        <button className="btn btn-primary text-xs whitespace-nowrap" onClick={install}>{t('Install app')}</button></div>}
      {iosHint && <div className="py-1">{t('On iPhone: tap the Share button in Safari, then "Add to Home Screen". Open it from the new icon to get notifications.')}</div>}
      {askPush && <div className="flex items-center justify-between gap-3 py-1">
        <span>{t('Get notified about attendance, fees, results, homework and notices.')}</span>
        <button className="btn btn-accent text-xs whitespace-nowrap" onClick={turnOn}>{t('Turn on notifications')}</button></div>}
      {perm === 'denied' && !msg && <div className="py-1 text-gray-600">{t('Notifications are blocked. Allow them for this site in your browser settings.')}</div>}
      {msg && <div className="py-1 text-gray-700">{msg}</div>}
    </div>
  );
}
