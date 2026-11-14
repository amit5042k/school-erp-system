'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';

// Only active inside the Android and iOS apps (Capacitor injects window.Capacitor); a no-op on the website.
type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins: Record<string, any> };
const cap = (): Cap | null => {
  if (typeof window === 'undefined') return null;
  const c = (window as any).Capacitor as Cap | undefined;
  return c?.isNativePlatform?.() ? c : null;
};

const PUSH_TOKEN_KEY = 'erp_push_token';
// The app adds "push=1" to its user agent only when Firebase is configured; registering
// without Firebase crashes the app, so this check matters.
const pushEnabled = () => typeof navigator !== 'undefined' && /SchoolERP-App\/\S+ push=1/.test(navigator.userAgent);
const appVersion = () => (typeof navigator !== 'undefined' ? navigator.userAgent.match(/SchoolERP-App\/(\S+)/)?.[1] : undefined);

/** Call before signing out so this phone stops receiving the previous user's notifications. */
export async function unregisterPush() {
  if (!cap()) return;
  try {
    const token = localStorage.getItem(PUSH_TOKEN_KEY);
    if (token && getToken()) await api('/push/unregister', { method: 'POST', body: JSON.stringify({ token }) });
  } catch { /* signing out must never fail because of this */ }
  localStorage.removeItem(PUSH_TOKEN_KEY);
}

/** True when running inside the Android or iOS app. */
export const isNativeApp = () => !!cap();

// The app web views can't print or save blob downloads. Android's MainActivity exposes window.SchoolERPNative;
// the iOS app has the SchoolERPNative plugin (system print sheet, and the share sheet to save or send a file).
type NativeFiles = { print: (name: string) => void; saveFile: (name: string, base64: string, mime: string) => void };
const nativeFiles = (): NativeFiles | null => {
  if (typeof window === 'undefined') return null;
  if ((window as any).SchoolERPNative) return (window as any).SchoolERPNative;
  const ios = cap()?.Plugins?.SchoolERPNative;
  return ios ? {
    print: (name) => { ios.printPage({ name }).catch(() => {}); },
    saveFile: (name, base64, mime) => { ios.saveFile({ name, base64, mime }).catch(() => {}); },
  } : null;
};

async function saveNatively(nf: NativeFiles, href: string, name: string) {
  const blob = await (await fetch(href)).blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  nf.saveFile(name || 'download', base64, blob.type || 'application/octet-stream');
}

/** Route window.print() and blob/data downloads to the app; returns an undo function. */
function patchFilesAndPrint(): () => void {
  const nf = nativeFiles();
  if (!nf) return () => {};
  const origPrint = window.print;
  window.print = () => nf.print(document.title);
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.hasAttribute('download') && /^(blob|data):/.test(this.href)) {
      saveNatively(nf, this.href, this.download).catch(() => origClick.call(this));
      return;
    }
    return origClick.call(this);
  };
  return () => { window.print = origPrint; HTMLAnchorElement.prototype.click = origClick; };
}

export default function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    const c = cap();
    if (!c) return;
    const { App, Browser, PushNotifications } = c.Plugins;
    const cleanups: (() => void)[] = [patchFilesAndPrint()];
    const listen = async (plugin: any, event: string, fn: (e: any) => void) => {
      if (!plugin?.addListener) return;
      const h = await plugin.addListener(event, fn);
      cleanups.push(() => h?.remove?.());
    };

    // Hardware back: go back through pages; leave the app from the home screen.
    listen(App, 'backButton', ({ canGoBack }: { canGoBack: boolean }) => {
      if (!canGoBack || window.location.pathname === '/home') App.exitApp();
      else window.history.back();
    });

    // Links to other sites (Meet/Zoom, uploaded files on the API domain, PDFs) open in the system browser,
    // because the in-app web view can't show downloads or leave the ERP.
    const openOutside = (href: string) => Browser?.open ? Browser.open({ url: href }) : window.location.assign(href);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.href.startsWith('blob:') || a.href.startsWith('javascript:')) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      const external = url.origin !== window.location.origin;
      const isFile = /\/api\/files\//.test(url.pathname) || a.hasAttribute('download');
      if (external || isFile || a.target === '_blank') {
        e.preventDefault();
        openOutside(url.href);
      }
    };
    document.addEventListener('click', onClick, true);
    cleanups.push(() => document.removeEventListener('click', onClick, true));
    const originalOpen = window.open;
    window.open = ((u?: string | URL) => { if (u) openOutside(new URL(String(u), window.location.href).href); return null; }) as typeof window.open;
    cleanups.push(() => { window.open = originalOpen; });

    // Push notifications.
    if (PushNotifications && pushEnabled() && getToken()) {
      (async () => {
        try {
          if (c.getPlatform?.() === 'android') await PushNotifications.createChannel?.({
            id: 'school_erp_default', name: 'School notifications', description: 'Attendance, fees, results, notices and leave updates',
            importance: 4, visibility: 1, vibration: true,
          });
          let perm = await PushNotifications.checkPermissions();
          if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
          if (perm.receive !== 'granted') return;
          await listen(PushNotifications, 'registration', async ({ value }: { value: string }) => {
            localStorage.setItem(PUSH_TOKEN_KEY, value);
            try { await api('/push/register', { method: 'POST', body: JSON.stringify({ token: value, platform: c.getPlatform?.() === 'ios' ? 'ios' : 'android', app_version: appVersion() }) }); }
            catch { /* retried on next app start */ }
          });
          await listen(PushNotifications, 'registrationError', (err: any) => console.warn('Push registration failed', err));
          await listen(PushNotifications, 'pushNotificationActionPerformed', ({ notification }: any) => {
            const data = notification?.data || {};
            if (data.inbox_id) api(`/push/inbox/${data.inbox_id}/read`, { method: 'POST' }).catch(() => {});
            const link = typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/notifications';
            router.push(link);
          });
          await PushNotifications.register();
        } catch (err) { console.warn('Push setup failed', err); }
      })();
    }

    return () => cleanups.forEach(fn => fn());
  }, [router]);

  return null;
}
