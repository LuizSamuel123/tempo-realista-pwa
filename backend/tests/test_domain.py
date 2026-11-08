from datetime import date, time, timedelta

import pytest
from sqlalchemy import select

from app.enums import BlackEventKind, HonestyReason, TimeCategory
from app.models import BlackEvent, TimeBlock
from app.schemas import CommuteCreate, HonestyLogCreate, WeekdaySeriesUpdate, WeekdayTimeUpdate
from app.services.domain import (
    create_commute,
    delete_block_series,
    radar_items,
    rollover_block,
    ScheduleConflictError,
    assert_no_time_conflict,
    time_block_icon,
    update_weekday_series,
    update_weekday_series_time,
)


def test_rollover_records_reason_and_changes_date(db):
    block = TimeBlock(
        title="Estudar",
        category=TimeCategory.GREEN,
        scheduled_date=date(2026, 7, 30),
    )
    db.add(block)
    db.commit()
    log = rollover_block(
        db,
        block,
        HonestyLogCreate(
            new_date=date(2026, 7, 31),
            reason=HonestyReason.EXHAUSTION,
        ),
    )
    assert log.previous_date == date(2026, 7, 30)
    assert log.reason == HonestyReason.EXHAUSTION
    assert block.scheduled_date == date(2026, 7, 31)


def test_red_block_cannot_rollover(db):
    block = TimeBlock(
        title="Aula",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 7, 30),
    )
    db.add(block)
    db.commit()
    with pytest.raises(ValueError):
        rollover_block(
            db,
            block,
            HonestyLogCreate(
                new_date=date(2026, 7, 31),
                reason=HonestyReason.EVERYTHING,
            ),
        )


def test_time_conflict_is_detected(db):
    db.add(
        TimeBlock(
            title="Terapia",
            category=TimeCategory.GREEN,
            scheduled_date=date(2026, 8, 10),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
    )
    db.commit()

    with pytest.raises(ScheduleConflictError, match="Conflito com"):
        assert_no_time_conflict(
            db,
            date(2026, 8, 10),
            time(9, 30),
            time(10, 30),
        )


def test_adjacent_times_do_not_conflict(db):
    db.add(
        TimeBlock(
            title="Terapia",
            category=TimeCategory.GREEN,
            scheduled_date=date(2026, 8, 10),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
    )
    db.commit()

    assert_no_time_conflict(
        db,
        date(2026, 8, 10),
        time(10, 0),
        time(11, 0),
    )


def test_radar_only_has_whole_days_up_to_twenty(db):
    today = date(2026, 7, 30)
    db.add_all(
        [
            BlackEvent(
                title="Hoje",
                kind=BlackEventKind.EXAM,
                event_date=today,
            ),
            BlackEvent(
                title="Limite",
                kind=BlackEventKind.SEMINAR,
                event_date=today + timedelta(days=20),
            ),
            BlackEvent(
                title="Fora",
                kind=BlackEventKind.SIMPLE_ASSIGNMENT,
                event_date=today + timedelta(days=21),
            ),
        ]
    )
    db.commit()
    items = radar_items(db, today=today)
    assert [item.days_remaining for item in items] == [0, 20]
    assert [item.message for item in items] == ["é hoje", "faltam 20 dias"]


def test_radar_includes_scheduled_blocks(db):
    today = date(2026, 7, 30)
    db.add_all(
        [
            TimeBlock(
                title="Aula",
                category=TimeCategory.RED,
                scheduled_date=today + timedelta(days=2),
            ),
            TimeBlock(
                title="Descanso feito",
                category=TimeCategory.GREEN,
                scheduled_date=today + timedelta(days=3),
                completed=True,
            ),
            TimeBlock(
                title="Sem data",
                category=TimeCategory.YELLOW,
                scheduled_date=None,
            ),
        ]
    )
    db.commit()
    items = radar_items(db, today=today)
    assert [(item.title, item.days_remaining, item.icon) for item in items] == [
        ("Aula", 2, "🖥️")
    ]


def test_time_block_icons_are_inferred_from_titles():
    assert time_block_icon(
        TimeBlock(title="Aniversário da Maria", category=TimeCategory.YELLOW)
    ) == "🎂"
    assert time_block_icon(
        TimeBlock(title="Centro Espírita", category=TimeCategory.GREEN)
    ) == "👻"
    assert time_block_icon(
        TimeBlock(title="Terapia junguiana", category=TimeCategory.GREEN)
    ) == "🌀"
    assert time_block_icon(
        TimeBlock(title="Aula normal da faculdade", category=TimeCategory.RED)
    ) == "🏫"
    assert time_block_icon(
        TimeBlock(title="Aula normal", category=TimeCategory.RED)
    ) == "🖥️"
    assert time_block_icon(
        TimeBlock(title="Estágio na SEHAB/CAFF", category=TimeCategory.RED)
    ) == "🪜"
    assert time_block_icon(
        TimeBlock(title="Aula normal da faculdade", category=TimeCategory.RED, icon="📚")
    ) == "📚"


def test_update_weekday_series_time_changes_future_weekdays_only(db):
    monday = TimeBlock(
        title="Estágio",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 3),
        start_time=time(13, 0),
        end_time=time(17, 0),
    )
    saturday = TimeBlock(
        title="Estágio",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 8),
        start_time=time(13, 0),
        end_time=time(17, 0),
    )
    other = TimeBlock(
        title="Aula",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 4),
        start_time=time(13, 0),
        end_time=time(17, 0),
    )
    db.add_all([monday, saturday, other])
    db.commit()

    updated = update_weekday_series_time(
        db,
        monday,
        WeekdayTimeUpdate(start_time=time(8, 0), end_time=time(12, 0)),
    )

    assert updated == 1
    assert monday.start_time == time(8, 0)
    assert monday.end_time == time(12, 0)
    assert saturday.start_time == time(13, 0)
    assert other.start_time == time(13, 0)


def test_update_weekday_series_changes_only_range_weekdays(db):
    blocks = [
        TimeBlock(
            title="Aula",
            category=TimeCategory.RED,
            scheduled_date=date(2026, 8, day),
            start_time=time(13, 0),
            end_time=time(17, 0),
        )
        for day in (3, 4, 8, 20)
    ]
    db.add_all(blocks)
    db.commit()

    updated = update_weekday_series(
        db,
        blocks[0],
        WeekdaySeriesUpdate(
            title="Aula",
            description="Manhã temporária",
            category=TimeCategory.RED,
            start_time=time(8, 0),
            end_time=time(12, 0),
            icon="🖥️",
            range_end=date(2026, 8, 17),
        ),
    )

    assert updated == 2
    assert blocks[0].start_time == time(8, 0)
    assert blocks[1].start_time == time(8, 0)
    assert blocks[2].start_time == time(13, 0)
    assert blocks[3].start_time == time(13, 0)


def test_update_weekday_series_all_changes_every_matching_weekday(db):
    blocks = [
        TimeBlock(
            title="Estágio",
            category=TimeCategory.RED,
            scheduled_date=date(2026, 8, day),
            start_time=time(13, 0),
            end_time=time(17, 0),
        )
        for day in (3, 4, 20)
    ]
    other = TimeBlock(
        title="Terapia",
        category=TimeCategory.GREEN,
        scheduled_date=date(2026, 8, 3),
        start_time=time(8, 0),
        end_time=time(9, 0),
    )
    db.add_all([*blocks, other])
    db.commit()

    updated = update_weekday_series(
        db,
        blocks[1],
        WeekdaySeriesUpdate(
            title="Estágio",
            description="Manhã definitiva",
            category=TimeCategory.RED,
            start_time=time(9, 0),
            end_time=time(12, 0),
            icon="🪜",
            scope="all",
        ),
    )

    assert updated == 3
    assert all(block.start_time == time(9, 0) for block in blocks)
    assert other.start_time == time(8, 0)


def test_update_weekday_series_rejects_conflicts(db):
    aula = TimeBlock(
        title="Aula",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 3),
        start_time=time(13, 0),
        end_time=time(17, 0),
    )
    terapia = TimeBlock(
        title="Terapia",
        category=TimeCategory.GREEN,
        scheduled_date=date(2026, 8, 3),
        start_time=time(8, 30),
        end_time=time(9, 30),
    )
    db.add_all([aula, terapia])
    db.commit()

    with pytest.raises(ScheduleConflictError):
        update_weekday_series(
            db,
            aula,
            WeekdaySeriesUpdate(
                title="Aula",
                description=None,
                category=TimeCategory.RED,
                start_time=time(8, 0),
                end_time=time(12, 0),
                icon="🖥️",
                range_end=date(2026, 8, 17),
            ),
        )


def test_delete_block_series_from_date_keeps_past_and_other_titles(db):
    past = TimeBlock(
        title="Faculdade",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 3),
    )
    selected = TimeBlock(
        title="Faculdade",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 10),
    )
    future = TimeBlock(
        title="Faculdade",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 11),
    )
    other = TimeBlock(
        title="Estágio",
        category=TimeCategory.RED,
        scheduled_date=date(2026, 8, 11),
    )
    db.add_all([past, selected, future, other])
    db.commit()

    deleted = delete_block_series(db, selected, "from_date")
    remaining = {item.title for item in db.scalars(select(TimeBlock)).all()}

    assert deleted == 2
    assert remaining == {"Faculdade", "Estágio"}
    assert past in db
    assert other in db


def test_delete_block_series_all_removes_matching_uncompleted(db):
    first = TimeBlock(title="Faculdade", category=TimeCategory.RED)
    second = TimeBlock(title="Faculdade", category=TimeCategory.RED)
    done = TimeBlock(title="Faculdade", category=TimeCategory.RED, completed=True)
    db.add_all([first, second, done])
    db.commit()

    deleted = delete_block_series(db, first, "all")

    assert deleted == 2
    assert db.scalars(select(TimeBlock)).all() == [done]


def test_commute_can_cross_midnight(db):
    commute = create_commute(
        db,
        CommuteCreate(
            route_name="Campus → Casa",
            travel_date=date(2026, 7, 30),
            departure_time=time(23, 50),
            arrival_time=time(0, 20),
        ),
    )
    assert commute.duration_minutes == 30
