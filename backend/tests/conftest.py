import os

# Provide a JWT secret of at least 32 characters for tests
# Set it unconditionally to avoid inherited, insecure values from the environment
os.environ["JWT_SECRET"] = "x" * 32
