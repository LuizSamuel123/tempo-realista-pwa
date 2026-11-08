from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import CalendarEntryKind, Jurisdiction, TimeCategory
from app.models import NativeCalendarEntry


@dataclass(frozen=True)
class CalendarSeed:
    name: str
    entry_date: date
    kind: CalendarEntryKind
    jurisdiction: Jurisdiction
    icon: str
    important: bool = False
    email_lead_days: int | None = None


NATIONAL_FIXED_DATES = (
    (1, 1, "Confraternização Universal", "🎆"),
    (4, 21, "Tiradentes", "🦷"),
    (5, 1, "Dia Mundial do Trabalho", "🛠️"),
    (9, 7, "Independência do Brasil", "⚔️🐎"),
    (10, 12, "Nossa Senhora Aparecida", "🙏"),
    (11, 2, "Finados", "🕯️"),
    (11, 15, "Proclamação da República", "🏛️"),
    (11, 20, "Dia da Consciência Negra", "✊🏿"),
    (12, 25, "Natal", "🎄"),
)

RS_FIXED_DATES = (
    (9, 20, "Revolução Farroupilha", "🧉"),
)


def easter_sunday(year: int) -> date:
    """Calcula a Páscoa gregoriana pelo algoritmo de Meeus/Jones/Butcher."""
    if year < 1583:
        raise ValueError("O calendário gregoriano é suportado a partir de 1583.")

    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ell = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ell) // 451
    month = (h + ell - 7 * m + 114) // 31
    day = ((h + ell - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def nth_weekday_of_month(
    year: int, month: int, weekday: int, occurrence: int
) -> date:
    """Retorna a n-ésima ocorrência; weekday segue date.weekday (segunda=0)."""
    if occurrence < 1:
        raise ValueError("A ocorrência deve ser maior que zero.")
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (occurrence - 1))


def calendar_entries_for_year(year: int) -> list[CalendarSeed]:
    easter = easter_sunday(year)
    entries = [
        CalendarSeed(
            name=name,
            entry_date=date(year, month, day),
            kind=CalendarEntryKind.FIXED_HOLIDAY,
            jurisdiction=Jurisdiction.BRAZIL,
            icon=icon,
        )
        for month, day, name, icon in NATIONAL_FIXED_DATES
    ]
    entries.extend(
        CalendarSeed(
            name=name,
            entry_date=date(year, month, day),
            kind=CalendarEntryKind.FIXED_HOLIDAY,
            jurisdiction=Jurisdiction.RIO_GRANDE_DO_SUL,
            icon=icon,
        )
        for month, day, name, icon in RS_FIXED_DATES
    )
    entries.extend(
        (
            CalendarSeed(
                "Carnaval (segunda-feira)",
                easter - timedelta(days=48),
                CalendarEntryKind.MOVABLE_HOLIDAY,
                Jurisdiction.BRAZIL,
                "🎭",
            ),
            CalendarSeed(
                "Carnaval (terça-feira)",
                easter - timedelta(days=47),
                CalendarEntryKind.MOVABLE_HOLIDAY,
                Jurisdiction.BRAZIL,
                "🎭",
            ),
            CalendarSeed(
                "Sexta-feira Santa",
                easter - timedelta(days=2),
                CalendarEntryKind.MOVABLE_HOLIDAY,
                Jurisdiction.BRAZIL,
                "✝️",
            ),
            CalendarSeed(
                "Corpus Christi",
                easter + timedelta(days=60),
                CalendarEntryKind.MOVABLE_HOLIDAY,
                Jurisdiction.BRAZIL,
                "✝️",
            ),
            CalendarSeed(
                "Dia das Mães",
                nth_weekday_of_month(year, 5, weekday=6, occurrence=2),
                CalendarEntryKind.SPECIAL_DATE,
                Jurisdiction.PERSONAL,
                "👩",
                important=True,
                email_lead_days=5,
            ),
            CalendarSeed(
                "Dia dos Pais",
                nth_weekday_of_month(year, 8, weekday=6, occurrence=2),
                CalendarEntryKind.SPECIAL_DATE,
                Jurisdiction.PERSONAL,
                "👨",
                important=True,
                email_lead_days=5,
            ),
        )
    )
    return sorted(entries, key=lambda item: item.entry_date)


def populate_calendar_year(db: Session, year: int) -> int:
    """Insere o calendário do ano de modo idempotente e retorna novas linhas."""
    inserted = 0
    for seed in calendar_entries_for_year(year):
        exists = db.scalar(
            select(NativeCalendarEntry.id).where(
                NativeCalendarEntry.entry_date == seed.entry_date,
                NativeCalendarEntry.name == seed.name,
            )
        )
        if exists is not None:
            continue
        db.add(
            NativeCalendarEntry(
                name=seed.name,
                entry_date=seed.entry_date,
                kind=seed.kind,
                jurisdiction=seed.jurisdiction,
                icon=seed.icon,
                color=TimeCategory.YELLOW,
                important=seed.important,
                email_lead_days=seed.email_lead_days,
            )
        )
        inserted += 1
    db.commit()
    return inserted
