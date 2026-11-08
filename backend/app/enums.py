from enum import Enum


class TimeCategory(str, Enum):
    RED = "red"
    GREEN = "green"
    YELLOW = "yellow"


class BlackEventKind(str, Enum):
    EXAM = "exam"
    SEMINAR = "seminar"
    SIMPLE_ASSIGNMENT = "simple_assignment"


class HonestyReason(str, Enum):
    DEPRESSION = "depression"
    PROCRASTINATION = "procrastination"
    EXHAUSTION = "exhaustion"
    EVERYTHING = "everything"


class CalendarEntryKind(str, Enum):
    FIXED_HOLIDAY = "fixed_holiday"
    MOVABLE_HOLIDAY = "movable_holiday"
    SPECIAL_DATE = "special_date"


class Jurisdiction(str, Enum):
    BRAZIL = "BR"
    RIO_GRANDE_DO_SUL = "BR-RS"
    PERSONAL = "personal"


BLACK_EVENT_PRESENTATION = {
    BlackEventKind.EXAM: ("💀", "Prova"),
    BlackEventKind.SEMINAR: ("🎤", "Seminário"),
    BlackEventKind.SIMPLE_ASSIGNMENT: ("📓", "Trabalho Bobo"),
}

HONESTY_REASON_PRESENTATION = {
    HonestyReason.DEPRESSION: ("🌧️", "Depressão"),
    HonestyReason.PROCRASTINATION: ("🦥", "Vagabundagem"),
    HonestyReason.EXHAUSTION: ("🔋", "Cansaço físico/mental"),
    HonestyReason.EVERYTHING: ("🌪️", "Tudo junto incluído"),
}
