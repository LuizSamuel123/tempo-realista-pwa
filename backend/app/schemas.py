from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.enums import (
    BlackEventKind,
    CalendarEntryKind,
    HonestyReason,
    Jurisdiction,
    TimeCategory,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class TimeBlockCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    category: TimeCategory
    scheduled_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    icon: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_schedule(self) -> "TimeBlockCreate":
        if self.category == TimeCategory.RED and self.scheduled_date is None:
            raise ValueError("Blocos vermelhos precisam de uma data.")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Informe início e fim juntos.")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("O horário final deve ser posterior ao inicial.")
        return self


class TimeBlockRead(TimeBlockCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    completed: bool
    created_at: datetime


class TimeBlockUpdate(TimeBlockCreate):
    pass


class WeekdaySeriesUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    category: TimeCategory
    start_time: time | None = None
    end_time: time | None = None
    icon: str | None = Field(default=None, max_length=128)
    range_end: date | None = None
    scope: str = Field(default="range", pattern="^(range|all)$")

    @model_validator(mode="after")
    def validate_series(self) -> "WeekdaySeriesUpdate":
        if self.scope == "range" and self.range_end is None:
            raise ValueError("Informe a data final.")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("Informe início e fim juntos.")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("O horário final deve ser posterior ao inicial.")
        return self


class WeekdayTimeUpdate(BaseModel):
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def validate_time_range(self) -> "WeekdayTimeUpdate":
        if self.end_time <= self.start_time:
            raise ValueError("O horário final deve ser posterior ao inicial.")
        return self


class BlackEventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = None
    kind: BlackEventKind
    event_date: date
    important: bool = True
    email_lead_days: int = Field(default=5, ge=3, le=7)


class BlackEventRead(BlackEventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    completed: bool
    created_at: datetime


class HonestyLogCreate(BaseModel):
    new_date: date | None
    reason: HonestyReason


class HonestyLogRead(HonestyLogCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    time_block_id: int
    previous_date: date | None
    created_at: datetime


class NativeCalendarEntryRead(ORMModel):
    id: int
    name: str
    entry_date: date
    kind: CalendarEntryKind
    jurisdiction: Jurisdiction
    icon: str | None
    color: TimeCategory
    important: bool
    email_lead_days: int | None


class BirthdayCreate(BaseModel):
    person_name: str = Field(min_length=1, max_length=120)
    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    important: bool = True
    email_lead_days: int = Field(default=5, ge=3, le=7)

    @model_validator(mode="after")
    def validate_day_and_month(self) -> "BirthdayCreate":
        # Ano bissexto permite armazenar 29/02; a ocorrência anual trata anos comuns.
        date(2000, self.month, self.day)
        return self


class BirthdayRead(BirthdayCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    icon: str


class RadarItem(BaseModel):
    id: int
    title: str
    event_date: date
    days_remaining: int
    message: str
    icon: str


class CommuteCreate(BaseModel):
    route_name: str = Field(min_length=1, max_length=120)
    travel_date: date
    departure_time: time
    arrival_time: time
    notes: str | None = None


class CommuteRead(CommuteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    duration_minutes: int
    created_at: datetime


class CommuteAverage(BaseModel):
    route_name: str
    weekday: int = Field(description="0=segunda, 6=domingo")
    average_minutes: float
    samples: int
