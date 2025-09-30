const DEFAULT_TITLE = "Cross Sport Tracker";

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (error) {
    payload = { body: event.data.text() };
  }

  const notification = typeof payload === "object" && payload !== null ? payload : {};
  const title = notification.title || DEFAULT_TITLE;
  const body = notification.body;
  const data = notification.notification || notification;

  const options = {
    body,
    data,
    tag: data?.id || undefined,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || data.payload?.url;

  if (!targetUrl) {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});
