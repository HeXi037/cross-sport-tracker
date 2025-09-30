import os

API_PREFIX = os.getenv("API_PREFIX", "/api")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = (
    os.getenv("VAPID_SUBJECT")
    or os.getenv("NOTIFICATION_CONTACT_EMAIL")
    or "mailto:admin@example.com"
)
