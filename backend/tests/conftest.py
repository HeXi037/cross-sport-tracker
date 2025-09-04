import os

# Provide a default JWT secret of at least 32 characters for tests
os.environ.setdefault("JWT_SECRET", "x" * 32)
