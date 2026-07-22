// PWA registration + Web Push subscription.
// INV-13: notification permission MUST be requested from a user gesture (button click).
//   registerServiceWorker() is safe to call on page load.
//   enableNotifications()   must be called from a click handler.

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

// Chrome on iOS uses "CriOS" in the user agent (not "Chrome").
export function isIOSChrome(): boolean {
  return isIOS() && /CriOS/.test(navigator.userAgent);
}

// True when the app is running as an installed PWA (added to Home Screen).
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

// Must be called from a user gesture (e.g. button onClick) so that Chrome and
// Safari show the real permission modal instead of silently ignoring the request.
// Returns the resulting NotificationPermission, or null if unsupported.
export async function setBadge(count: number): Promise<void> {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  try {
    if (count > 0) await (navigator as Navigator & { setAppBadge(n: number): Promise<void> }).setAppBadge(count);
    else if ("clearAppBadge" in navigator) await (navigator as Navigator & { clearAppBadge(): Promise<void> }).clearAppBadge();
  } catch { /* non-fatal */ }
}

export async function enableNotifications(): Promise<NotificationPermission | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;

  const registration = await registerServiceWorker();

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted" || !registration) return permission;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey || !("PushManager" in window)) return permission;

  try {
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }));

    await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription }),
    });
  } catch {
    // Subscription failures are non-fatal for the UI.
  }

  return permission;
}
