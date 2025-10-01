import os

def _canon_prefix(val):
    """
    Normalize API prefix to always be exactly like '/api':
      - defaults to '/api' when unset/empty
      - ensures a single leading slash
      - removes any trailing slash (except for root)
    """
    val = (val or "/api").strip()
    if not val.startswith("/"):
        val = "/" + val
    if len(val) > 1 and val.endswith("/"):
        val = val[:-1]
    return val

API_PREFIX = _canon_prefix(os.getenv("API_PREFIX"))

VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_SUBJECT = (
    os.getenv("VAPID_SUBJECT")
    or os.getenv("NOTIFICATION_CONTACT_EMAIL")
    or "mailto:admin@example.com"
)
