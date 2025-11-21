import logging
import os

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

logger = logging.getLogger(__name__)


def _parse_sample_rate(env_var: str, default: float = 0.0) -> float:
    raw_value = os.getenv(env_var)
    if raw_value is None:
        return default

    try:
        value = float(raw_value)
    except ValueError:
        logger.warning(
            "%s is not a valid float (got %r); defaulting to %.2f",
            env_var,
            raw_value,
            default,
        )
        return default

    if value < 0:
        logger.warning("%s cannot be negative; defaulting to %.2f", env_var, default)
        return default

    return value


def _init_sentry() -> None:
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        logger.info("SENTRY_DSN not provided; skipping Sentry initialization.")
        return

    environment = (os.getenv("SENTRY_ENVIRONMENT") or "").strip() or None
    traces_sample_rate = _parse_sample_rate("SENTRY_TRACES_SAMPLE_RATE", default=0.0)
    profiles_sample_rate = _parse_sample_rate(
        "SENTRY_PROFILES_SAMPLE_RATE", default=0.0
    )

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FastApiIntegration()],
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
    )
    logger.info(
        "Initialized Sentry%s",
        f" (environment={environment})" if environment else "",
    )
