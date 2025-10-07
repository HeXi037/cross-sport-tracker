"""Notification preference and delivery endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..db_errors import is_missing_table_error
from ..exceptions import http_problem
from ..models import Notification, NotificationPreference, PushSubscription, User
from ..schemas import (
    NotificationListOut,
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    PushSubscriptionCreate,
    PushSubscriptionOut,
)
from ..services.notifications import (
    delete_push_subscriptions,
    register_push_subscription,
)
from ..time_utils import coerce_utc
from .auth import get_current_user


router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)


@router.get("/preferences", response_model=NotificationPreferenceOut)
async def get_notification_preferences(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    try:
        prefs = await session.get(NotificationPreference, user.id)
        if not prefs:
            prefs = NotificationPreference(user_id=user.id)
            session.add(prefs)
            await session.commit()
            await session.refresh(prefs)

        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id == user.id)
            )
        ).scalars().all()
    except SQLAlchemyError as exc:
        await _rollback_if_active(session)
        if is_missing_table_error(exc):
            return NotificationPreferenceOut(
                notifyOnProfileComments=False,
                notifyOnMatchResults=False,
                pushEnabled=False,
                subscriptions=[],
            )
        raise

    return NotificationPreferenceOut(
        notifyOnProfileComments=bool(prefs.notify_on_profile_comments),
        notifyOnMatchResults=bool(prefs.notify_on_match_results),
        pushEnabled=bool(prefs.push_enabled),
        subscriptions=[
            PushSubscriptionOut(
                id=s.id,
                endpoint=s.endpoint,
                createdAt=coerce_utc(s.created_at),
            )
            for s in subs
        ],
    )


@router.put("/preferences", response_model=NotificationPreferenceOut)
async def update_notification_preferences(
    body: NotificationPreferenceUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not body.model_fields_set:
        raise http_problem(
            status_code=400,
            detail="no fields provided",
            code="notification_preferences_empty",
        )

    try:
        prefs = await session.get(NotificationPreference, user.id)
        if not prefs:
            prefs = NotificationPreference(user_id=user.id)
            session.add(prefs)

        if body.notify_on_profile_comments is not None:
            prefs.notify_on_profile_comments = body.notify_on_profile_comments
        if body.notify_on_match_results is not None:
            prefs.notify_on_match_results = body.notify_on_match_results
        if body.push_enabled is not None:
            prefs.push_enabled = body.push_enabled

        await session.commit()
        await session.refresh(prefs)

        if not prefs.push_enabled:
            await delete_push_subscriptions(session, user.id)

        subs = (
            await session.execute(
                select(PushSubscription).where(PushSubscription.user_id == user.id)
            )
        ).scalars().all()
    except SQLAlchemyError as exc:
        await _rollback_if_active(session)
        if is_missing_table_error(exc):
            return NotificationPreferenceOut(
                notifyOnProfileComments=body.notify_on_profile_comments or False,
                notifyOnMatchResults=body.notify_on_match_results or False,
                pushEnabled=body.push_enabled or False,
                subscriptions=[],
            )
        raise

    return NotificationPreferenceOut(
        notifyOnProfileComments=bool(prefs.notify_on_profile_comments),
        notifyOnMatchResults=bool(prefs.notify_on_match_results),
        pushEnabled=bool(prefs.push_enabled),
        subscriptions=[
            PushSubscriptionOut(
                id=s.id,
                endpoint=s.endpoint,
                createdAt=coerce_utc(s.created_at),
            )
            for s in subs
        ],
    )


@router.post(
    "/subscriptions",
    response_model=PushSubscriptionOut,
    status_code=201,
)
async def create_push_subscription(
    body: PushSubscriptionCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    subscription = await register_push_subscription(
        session,
        user.id,
        endpoint=body.endpoint,
        p256dh=body.keys.p256dh,
        auth=body.keys.auth,
        content_encoding=body.content_encoding,
    )
    if not subscription:
        raise http_problem(
            status_code=503,
            detail="push subscriptions unavailable",
            code="push_subscriptions_unavailable",
        )

    return PushSubscriptionOut(
        id=subscription.id,
        endpoint=subscription.endpoint,
        createdAt=coerce_utc(subscription.created_at),
    )


@router.delete("/subscriptions", status_code=204)
async def remove_push_subscriptions(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    await delete_push_subscriptions(session, user.id)
    return Response(status_code=204)


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    try:
        total_unread = (
            await session.execute(
                select(func.count()).select_from(Notification).where(
                    Notification.user_id == user.id,
                    Notification.read_at.is_(None),
                )
            )
        ).scalar_one()

        stmt = (
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = (await session.execute(stmt)).scalars().all()
    except SQLAlchemyError as exc:
        await _rollback_if_active(session)
        if is_missing_table_error(exc):
            return NotificationListOut(items=[], unreadCount=0)
        raise

    return NotificationListOut(
        items=[
            NotificationOut(
                id=row.id,
                type=row.type,
                payload=row.payload,
                createdAt=coerce_utc(row.created_at),
                readAt=coerce_utc(row.read_at) if row.read_at else None,
            )
            for row in rows
        ],
        unreadCount=total_unread,
    )


@router.post("/{notification_id}/read", status_code=204)
async def mark_notification_read(
    notification_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    try:
        notification = await session.get(Notification, notification_id)
        if not notification or notification.user_id != user.id:
            raise http_problem(
                status_code=404,
                detail="notification not found",
                code="notification_not_found",
            )

        if notification.read_at is None:
            notification.read_at = func.now()
            await session.commit()
    except SQLAlchemyError as exc:
        await _rollback_if_active(session)
        if is_missing_table_error(exc):
            return Response(status_code=204)
        raise

    return Response(status_code=204)


@router.post("/read-all", status_code=204)
async def mark_all_notifications_read(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    try:
        await session.execute(
            update(Notification)
            .where(
                Notification.user_id == user.id,
                Notification.read_at.is_(None),
            )
            .values(read_at=func.now())
        )
        await session.commit()
    except SQLAlchemyError as exc:
        await _rollback_if_active(session)
        if is_missing_table_error(exc):
            return Response(status_code=204)
        raise

    return Response(status_code=204)


async def _rollback_if_active(session: AsyncSession) -> None:
    try:
        if session.in_transaction():
            await session.rollback()
    except SQLAlchemyError:
        pass
