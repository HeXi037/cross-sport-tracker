"""Utilities for persisting and delivering user notifications."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Iterable, Mapping

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
from ..db_errors import is_missing_table_error
from ..models import (
    Comment,
    Match,
    Notification,
    NotificationPreference,
    Player,
    PushSubscription,
    User,
)
from ..time_utils import coerce_utc

try:  # pragma: no cover - optional dependency in some environments
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover
    WebPushException = None  # type: ignore[assignment]
    webpush = None  # type: ignore[assignment]


LOGGER = logging.getLogger(__name__)


async def notify_profile_comment(
    session: AsyncSession,
    comment: Comment,
    author: User,
) -> None:
    """Create a notification when someone comments on a player's profile."""

    try:
        player = await session.get(Player, comment.player_id)
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "player"):
            LOGGER.debug("Notification tables unavailable; skipping profile comment notification")
            return
        raise

    if not player or not player.user_id or player.user_id == author.id:
        return

    preview = (comment.content or "").strip()
    if len(preview) > 140:
        preview = preview[:137].rstrip() + "…"

    body = f"{author.username} commented on your profile."
    payload = {
        "title": "New profile comment",
        "body": body,
        "url": f"/players/{player.id}/",
        "playerId": player.id,
        "playerName": player.name,
        "commentId": comment.id,
        "commentPreview": preview,
        "authorUsername": author.username,
    }

    await _create_notification(
        session,
        player.user_id,
        notification_type="profile_comment",
        payload=payload,
        preference_field="notify_on_profile_comments",
    )


async def notify_match_recorded(
    session: AsyncSession,
    match: Match,
    participants: Mapping[str, Iterable[str]],
    actor: User | None = None,
) -> None:
    """Create notifications for users involved in a recorded match."""

    participant_ids: set[str] = set()
    for ids in participants.values():
        participant_ids.update(pid for pid in ids if pid)

    if not participant_ids:
        return

    try:
        rows = await session.execute(
            select(Player).where(Player.id.in_(participant_ids))
        )
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "player"):
            LOGGER.debug("Notification tables unavailable; skipping match notification")
            return
        raise

    players = rows.scalars().all()
    if not players:
        return

    player_by_id = {p.id: p for p in players if p.id}
    users_to_players: dict[str, list[Player]] = {}
    for player in players:
        if not player.user_id:
            continue
        users_to_players.setdefault(player.user_id, []).append(player)

    if not users_to_players:
        return

    sport_label = _format_sport(match.sport_id)
    participant_payload = [
        {
            "side": side,
            "playerIds": list(ids),
            "playerNames": [player_by_id.get(pid).name for pid in ids if pid in player_by_id],
        }
        for side, ids in participants.items()
    ]

    for user_id, owned_players in users_to_players.items():
        if actor and actor.id == user_id:
            continue

        player_names = ", ".join(sorted({p.name for p in owned_players if p.name}))
        if not player_names:
            player_names = "your player"

        body = f"A new {sport_label} match involving {player_names} was recorded."
        payload = {
            "title": "Match recorded",
            "body": body,
            "url": f"/matches/{match.id}/",
            "matchId": match.id,
            "sportId": match.sport_id,
            "playerIds": [p.id for p in owned_players],
            "playerNames": [p.name for p in owned_players],
            "participants": participant_payload,
            "summary": match.details or {},
        }

        await _create_notification(
            session,
            user_id,
            notification_type="match_recorded",
            payload=payload,
            preference_field="notify_on_match_results",
        )


async def _create_notification(
    session: AsyncSession,
    user_id: str,
    *,
    notification_type: str,
    payload: dict,
    preference_field: str,
) -> None:
    prefs = await _get_or_create_preferences(session, user_id)
    if not prefs or not getattr(prefs, preference_field, False):
        return

    notification = Notification(
        id=uuid.uuid4().hex,
        user_id=user_id,
        type=notification_type,
        payload=payload,
    )
    session.add(notification)

    try:
        await session.commit()
        await session.refresh(notification)
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "notification"):
            LOGGER.debug("Notification tables unavailable; skipping notification persistence")
            return
        raise

    if prefs.push_enabled:
        subscriptions = await _list_push_subscriptions(session, user_id)
        if subscriptions:
            await _dispatch_push_notifications(session, subscriptions, notification)


async def _get_or_create_preferences(
    session: AsyncSession, user_id: str
) -> NotificationPreference | None:
    try:
        prefs = await session.get(NotificationPreference, user_id)
        if prefs:
            return prefs
        prefs = NotificationPreference(user_id=user_id)
        session.add(prefs)
        await session.commit()
        await session.refresh(prefs)
        return prefs
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "notification_preference"):
            LOGGER.debug("Notification preference table unavailable; skipping preference creation")
            return None
        raise


async def _list_push_subscriptions(
    session: AsyncSession, user_id: str
) -> list[PushSubscription]:
    try:
        rows = await session.execute(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "push_subscription"):
            LOGGER.debug("Push subscription table unavailable; skipping push delivery")
            return []
        raise
    return list(rows.scalars())


async def register_push_subscription(
    session: AsyncSession,
    user_id: str,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    content_encoding: str | None = None,
) -> PushSubscription | None:
    if not endpoint:
        return None

    encoding = content_encoding or "aes128gcm"

    try:
        existing = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.endpoint == endpoint)
            )
        ).scalar_one_or_none()

        if existing:
            existing.user_id = user_id
            existing.p256dh = p256dh
            existing.auth = auth
            existing.content_encoding = encoding
            await session.commit()
            await session.refresh(existing)
            return existing

        subscription = PushSubscription(
            id=uuid.uuid4().hex,
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            content_encoding=encoding,
        )
        session.add(subscription)
        await session.commit()
        await session.refresh(subscription)
        return subscription
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "push_subscription"):
            LOGGER.debug("Push subscription table unavailable; skipping registration")
            return None
        raise


async def delete_push_subscriptions(session: AsyncSession, user_id: str) -> None:
    try:
        await session.execute(
            delete(PushSubscription).where(PushSubscription.user_id == user_id)
        )
        await session.commit()
    except SQLAlchemyError as exc:  # pragma: no cover - handled gracefully
        await _safe_rollback(session)
        if is_missing_table_error(exc, "push_subscription"):
            LOGGER.debug("Push subscription table unavailable; skipping delete")
            return
        raise


def _format_sport(sport_id: str | None) -> str:
    if not sport_id:
        return "sport"
    parts = [part for part in sport_id.replace("_", " ").split() if part]
    return " ".join(word.capitalize() for word in parts) or sport_id


async def _dispatch_push_notifications(
    session: AsyncSession,
    subscriptions: list[PushSubscription],
    notification: Notification,
) -> None:
    if not _push_available():
        return

    payload = {
        "id": notification.id,
        "type": notification.type,
        "createdAt": coerce_utc(notification.created_at).isoformat(),
        "readAt": coerce_utc(notification.read_at).isoformat()
        if notification.read_at
        else None,
        "payload": notification.payload,
    }

    invalid_ids: list[str] = []
    for subscription in subscriptions:
        try:
            await _send_push(subscription, payload)
        except _InvalidSubscriptionError:
            invalid_ids.append(subscription.id)
        except Exception:  # pragma: no cover - unexpected push failure
            LOGGER.exception("Failed to send push notification")

    if invalid_ids:
        try:
            await session.execute(
                delete(PushSubscription).where(PushSubscription.id.in_(invalid_ids))
            )
            await session.commit()
        except SQLAlchemyError as exc:  # pragma: no cover
            await _safe_rollback(session)
            if is_missing_table_error(exc, "push_subscription"):
                LOGGER.debug("Push subscription table unavailable while pruning invalid entries")
                return
            raise


def _push_available() -> bool:
    return bool(webpush and VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY)


class _InvalidSubscriptionError(Exception):
    """Raised when a push subscription is no longer valid."""


async def _send_push(subscription: PushSubscription, payload: dict) -> None:
    if not _push_available():  # pragma: no cover - guarded earlier
        return

    data = {
        "title": payload.get("payload", {}).get("title")
        if isinstance(payload.get("payload"), dict)
        else None,
        "body": payload.get("payload", {}).get("body")
        if isinstance(payload.get("payload"), dict)
        else None,
        "url": payload.get("payload", {}).get("url")
        if isinstance(payload.get("payload"), dict)
        else None,
        "notification": payload,
    }

    async def _deliver() -> None:
        assert webpush is not None  # for mypy
        assert VAPID_PRIVATE_KEY is not None
        subscription_info = {
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
        }
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info=subscription_info,
                data=json.dumps(data),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_SUBJECT},
                vapid_public_key=VAPID_PUBLIC_KEY,
                content_encoding=subscription.content_encoding,
            )
        except WebPushException as exc:  # pragma: no cover - depends on external service
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in {404, 410}:
                raise _InvalidSubscriptionError from exc
            LOGGER.warning("Web push delivery failed: %s", exc)

    await _deliver()


async def _safe_rollback(session: AsyncSession) -> None:
    try:
        if session.in_transaction():
            await session.rollback()
    except SQLAlchemyError:  # pragma: no cover - best effort
        pass
