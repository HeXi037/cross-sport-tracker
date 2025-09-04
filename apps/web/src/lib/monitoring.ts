import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  tracesSampleRate: 1.0,
  beforeSend(event) {
    if (event.user) {
      delete event.user.ip_address;
      delete (event.user as Record<string, unknown>).email;
    }
    return event;
  },
});

export default Sentry;
