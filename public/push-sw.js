/* Push del sistema operativo (Web Push). Lo importa el service worker de la PWA (vite.config.ts → workbox.importScripts).
 * El servidor envía {title, body, url, tag, id}; al hacer clic se abre (o enfoca) la app en la ficha correspondiente. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Banco de Talentos', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Banco de Talentos';
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: data.body || '', tag: data.tag || data.id, renotify: !!data.tag, icon: '/pwa-192.png', badge: '/pwa-badge.png',
      data: { url: data.url || '/', id: data.id },
    });
    // la app abierta actualiza su campana sin esperar al siguiente sondeo
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((c) => c.postMessage({ type: 'bdt:notification', id: data.id }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = clients.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) {
      await same.focus();
      same.postMessage({ type: 'bdt:navigate', url, id: event.notification.data && event.notification.data.id });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
