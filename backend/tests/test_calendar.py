from datetime import date

from sqlalchemy import func, select

from app.models import NativeCalendarEntry
from app.services.calendar import (
    calendar_entries_for_year,
    easter_sunday,
    nth_weekday_of_month,
    populate_calendar_year,
)


def test_easter_and_movables_for_2026():
    assert easter_sunday(2026) == date(2026, 4, 5)
    entries = {item.name: item.entry_date for item in calendar_entries_for_year(2026)}
    assert entries["Carnaval (terça-feira)"] == date(2026, 2, 17)
    assert entries["Sexta-feira Santa"] == date(2026, 4, 3)
    assert entries["Corpus Christi"] == date(2026, 6, 4)


def test_special_dates_have_specific_icons():
    icons = {item.name: item.icon for item in calendar_entries_for_year(2026)}
    assert icons["Natal"] == "🎄"
    assert icons["Dia das Mães"] == "👩"
    assert icons["Dia dos Pais"] == "👨"
    assert icons["Independência do Brasil"] == "⚔️🐎"
    assert icons["Revolução Farroupilha"] == "🧉"


def test_second_sundays():
    assert nth_weekday_of_month(2026, 5, 6, 2) == date(2026, 5, 10)
    assert nth_weekday_of_month(2026, 8, 6, 2) == date(2026, 8, 9)


def test_population_is_idempotent(db):
    first_inserted = populate_calendar_year(db, 2026)
    second_inserted = populate_calendar_year(db, 2026)
    total = db.scalar(select(func.count()).select_from(NativeCalendarEntry))
    assert first_inserted == 16
    assert second_inserted == 0
    assert total == 16
