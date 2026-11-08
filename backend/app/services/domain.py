from datetime import date, datetime, timedelta
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import BLACK_EVENT_PRESENTATION, TimeCategory
from app.models import BlackEvent, CommuteLog, HonestyLog, TimeBlock
from app.schemas import (
    CommuteAverage,
    CommuteCreate,
    HonestyLogCreate,
    RadarItem,
    WeekdaySeriesUpdate,
    WeekdayTimeUpdate,
)

TIME_BLOCK_PRESENTATION = {
    TimeCategory.RED: "🔴",
    TimeCategory.GREEN: "🟢",
    TimeCategory.YELLOW: "🟡",
}


class ScheduleConflictError(ValueError):
    pass


def normalize_text(value: str) -> str:
    without_marks = unicodedata.normalize("NFD", value)
    return "".join(char for char in without_marks if unicodedata.category(char) != "Mn").lower()


def time_block_icon(block: TimeBlock) -> str:
    if block.icon and block.icon not in set(TIME_BLOCK_PRESENTATION.values()):
        return block.icon
    title = normalize_text(block.title)
    if "aniversario" in title:
        return "🎂"
    if "centro espirita" in title:
        return "👻"
    if "terapia" in title or "jung" in title:
        return "🌀"
    if "estagio" in title:
        return "🪜"
    if "faculdade" in title:
        return "🏫"
    if "aula" in title:
        return "🖥️"
    if block.icon:
        return block.icon
    return TIME_BLOCK_PRESENTATION[block.category]


def overlapping_block(
    db: Session,
    scheduled_date: date | None,
    start_time,
    end_time,
    *,
    exclude_id: int | None = None,
) -> TimeBlock | None:
    if scheduled_date is None or start_time is None or end_time is None:
        return None
    query = select(TimeBlock).where(
        TimeBlock.completed.is_(False),
        TimeBlock.scheduled_date == scheduled_date,
        TimeBlock.start_time.is_not(None),
        TimeBlock.end_time.is_not(None),
        TimeBlock.start_time < end_time,
        TimeBlock.end_time > start_time,
    )
    if exclude_id is not None:
        query = query.where(TimeBlock.id != exclude_id)
    return db.scalars(query.order_by(TimeBlock.start_time, TimeBlock.title)).first()


def assert_no_time_conflict(
    db: Session,
    scheduled_date: date | None,
    start_time,
    end_time,
    *,
    exclude_id: int | None = None,
) -> None:
    conflict = overlapping_block(
        db,
        scheduled_date,
        start_time,
        end_time,
        exclude_id=exclude_id,
    )
    if conflict is None:
        return
    raise ScheduleConflictError(
        f"Conflito com “{conflict.title}” em {conflict.scheduled_date:%d/%m/%Y}, "
        f"{conflict.start_time:%H:%M}–{conflict.end_time:%H:%M}."
    )


def rollover_block(
    db: Session, block: TimeBlock, payload: HonestyLogCreate
) -> HonestyLog:
    if block.category not in (TimeCategory.GREEN, TimeCategory.YELLOW):
        raise ValueError("Somente blocos verdes ou amarelos podem ser adiados.")
    assert_no_time_conflict(
        db,
        payload.new_date,
        block.start_time,
        block.end_time,
        exclude_id=block.id,
    )
    log = HonestyLog(
        time_block_id=block.id,
        previous_date=block.scheduled_date,
        new_date=payload.new_date,
        reason=payload.reason,
    )
    block.scheduled_date = payload.new_date
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def update_weekday_series_time(
    db: Session, block: TimeBlock, payload: WeekdayTimeUpdate
) -> int:
    if block.scheduled_date is None:
        raise ValueError("Esse compromisso não tem data.")
    candidates = db.scalars(
        select(TimeBlock)
        .where(
            TimeBlock.completed.is_(False),
            TimeBlock.title == block.title,
            TimeBlock.category == block.category,
            TimeBlock.scheduled_date.is_not(None),
            TimeBlock.scheduled_date >= block.scheduled_date,
        )
        .order_by(TimeBlock.scheduled_date, TimeBlock.start_time)
    ).all()
    updated = 0
    for item in candidates:
        if item.scheduled_date is None or item.scheduled_date.weekday() > 4:
            continue
        assert_no_time_conflict(
            db,
            item.scheduled_date,
            payload.start_time,
            payload.end_time,
            exclude_id=item.id,
        )
        item.start_time = payload.start_time
        item.end_time = payload.end_time
        updated += 1
    db.commit()
    return updated


def update_weekday_series(
    db: Session, block: TimeBlock, payload: WeekdaySeriesUpdate
) -> int:
    if block.scheduled_date is None:
        raise ValueError("Esse compromisso não tem data.")
    if payload.scope == "range" and payload.range_end is not None and payload.range_end < block.scheduled_date:
        raise ValueError("A data final precisa ser igual ou posterior ao compromisso.")
    conditions = [
        TimeBlock.completed.is_(False),
        TimeBlock.title == block.title,
        TimeBlock.category == block.category,
        TimeBlock.scheduled_date.is_not(None),
    ]
    if payload.scope == "range":
        conditions.extend(
            [
                TimeBlock.scheduled_date >= block.scheduled_date,
                TimeBlock.scheduled_date <= payload.range_end,
            ]
        )
    candidates = db.scalars(
        select(TimeBlock)
        .where(*conditions)
        .order_by(TimeBlock.scheduled_date, TimeBlock.start_time)
    ).all()
    updated = 0
    for item in candidates:
        if item.scheduled_date is None:
            continue
        if payload.scope == "range" and item.scheduled_date.weekday() > 4:
            continue
        assert_no_time_conflict(
            db,
            item.scheduled_date,
            payload.start_time,
            payload.end_time,
            exclude_id=item.id,
        )
        item.title = payload.title
        item.description = payload.description
        item.category = payload.category
        item.start_time = payload.start_time
        item.end_time = payload.end_time
        item.icon = payload.icon
        updated += 1
    db.commit()
    return updated


def delete_block_series(db: Session, block: TimeBlock, scope: str) -> int:
    if scope not in {"from_date", "all"}:
        raise ValueError("Escopo de exclusão inválido.")
    conditions = [
        TimeBlock.completed.is_(False),
        TimeBlock.title == block.title,
        TimeBlock.category == block.category,
    ]
    if scope == "from_date":
        if block.scheduled_date is None:
            raise ValueError("Esse compromisso não tem data.")
        conditions.extend(
            [
                TimeBlock.scheduled_date.is_not(None),
                TimeBlock.scheduled_date >= block.scheduled_date,
            ]
        )
    candidates = db.scalars(select(TimeBlock).where(*conditions)).all()
    deleted = len(candidates)
    for item in candidates:
        db.delete(item)
    db.commit()
    return deleted


def radar_items(db: Session, today: date | None = None) -> list[RadarItem]:
    base_date = today or date.today()
    limit = base_date + timedelta(days=20)
    events = db.scalars(
        select(BlackEvent)
        .where(
            BlackEvent.completed.is_(False),
            BlackEvent.event_date >= base_date,
            BlackEvent.event_date <= limit,
        )
        .order_by(BlackEvent.event_date)
    )
    blocks = db.scalars(
        select(TimeBlock)
        .where(
            TimeBlock.completed.is_(False),
            TimeBlock.scheduled_date.is_not(None),
            TimeBlock.scheduled_date >= base_date,
            TimeBlock.scheduled_date <= limit,
        )
        .order_by(TimeBlock.scheduled_date, TimeBlock.start_time, TimeBlock.title)
    )
    result = []
    for event in events:
        days = (event.event_date - base_date).days
        icon, _label = BLACK_EVENT_PRESENTATION[event.kind]
        message = "é hoje" if days == 0 else f"faltam {days} {'dia' if days == 1 else 'dias'}"
        result.append(
            RadarItem(
                id=event.id,
                title=event.title,
                event_date=event.event_date,
                days_remaining=days,
                message=message,
                icon=f"⚫{icon}",
            )
        )
    for block in blocks:
        if block.scheduled_date is None:
            continue
        days = (block.scheduled_date - base_date).days
        message = "é hoje" if days == 0 else f"faltam {days} {'dia' if days == 1 else 'dias'}"
        result.append(
            RadarItem(
                id=block.id,
                title=block.title,
                event_date=block.scheduled_date,
                days_remaining=days,
                message=message,
                icon=time_block_icon(block),
            )
        )
    return sorted(result, key=lambda item: (item.event_date, item.days_remaining, item.title))


def create_commute(db: Session, payload: CommuteCreate) -> CommuteLog:
    departure = datetime.combine(payload.travel_date, payload.departure_time)
    arrival = datetime.combine(payload.travel_date, payload.arrival_time)
    if arrival <= departure:
        arrival += timedelta(days=1)
    duration = int((arrival - departure).total_seconds() // 60)
    commute = CommuteLog(
        **payload.model_dump(),
        duration_minutes=duration,
    )
    db.add(commute)
    db.commit()
    db.refresh(commute)
    return commute


def commute_averages(db: Session) -> list[CommuteAverage]:
    rows = db.execute(
        select(CommuteLog.route_name, CommuteLog.travel_date, CommuteLog.duration_minutes)
    )
    grouped: dict[tuple[str, int], list[int]] = {}
    for route_name, travel_date, duration in rows:
        grouped.setdefault((route_name, travel_date.weekday()), []).append(duration)
    return [
        CommuteAverage(
            route_name=route,
            weekday=weekday,
            average_minutes=round(sum(values) / len(values), 1),
            samples=len(values),
        )
        for (route, weekday), values in sorted(grouped.items())
    ]
