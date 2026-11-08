from contextlib import asynccontextmanager
from datetime import date
from ipaddress import ip_address
import os
import socket
import subprocess
import sys
import secrets
from pathlib import Path
import threading

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import Base, DATA_DIR, SessionLocal, engine, get_db
from app.models import BlackEvent, Birthday, NativeCalendarEntry, TimeBlock
from app.schemas import (
    BirthdayCreate,
    BirthdayRead,
    BlackEventCreate,
    BlackEventRead,
    CommuteAverage,
    CommuteCreate,
    CommuteRead,
    HonestyLogCreate,
    HonestyLogRead,
    NativeCalendarEntryRead,
    RadarItem,
    TimeBlockCreate,
    TimeBlockRead,
    TimeBlockUpdate,
    WeekdaySeriesUpdate,
    WeekdayTimeUpdate,
)
from app.services.calendar import populate_calendar_year
from app.services.domain import (
    ScheduleConflictError,
    assert_no_time_conflict,
    commute_averages,
    create_commute,
    delete_block_series,
    radar_items,
    rollover_block,
    update_weekday_series,
    update_weekday_series_time,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = PROJECT_ROOT / "frontend"
ACCESS_KEY_PATH = DATA_DIR / "access.key"
ACCESS_COOKIE_NAME = "tempo_realista_key"
AUTH_EXEMPT_API_PATHS = {"/api/health"}
PHONE_SERVER_PORT = 8001
_sync_lock = threading.Lock()
_sync_version = 0


def get_access_key() -> str:
    configured = os.environ.get("TEMPO_REALISTA_ACCESS_KEY", "").strip()
    if configured:
        return configured
    if ACCESS_KEY_PATH.exists():
        saved = ACCESS_KEY_PATH.read_text(encoding="utf-8").strip()
        if saved:
            return saved
    generated = secrets.token_urlsafe(32)
    ACCESS_KEY_PATH.write_text(generated, encoding="utf-8")
    return generated


def client_is_local(request: Request) -> bool:
    host = request.client.host if request.client else ""
    if host in {"localhost", "127.0.0.1", "::1", "testserver"}:
        return True
    try:
        address = ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local


def request_has_access(request: Request) -> bool:
    expected = get_access_key()
    provided = (
        request.cookies.get(ACCESS_COOKIE_NAME)
        or request.headers.get("x-tempo-realista-key")
        or request.query_params.get("key")
        or ""
    )
    return bool(provided) and secrets.compare_digest(provided, expected)


def add_security_headers(response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "manifest-src 'self'; "
        "base-uri 'self'; "
        "form-action 'self'; "
        "frame-ancestors 'none'"
    )
    return response


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.25):
            return True
    except OSError:
        return False


def phone_server_link() -> str:
    return f"http://{get_lan_ip()}:{PHONE_SERVER_PORT}/?key={get_access_key()}"


def start_phone_server_process() -> bool:
    if port_is_open(PHONE_SERVER_PORT):
        return False
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    env = os.environ.copy()
    env["TEMPO_REALISTA_ACCESS_KEY"] = get_access_key()
    subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            str(PROJECT_ROOT / "backend"),
            "--host",
            "0.0.0.0",
            "--port",
            str(PHONE_SERVER_PORT),
        ],
        cwd=PROJECT_ROOT,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )
    return True


def sync_state() -> dict[str, int]:
    return {"version": _sync_version}


def touch_sync() -> dict[str, int]:
    global _sync_version
    with _sync_lock:
        _sync_version += 1
        return {"version": _sync_version}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        populate_calendar_year(db, date.today().year)
    yield


app = FastAPI(
    title="Tempo Realista",
    description="PWA local, privado e sem notificações push.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.middleware("http")
async def security_gate(request: Request, call_next):
    path = request.url.path
    if not client_is_local(request):
        return add_security_headers(
            JSONResponse({"detail": "Acesso permitido somente pela rede local."}, status_code=403)
        )
    if path.startswith("/api/") and path not in AUTH_EXEMPT_API_PATHS and not request_has_access(request):
        return add_security_headers(
            JSONResponse({"detail": "Abra o app pelo link seguro do servidor."}, status_code=401)
        )
    response = await call_next(request)
    return add_security_headers(response)


@app.get("/", include_in_schema=False)
def index(request: Request) -> FileResponse:
    response = FileResponse(STATIC_DIR / "index.html")
    provided = request.query_params.get("key")
    if provided and secrets.compare_digest(provided, get_access_key()):
        response.set_cookie(
            ACCESS_COOKIE_NAME,
            provided,
            max_age=60 * 60 * 24 * 365,
            httponly=True,
            samesite="strict",
        )
    return response


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "storage": "local"}


@app.get("/api/sync")
def get_sync() -> dict[str, int]:
    return sync_state()


@app.post("/api/sync")
def request_sync() -> dict[str, int]:
    return touch_sync()



@app.post("/api/app/phone-server")
def start_phone_server() -> dict[str, str | int]:
    started = start_phone_server_process()
    return {
        "status": "starting" if started else "running",
        "url": phone_server_link(),
        "port": PHONE_SERVER_PORT,
    }


@app.post(
    "/api/blocks", response_model=TimeBlockRead, status_code=status.HTTP_201_CREATED
)
def create_block(payload: TimeBlockCreate, db: Session = Depends(get_db)):
    try:
        assert_no_time_conflict(
            db,
            payload.scheduled_date,
            payload.start_time,
            payload.end_time,
        )
    except ScheduleConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    block = TimeBlock(**payload.model_dump())
    db.add(block)
    db.commit()
    db.refresh(block)
    touch_sync()
    return block


@app.get("/api/blocks", response_model=list[TimeBlockRead])
def list_blocks(db: Session = Depends(get_db)):
    return db.scalars(
        select(TimeBlock).order_by(TimeBlock.scheduled_date, TimeBlock.start_time)
    ).all()


@app.post("/api/blocks/{block_id}/complete", response_model=TimeBlockRead)
def complete_block(block_id: int, db: Session = Depends(get_db)):
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    block.completed = True
    db.commit()
    db.refresh(block)
    touch_sync()
    return block


@app.delete("/api/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_block(block_id: int, db: Session = Depends(get_db)):
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    db.delete(block)
    db.commit()
    touch_sync()


@app.delete("/api/blocks/{block_id}/series")
def delete_series(
    block_id: int,
    scope: str = Query(default="from_date", pattern="^(from_date|all)$"),
    db: Session = Depends(get_db),
) -> dict[str, int]:
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    try:
        deleted = delete_block_series(db, block, scope)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if deleted:
        touch_sync()
    return {"deleted": deleted}


@app.patch("/api/blocks/{block_id}", response_model=TimeBlockRead)
def update_block(
    block_id: int, payload: TimeBlockUpdate, db: Session = Depends(get_db)
):
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    try:
        assert_no_time_conflict(
            db,
            payload.scheduled_date,
            payload.start_time,
            payload.end_time,
            exclude_id=block.id,
        )
    except ScheduleConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    for field, value in payload.model_dump().items():
        setattr(block, field, value)
    db.commit()
    db.refresh(block)
    touch_sync()
    return block


@app.patch("/api/blocks/{block_id}/weekday-series")
def update_block_weekday_series(
    block_id: int, payload: WeekdaySeriesUpdate, db: Session = Depends(get_db)
) -> dict[str, int]:
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    try:
        updated = update_weekday_series(db, block, payload)
    except (ValueError, ScheduleConflictError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if updated:
        touch_sync()
    return {"updated": updated}


@app.patch("/api/blocks/{block_id}/weekday-series-time")
def update_block_weekday_series_time(
    block_id: int, payload: WeekdayTimeUpdate, db: Session = Depends(get_db)
) -> dict[str, int]:
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    try:
        updated = update_weekday_series_time(db, block, payload)
    except (ValueError, ScheduleConflictError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if updated:
        touch_sync()
    return {"updated": updated}


@app.post(
    "/api/blocks/{block_id}/rollover",
    response_model=HonestyLogRead,
    status_code=status.HTTP_201_CREATED,
)
def rollover(
    block_id: int, payload: HonestyLogCreate, db: Session = Depends(get_db)
):
    block = db.get(TimeBlock, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Bloco não encontrado.")
    try:
        log = rollover_block(db, block, payload)
    except (ValueError, ScheduleConflictError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    touch_sync()
    return log


@app.post(
    "/api/black-events",
    response_model=BlackEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_black_event(
    payload: BlackEventCreate, db: Session = Depends(get_db)
):
    event = BlackEvent(**payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    touch_sync()
    return event


@app.get("/api/black-events", response_model=list[BlackEventRead])
def list_black_events(db: Session = Depends(get_db)):
    return db.scalars(
        select(BlackEvent)
        .where(BlackEvent.completed.is_(False))
        .order_by(BlackEvent.event_date)
    ).all()


@app.patch("/api/black-events/{event_id}", response_model=BlackEventRead)
def update_black_event(
    event_id: int, payload: BlackEventCreate, db: Session = Depends(get_db)
):
    event = db.get(BlackEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Marco nÃ£o encontrado.")
    for key, value in payload.model_dump().items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    touch_sync()
    return event


@app.delete(
    "/api/black-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_black_event(event_id: int, db: Session = Depends(get_db)):
    event = db.get(BlackEvent, event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Marco não encontrado.")
    db.delete(event)
    db.commit()
    touch_sync()


@app.get("/api/radar", response_model=list[RadarItem])
def get_radar(db: Session = Depends(get_db)):
    return radar_items(db)


@app.post(
    "/api/birthdays",
    response_model=BirthdayRead,
    status_code=status.HTTP_201_CREATED,
)
def create_birthday(payload: BirthdayCreate, db: Session = Depends(get_db)):
    birthday = Birthday(**payload.model_dump())
    db.add(birthday)
    db.commit()
    db.refresh(birthday)
    touch_sync()
    return birthday


@app.post("/api/calendar/{year}/populate")
def populate_year(year: int, db: Session = Depends(get_db)):
    if not 1583 <= year <= 9999:
        raise HTTPException(status_code=422, detail="Ano fora do intervalo suportado.")
    inserted = populate_calendar_year(db, year)
    if inserted:
        touch_sync()
    return {"year": year, "inserted": inserted}


@app.get("/api/calendar/{year}", response_model=list[NativeCalendarEntryRead])
def list_calendar(year: int, db: Session = Depends(get_db)):
    if not 1583 <= year <= 9999:
        raise HTTPException(status_code=422, detail="Ano fora do intervalo suportado.")
    populate_calendar_year(db, year)
    return db.scalars(
        select(NativeCalendarEntry)
        .where(
            NativeCalendarEntry.entry_date >= date(year, 1, 1),
            NativeCalendarEntry.entry_date <= date(year, 12, 31),
        )
        .order_by(NativeCalendarEntry.entry_date)
    ).all()


@app.post(
    "/api/commutes",
    response_model=CommuteRead,
    status_code=status.HTTP_201_CREATED,
)
def add_commute(payload: CommuteCreate, db: Session = Depends(get_db)):
    commute = create_commute(db, payload)
    touch_sync()
    return commute


@app.get("/api/commutes/averages", response_model=list[CommuteAverage])
def get_commute_averages(db: Session = Depends(get_db)):
    return commute_averages(db)
