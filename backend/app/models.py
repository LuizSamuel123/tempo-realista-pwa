from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import (
    BlackEventKind,
    CalendarEntryKind,
    HonestyReason,
    Jurisdiction,
    TimeCategory,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TimeBlock(Base):
    """Blocos vermelhos, verdes e amarelos.

    Blocos amarelos podem ficar no pool com `scheduled_date` nulo.
    """

    __tablename__ = "time_blocks"
    __table_args__ = (
        CheckConstraint(
            "end_time IS NULL OR start_time IS NULL OR end_time > start_time",
            name="ck_time_block_valid_interval",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[TimeCategory] = mapped_column(
        Enum(TimeCategory, native_enum=False, length=16), index=True
    )
    scheduled_date: Mapped[date | None] = mapped_column(Date, index=True)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    icon: Mapped[str | None] = mapped_column(String(128))
    completed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    honesty_logs: Mapped[list[HonestyLog]] = relationship(
        back_populates="time_block", cascade="all, delete-orphan"
    )


class BlackEvent(Base):
    __tablename__ = "black_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[BlackEventKind] = mapped_column(
        Enum(BlackEventKind, native_enum=False, length=32)
    )
    event_date: Mapped[date] = mapped_column(Date, index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    important: Mapped[bool] = mapped_column(Boolean, default=True)
    email_lead_days: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    __table_args__ = (
        CheckConstraint(
            "email_lead_days BETWEEN 3 AND 7",
            name="ck_black_event_email_lead_days",
        ),
    )


class HonestyLog(Base):
    __tablename__ = "honesty_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    time_block_id: Mapped[int] = mapped_column(
        ForeignKey("time_blocks.id", ondelete="CASCADE"), index=True
    )
    previous_date: Mapped[date | None] = mapped_column(Date)
    new_date: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[HonestyReason] = mapped_column(
        Enum(HonestyReason, native_enum=False, length=32), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True
    )

    time_block: Mapped[TimeBlock] = relationship(back_populates="honesty_logs")


class NativeCalendarEntry(Base):
    __tablename__ = "native_calendar_entries"
    __table_args__ = (
        UniqueConstraint("entry_date", "name", name="uq_calendar_date_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[CalendarEntryKind] = mapped_column(
        Enum(CalendarEntryKind, native_enum=False, length=24), index=True
    )
    jurisdiction: Mapped[Jurisdiction] = mapped_column(
        Enum(Jurisdiction, native_enum=False, length=24)
    )
    icon: Mapped[str | None] = mapped_column(String(16))
    color: Mapped[TimeCategory] = mapped_column(
        Enum(TimeCategory, native_enum=False, length=16),
        default=TimeCategory.YELLOW,
    )
    important: Mapped[bool] = mapped_column(Boolean, default=False)
    email_lead_days: Mapped[int | None] = mapped_column(Integer)


class Birthday(Base):
    __tablename__ = "birthdays"
    __table_args__ = (
        CheckConstraint("month BETWEEN 1 AND 12", name="ck_birthday_month"),
        CheckConstraint("day BETWEEN 1 AND 31", name="ck_birthday_day"),
        CheckConstraint(
            "email_lead_days BETWEEN 3 AND 7",
            name="ck_birthday_email_lead_days",
        ),
        UniqueConstraint("person_name", "day", "month", name="uq_birthday_person"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    person_name: Mapped[str] = mapped_column(String(120), index=True)
    day: Mapped[int] = mapped_column(Integer)
    month: Mapped[int] = mapped_column(Integer)
    important: Mapped[bool] = mapped_column(Boolean, default=True)
    email_lead_days: Mapped[int] = mapped_column(Integer, default=5)
    icon: Mapped[str] = mapped_column(String(16), default="🎂")


class CommuteLog(Base):
    __tablename__ = "commute_logs"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0", name="ck_commute_positive_duration"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    route_name: Mapped[str] = mapped_column(String(120), index=True)
    travel_date: Mapped[date] = mapped_column(Date, index=True)
    departure_time: Mapped[time] = mapped_column(Time)
    arrival_time: Mapped[time] = mapped_column(Time)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
