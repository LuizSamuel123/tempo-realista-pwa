const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const agenda = $("#agenda");
const backlog = $("#backlog");
const radar = $("#radar");
const radarPanel = $("#radar-panel");
const radarToggle = $("#radar-toggle");
const topRadarToggle = $("#top-radar-toggle");
const toast = $("#toast");
const infoToggleButton = $("#info-toggle");
const infoPanel = $("#info-panel");
const christmasCountdown = $("#christmas-countdown");
const christmasCountdownValue = $("#christmas-countdown-value");
const newYearCountdown = $("#new-year-countdown");
const newYearCountdownValue = $("#new-year-countdown-value");
const installAppButton = $("#install-app");
const refreshButtons = $$("[data-refresh]");
const phoneServerButton = $("#phone-server");
const appStatus = $("#app-status");
const appStatusTitle = $("#app-status-title");
const appStatusText = $("#app-status-text");
const statusInstallButton = $("#status-install");
const blockDialog = $("#block-dialog");
const milestoneDialog = $("#milestone-dialog");
const rolloverDialog = $("#rollover-dialog");
const editBlockDialog = $("#edit-block-dialog");
const deleteBlockDialog = $("#delete-block-dialog");
const dayDialog = $("#day-dialog");
const phoneServerDialog = $("#phone-server-dialog");
const phoneServerUrl = $("#phone-server-url");
const copyPhoneServerUrlButton = $("#copy-phone-server-url");
const LOCAL_STORE_KEY = "tempo-realista-celular-v1";
const COLOR_STORE_KEY = "tempo-realista-cores-v1";
const EVENT_COLOR_STORE_KEY = "tempo-realista-cores-eventos-v1";
const CALENDAR_EVENT_COLOR_STORE_KEY = "tempo-realista-cores-calendario-v1";
const API_TIMEOUT_MS = 6000;
const MONTH_SWIPE_MIN_X = 35;
const MONTH_SWIPE_MAX_Y = 80;
let visibleMonth = new Date();
visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
let loadedBlocks = [];
let loadedMilestones = [];
let loadedCalendar = [];
let selectedDay = isoDate();
let pendingDeleteBlock = null;
let deferredInstallPrompt = null;
let syncVersion = null;
let syncRefreshInFlight = false;
let localApiActive = false;
let monthSwipeStart = null;

const categoryMeta = {
  red: { dot: "🔴", label: "Concreto" },
  green: { dot: "🟢", label: "Líquido" },
  yellow: { dot: "🟡", label: "Sem data" },
};

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const longDate = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long", day: "2-digit", month: "long",
});
const monthName = new Intl.DateTimeFormat("pt-BR", {
  month: "long", year: "numeric",
});
const miniMonthName = new Intl.DateTimeFormat("pt-BR", {
  month: "short", year: "numeric",
});
const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function localDate(value) {
  return new Date(`${value}T12:00:00`);
}

function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = localDate(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function displayTime(value) {
  return value ? value.slice(0, 5) : "Horário livre";
}

function normalizedText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const blockColorPalette = ["#2563eb", "#db2777", "#059669", "#ea580c", "#7c3aed", "#0f766e", "#ca8a04", "#dc2626"];

function validHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function readJsonStore(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function writeJsonStore(key, store) {
  localStorage.setItem(key, JSON.stringify(store));
}

function colorKey(title) {
  return normalizedText(title || "").replace(/\s+/g, " ").trim();
}

function savedColor(key, title) {
  const color = readJsonStore(key)[colorKey(title)];
  return validHexColor(color) ? color : "";
}

function saveColor(key, title, color) {
  const storeKey = colorKey(title);
  if (!storeKey || !validHexColor(color)) return;
  const store = readJsonStore(key);
  store[storeKey] = color;
  writeJsonStore(key, store);
}

function presetBlockColor(title) {
  const value = normalizedText(title || "");
  if (value.includes("estagio")) return "#8b5e34";
  if (value.includes("terapia") || value.includes("jung")) return "#2563eb";
  if (value.includes("faculdade") || value.includes("aula")) return "#facc15";
  return "";
}

function presetEventColor(title) {
  const value = normalizedText(title || "");
  if (value.includes("casamento")) return "#db2777";
  if (value.includes("formatura")) return "#7c3aed";
  if (value.includes("aniversario")) return "#f59e0b";
  if (value.includes("festa")) return "#ec4899";
  return "";
}

function hashText(value) {
  return [...String(value || "")].reduce(
    (hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0,
    0
  );
}

function paletteBlockColor(block) {
  const seed = colorKey(block.title) || `${block.id || ""}`;
  return blockColorPalette[Math.abs(hashText(seed)) % blockColorPalette.length];
}

function blockColor(block) {
  return savedColor(COLOR_STORE_KEY, block.title) ||
    (validHexColor(block.color) ? block.color : "") ||
    presetBlockColor(block.title) ||
    paletteBlockColor(block);
}

function eventTitle(event) {
  return event.title || event.name || "";
}

function eventColor(event) {
  const title = eventTitle(event);
  return savedColor(EVENT_COLOR_STORE_KEY, title) ||
    savedColor(CALENDAR_EVENT_COLOR_STORE_KEY, title) ||
    (validHexColor(event.color) ? event.color : "") ||
    presetEventColor(title) ||
    "#2f2538";
}

function calendarEventColor(event) {
  const title = eventTitle(event);
  return savedColor(CALENDAR_EVENT_COLOR_STORE_KEY, title) ||
    savedColor(EVENT_COLOR_STORE_KEY, title) ||
    (validHexColor(event.color) ? event.color : "") ||
    presetEventColor(title) ||
    "#facc15";
}

function itemColor(item) {
  const title = eventTitle(item);
  if (savedColor(COLOR_STORE_KEY, title)) return blockColor({ ...item, title, category: item.category || "green" });
  if (savedColor(EVENT_COLOR_STORE_KEY, title)) return eventColor({ ...item, title });
  if (savedColor(CALENDAR_EVENT_COLOR_STORE_KEY, title)) return calendarEventColor({ ...item, name: title });
  if (item.category || presetBlockColor(title)) return blockColor({ ...item, title, category: item.category || "green" });
  if (validHexColor(item.color)) return item.color;
  if (presetEventColor(title)) return eventColor({ ...item, title });
  return paletteBlockColor({ ...item, title });
}

function resolveBlockColors(blocks) {
  return blocks.map((block) => ({ ...block, color: blockColor(block) }));
}

function resolveEventColors(events) {
  return events.map((event) => ({ ...event, color: eventColor(event) }));
}

function resolveCalendarEventColors(events) {
  return events.map((event) => ({ ...event, color: calendarEventColor(event) }));
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hexChannels(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(left, right, amount) {
  const [leftRed, leftGreen, leftBlue] = hexChannels(left);
  const [rightRed, rightGreen, rightBlue] = hexChannels(right);
  return rgbToHex(
    leftRed + (rightRed - leftRed) * amount,
    leftGreen + (rightGreen - leftGreen) * amount,
    leftBlue + (rightBlue - leftBlue) * amount
  );
}

function colorLuminance(hex) {
  const [red, green, blue] = hexChannels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function pastelStyle(color) {
  const luminance = colorLuminance(color);
  const background = luminance > 0.72 ? color : mixHex(color, "#ffffff", 0.78);
  const border = luminance > 0.72 ? mixHex(color, "#000000", 0.2) : mixHex(color, "#ffffff", 0.35);
  const accent = luminance > 0.58 ? mixHex(color, "#000000", 0.35) : color;
  return { background, border, accent };
}

function applyColor(element, color) {
  const style = pastelStyle(color);
  element.style.setProperty("--event-bg", style.background);
  element.style.setProperty("--event-border", style.border);
  element.style.setProperty("--event-accent", style.accent);
  element.style.setProperty("background", style.background, "important");
  element.style.setProperty("background-color", style.background, "important");
  element.style.setProperty("border-color", style.border, "important");
  element.style.setProperty("border-left", `4px solid ${style.accent}`, "important");
  element.style.setProperty("color", "#111827", "important");
}

function applyBlockColor(element, block) {
  applyColor(element, blockColor(block));
}

function applyChipTimeColor(element, block) {
  const style = pastelStyle(blockColor(block));
  element.style.setProperty("background", style.accent, "important");
  element.style.setProperty("background-color", style.accent, "important");
  element.style.setProperty("color", colorLuminance(style.accent) > 0.55 ? "#111827" : "#ffffff", "important");
}

function applyEventColor(element, event) {
  applyColor(element, eventColor(event));
}

function applyCalendarEventColor(element, event) {
  applyColor(element, calendarEventColor(event));
}

function colorInputDefault(title) {
  return savedColor(COLOR_STORE_KEY, title) || presetBlockColor(title) || "#2563eb";
}

function eventColorInputDefault(title) {
  return savedColor(EVENT_COLOR_STORE_KEY, title) || presetEventColor(title) || "#2f2538";
}

function resetColorChoice(form, block = null) {
  if (!form?.elements.color) return;
  form.dataset.colorTouched = "false";
  form.elements.color.value = block ? blockColor(block) : colorInputDefault(form.elements.title?.value || "");
}

function resetEventColorChoice(form, event = null) {
  if (!form?.elements.color) return;
  form.dataset.colorTouched = "false";
  form.elements.color.value = event ? eventColor(event) : eventColorInputDefault(form.elements.title?.value || "");
}

function syncColorChoiceWithTitle(form) {
  if (!form?.elements.color || form.dataset.colorTouched === "true") return;
  form.elements.color.value = colorInputDefault(form.elements.title?.value || "");
}

function syncEventColorChoiceWithTitle(form) {
  if (!form?.elements.color || form.dataset.colorTouched === "true") return;
  form.elements.color.value = eventColorInputDefault(form.elements.title?.value || "");
}

function inferredBlockIcon(block) {
  const defaultIcons = new Set([...Object.values(categoryMeta).map((item) => item.dot), "•"]);
  if (block.icon && !defaultIcons.has(block.icon)) return block.icon;
  const title = normalizedText(block.title || "");
  if (title.includes("aniversario")) return "🎂";
  if (title.includes("centro espirita")) return "👻";
  if (title.includes("terapia") || title.includes("jung")) return "🌀";
  if (title.includes("estagio")) return "🪜";
  if (title.includes("faculdade")) return "🏫";
  if (title.includes("aula")) return "🖥️";
  if (block.icon) return block.icon;
  return categoryMeta[block.category]?.dot || "•";
}

function isImageIcon(value) {
  return typeof value === "string" && /^\/static\/.+\.(png|jpe?g|webp|svg)$/i.test(value);
}

function iconElement(value, className, label = "") {
  const icon = document.createElement("span");
  icon.className = className;
  if (isImageIcon(value)) {
    const image = document.createElement("img");
    image.src = value;
    image.alt = label;
    image.loading = "lazy";
    icon.classList.add("image-icon");
    icon.append(image);
  } else {
    icon.textContent = value;
  }
  return icon;
}

function chosenBlockIcon(form, title, category) {
  const icon = form.elements.icon?.value.trim();
  return icon || inferredBlockIcon({ title, category });
}

function updateEmojiPickerSelection(form) {
  const value = form.elements.icon?.value.trim() || "";
  $$(`[data-emoji-picker="${form.id}"] [data-emoji]`).forEach((button) => {
    button.classList.toggle("selected", button.dataset.emoji === value);
  });
}

function isWeekdaySchoolOrInternship(title) {
  const value = normalizedText(title || "");
  return value.includes("aula") || value.includes("faculdade") || value.includes("estagio");
}

function isWeekdayDate(value) {
  const day = localDate(value).getDay();
  return day >= 1 && day <= 5;
}

function hasRepeatedBlocks(block) {
  return loadedBlocks.some((item) =>
    !item.completed &&
    item.id !== block.id &&
    item.title === block.title &&
    item.category === block.category
  );
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2800);
}

function plural(value, singular, pluralText) {
  return `${value} ${value === 1 ? singular : pluralText}`;
}

function christmasCountdownText(now = new Date()) {
  const target = new Date(now.getFullYear(), 11, 25, 0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  if (now.getMonth() !== 11 || diff <= 0) return "";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0 && hours > 0) {
    return `faltam ${plural(days, "dia", "dias")} e ${plural(hours, "hora", "horas")} para o Natal`;
  }
  if (days > 0) return `faltam ${plural(days, "dia", "dias")} para o Natal`;
  if (hours > 0) return `faltam ${plural(hours, "hora", "horas")} para o Natal`;
  return "falta menos de 1 hora para o Natal";
}

function newYearCountdownText(now = new Date()) {
  const target = new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  if (now.getMonth() !== 11 || diff <= 0) return "";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0 && hours > 0) {
    return `faltam ${plural(days, "dia", "dias")} e ${plural(hours, "hora", "horas")} para o Ano Novo`;
  }
  if (days > 0) return `faltam ${plural(days, "dia", "dias")} para o Ano Novo`;
  if (hours > 0) return `faltam ${plural(hours, "hora", "horas")} para o Ano Novo`;
  return "falta menos de 1 hora para o Ano Novo";
}

function updateSeasonCountdowns() {
  const text = christmasCountdownText();
  christmasCountdown.classList.toggle("hidden", !text);
  if (text) christmasCountdownValue.textContent = text;
  const newYearText = newYearCountdownText();
  newYearCountdown.classList.toggle("hidden", !newYearText);
  if (newYearText) newYearCountdownValue.textContent = newYearText;
}

function setRefreshButtonsBusy(isBusy) {
  refreshButtons.forEach((button) => {
    button.disabled = isBusy;
    button.classList.toggle("syncing", isBusy);
    button.setAttribute("aria-busy", String(isBusy));
  });
}

function toggleInfoPanel() {
  const willOpen = infoPanel.classList.contains("hidden");
  infoPanel.classList.toggle("hidden", !willOpen);
  infoToggleButton.setAttribute("aria-expanded", String(willOpen));
}

function setRadarOpen(isOpen, { scroll = false } = {}) {
  radarPanel.classList.toggle("radar-open", isOpen);
  if (radarToggle) {
    radarToggle.setAttribute("aria-expanded", String(isOpen));
    radarToggle.textContent = isOpen ? "Fechar radar" : "Abrir radar";
  }
  if (topRadarToggle) {
    topRadarToggle.setAttribute("aria-expanded", String(isOpen));
    topRadarToggle.classList.toggle("active", isOpen);
    topRadarToggle.textContent = isOpen ? "Fechar radar" : "Radar";
  }
  if (scroll && isOpen) {
    radarPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}


function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function setAppStatus({ title, text, installable = false, offline = false }) {
  appStatusTitle.textContent = title;
  appStatusText.textContent = text;
  appStatus.classList.toggle("offline", offline);
  appStatus.classList.remove("hidden");
  installAppButton.classList.toggle("hidden", !installable);
  statusInstallButton.classList.toggle("hidden", !installable);
}

function hideAppStatus() {
  appStatus.classList.add("hidden");
  installAppButton.classList.add("hidden");
  statusInstallButton.classList.add("hidden");
}

function updateConnectivityStatus() {
  if (!navigator.onLine) {
    setAppStatus({
      title: "Modo offline",
      text: "A tela continua abrindo pelo cache. Mudanças novas precisam do servidor local ativo.",
      offline: true,
    });
    return;
  }
  if (deferredInstallPrompt) {
    setAppStatus({
      title: "Instalar no dispositivo",
      text: "Abrir como app deixa a agenda mais rápida de acessar no celular e no desktop.",
      installable: true,
    });
    return;
  }
  if (isIOS() && !isStandalone()) {
    setAppStatus({
      title: "Adicionar à Tela de Início",
      text: "No Safari, use Compartilhar e escolha Adicionar à Tela de Início.",
    });
    return;
  }
  hideAppStatus();
}

async function installApp() {
  if (!deferredInstallPrompt) {
    updateConnectivityStatus();
    return;
  }
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  if (result.outcome === "accepted") {
    showToast("Instalado. Agora ele fica mais perto da mão.");
  }
  updateConnectivityStatus();
}

async function api(path, options = {}) {
  if (localApiActive) return localApi(path, options);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      signal: controller.signal,
      ...options,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const problem = new Error(body.detail || "Não foi possível salvar.");
      problem.remoteStatus = response.status;
      throw problem;
    }
    return response.status === 204 ? null : response.json();
  } catch (problem) {
    if (problem?.remoteStatus === 401 || problem?.remoteStatus === 403) {
      setAppStatus({
        title: "Acesso protegido",
        text: "Abra pelo link seguro mostrado no botão do servidor do celular.",
        offline: false,
      });
      throw problem;
    }
    localApiActive = true;
    setAppStatus({
      title: "Modo celular independente",
      text: "O app está usando os dados salvos neste Android.",
      offline: !navigator.onLine,
    });
    return localApi(path, options);
  } finally {
    clearTimeout(timeout);
  }
}


async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

async function openPhoneServer() {
  if (!phoneServerButton) return;
  phoneServerButton.disabled = true;
  try {
    const result = await api("/api/app/phone-server", { method: "POST" });
    phoneServerUrl.value = result.url;
    phoneServerDialog.showModal();
    const copied = await copyText(result.url);
    showToast(
      copied
        ? "Servidor do celular ligado. Link copiado."
        : "Servidor do celular ligado. Copie o link na tela."
    );
  } catch (problem) {
    showToast(problem.message || "Não consegui ligar o servidor do celular.");
  } finally {
    phoneServerButton.disabled = false;
  }
}

async function refreshAll({ announce = false, broadcast = false } = {}) {
  if (syncRefreshInFlight) return;
  syncRefreshInFlight = true;
  setRefreshButtonsBusy(true);
  try {
    if (broadcast) {
      const state = await api("/api/sync", { method: "POST" });
      syncVersion = state.version;
    }
    const loaded = await loadAll();
    if (announce) {
      showToast(loaded ? "Atualizado no celular e no desktop." : "Não consegui atualizar agora.");
    }
  } catch {
    if (announce) showToast("Não consegui atualizar agora.");
  } finally {
    syncRefreshInFlight = false;
    setRefreshButtonsBusy(false);
  }
}

async function checkRemoteSync() {
  if (localApiActive) return;
  try {
    const state = await api("/api/sync");
    if (syncVersion === null) {
      syncVersion = state.version;
      return;
    }
    if (state.version > syncVersion) {
      syncVersion = state.version;
      await refreshAll();
    }
  } catch {
    // A tela pode estar offline; o aviso geral de conexão cuida disso.
  }
}

function emptyLocalStore() {
  return {
    blocks: [],
    milestones: [],
    calendar: [],
    syncVersion: 0,
    nextBlockId: 1,
    nextMilestoneId: 1,
    nextLogId: 1,
  };
}

function readLocalStore() {
  try {
    return { ...emptyLocalStore(), ...JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "{}") };
  } catch {
    return emptyLocalStore();
  }
}

function writeLocalStore(store) {
  localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(store));
}

function cloneLocal(value) {
  return JSON.parse(JSON.stringify(value));
}

function touchLocal(store) {
  store.syncVersion = (store.syncVersion || 0) + 1;
}

function mirrorRemoteData(blocks, milestones, calendarItems) {
  if (localApiActive) return;
  const store = readLocalStore();
  store.blocks = cloneLocal(blocks);
  store.milestones = cloneLocal(milestones);
  store.calendar = cloneLocal(calendarItems);
  store.nextBlockId = Math.max(0, ...store.blocks.map((item) => item.id || 0)) + 1;
  store.nextMilestoneId = Math.max(0, ...store.milestones.map((item) => item.id || 0)) + 1;
  writeLocalStore(store);
}

function validateLocalInterval(payload) {
  if (payload.category === "red" && !payload.scheduled_date) {
    throw new Error("Blocos concretos precisam de uma data.");
  }
  if (Boolean(payload.start_time) !== Boolean(payload.end_time)) {
    throw new Error("Informe o horário de início e de término juntos.");
  }
  if (payload.start_time && payload.end_time && payload.end_time <= payload.start_time) {
    throw new Error("O horário final deve ser posterior ao inicial.");
  }
}

function findLocalConflict(store, payload, excludeId = null) {
  if (!payload.scheduled_date || !payload.start_time || !payload.end_time) return null;
  return store.blocks.find((item) =>
    !item.completed &&
    item.id !== excludeId &&
    item.scheduled_date === payload.scheduled_date &&
    item.start_time &&
    item.end_time &&
    payload.start_time < item.end_time &&
    item.start_time < payload.end_time
  );
}

function assertLocalNoConflict(store, payload, excludeId = null) {
  const conflict = findLocalConflict(store, payload, excludeId);
  if (conflict) {
    throw new Error(`Conflito: você já tem ${conflict.title} nesse horário.`);
  }
}

function localBlockFromPayload(store, payload) {
  validateLocalInterval(payload);
  assertLocalNoConflict(store, payload);
  return {
    id: store.nextBlockId++,
    title: payload.title,
    description: payload.description || null,
    category: payload.category,
    scheduled_date: payload.scheduled_date || null,
    start_time: payload.start_time || null,
    end_time: payload.end_time || null,
    icon: payload.icon || inferredBlockIcon(payload),
    color: validHexColor(payload.color) ? payload.color : blockColor(payload),
    completed: false,
    created_at: new Date().toISOString(),
  };
}

function sortLocalBlocks(blocks) {
  return blocks.sort((left, right) =>
    String(left.scheduled_date || "").localeCompare(String(right.scheduled_date || "")) ||
    String(left.start_time || "").localeCompare(String(right.start_time || "")) ||
    left.title.localeCompare(right.title)
  );
}

function localRadarItems(store) {
  const today = isoDate();
  const limit = addDays(today, 20);
  const items = [];
  store.milestones
    .filter((item) => !item.completed && item.event_date >= today && item.event_date <= limit)
    .forEach((item) => {
      const days = Math.round((localDate(item.event_date) - localDate(today)) / 86400000);
      const icon = { exam: "💀", seminar: "🎤", simple_assignment: "📓" }[item.kind] || "";
      items.push({
        id: item.id,
        title: item.title,
        event_date: item.event_date,
        days_remaining: days,
        message: radarDaysLabel(days),
        icon: `⚫${icon}`,
        color: eventColor(item),
      });
    });
  store.blocks
    .filter((item) => !item.completed && item.scheduled_date >= today && item.scheduled_date <= limit)
    .forEach((item) => {
      const days = Math.round((localDate(item.scheduled_date) - localDate(today)) / 86400000);
      items.push({
        id: item.id,
        title: item.title,
        event_date: item.scheduled_date,
        days_remaining: days,
        message: radarDaysLabel(days),
        icon: inferredBlockIcon(item),
        category: item.category,
        color: blockColor(item),
      });
    });
  return items.sort((left, right) =>
    left.event_date.localeCompare(right.event_date) ||
    left.days_remaining - right.days_remaining ||
    left.title.localeCompare(right.title)
  );
}

async function localApi(path, options = {}) {
  const method = options.method || "GET";
  const url = new URL(path, window.location.origin);
  const body = options.body ? JSON.parse(options.body) : {};
  const store = readLocalStore();
  const blockMatch = url.pathname.match(/^\/api\/blocks\/(\d+)$/);
  const completeMatch = url.pathname.match(/^\/api\/blocks\/(\d+)\/complete$/);
  const rolloverMatch = url.pathname.match(/^\/api\/blocks\/(\d+)\/rollover$/);
  const seriesMatch = url.pathname.match(/^\/api\/blocks\/(\d+)\/series$/);
  const weekdaySeriesMatch = url.pathname.match(/^\/api\/blocks\/(\d+)\/weekday-series$/);
  const milestoneMatch = url.pathname.match(/^\/api\/black-events\/(\d+)$/);

  if (url.pathname === "/api/sync" && method === "GET") return { version: store.syncVersion };
  if (url.pathname === "/api/sync" && method === "POST") {
    touchLocal(store);
    writeLocalStore(store);
    return { version: store.syncVersion };
  }
  if (url.pathname === "/api/blocks" && method === "GET") return sortLocalBlocks(cloneLocal(store.blocks));
  if (url.pathname === "/api/blocks" && method === "POST") {
    const block = localBlockFromPayload(store, body);
    store.blocks.push(block);
    touchLocal(store);
    writeLocalStore(store);
    return cloneLocal(block);
  }
  if (blockMatch && method === "PATCH") {
    const id = Number(blockMatch[1]);
    const index = store.blocks.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Not Found");
    validateLocalInterval(body);
    assertLocalNoConflict(store, body, id);
    store.blocks[index] = { ...store.blocks[index], ...body, icon: body.icon || inferredBlockIcon(body) };
    touchLocal(store);
    writeLocalStore(store);
    return cloneLocal(store.blocks[index]);
  }
  if (blockMatch && method === "DELETE") {
    const id = Number(blockMatch[1]);
    const before = store.blocks.length;
    store.blocks = store.blocks.filter((item) => item.id !== id);
    if (store.blocks.length === before) throw new Error("Not Found");
    touchLocal(store);
    writeLocalStore(store);
    return null;
  }
  if (completeMatch && method === "POST") {
    const block = store.blocks.find((item) => item.id === Number(completeMatch[1]));
    if (!block) throw new Error("Not Found");
    block.completed = true;
    touchLocal(store);
    writeLocalStore(store);
    return cloneLocal(block);
  }
  if (rolloverMatch && method === "POST") {
    const block = store.blocks.find((item) => item.id === Number(rolloverMatch[1]));
    if (!block) throw new Error("Not Found");
    const payload = { ...block, scheduled_date: body.new_date || null };
    assertLocalNoConflict(store, payload, block.id);
    const previousDate = block.scheduled_date;
    block.scheduled_date = body.new_date || null;
    touchLocal(store);
    writeLocalStore(store);
    return {
      id: store.nextLogId++,
      time_block_id: block.id,
      previous_date: previousDate,
      new_date: block.scheduled_date,
      reason: body.reason,
      created_at: new Date().toISOString(),
    };
  }
  if (seriesMatch && method === "DELETE") {
    const block = store.blocks.find((item) => item.id === Number(seriesMatch[1]));
    if (!block) throw new Error("Not Found");
    const scope = url.searchParams.get("scope") || "from_date";
    const before = store.blocks.length;
    store.blocks = store.blocks.filter((item) => {
      if (item.completed || item.title !== block.title || item.category !== block.category) return true;
      if (scope === "all") return false;
      return !(item.scheduled_date && block.scheduled_date && item.scheduled_date >= block.scheduled_date);
    });
    const deleted = before - store.blocks.length;
    if (deleted) touchLocal(store);
    writeLocalStore(store);
    return { deleted };
  }
  if (weekdaySeriesMatch && method === "PATCH") {
    const block = store.blocks.find((item) => item.id === Number(weekdaySeriesMatch[1]));
    if (!block) throw new Error("Not Found");
    const candidates = store.blocks.filter((item) =>
      !item.completed &&
      item.title === block.title &&
      item.category === block.category &&
      item.scheduled_date &&
      (body.scope === "all" || (
        item.scheduled_date >= block.scheduled_date &&
        item.scheduled_date <= body.range_end &&
        isWeekdayDate(item.scheduled_date)
      ))
    );
    candidates.forEach((item) => {
      const payload = { ...item, ...body, scheduled_date: item.scheduled_date };
      validateLocalInterval(payload);
      assertLocalNoConflict(store, payload, item.id);
    });
    candidates.forEach((item) => Object.assign(item, body, { icon: body.icon || inferredBlockIcon(body) }));
    if (candidates.length) touchLocal(store);
    writeLocalStore(store);
    return { updated: candidates.length };
  }
  if (url.pathname === "/api/black-events" && method === "GET") {
    return cloneLocal(store.milestones.filter((item) => !item.completed).sort((a, b) => a.event_date.localeCompare(b.event_date)));
  }
  if (url.pathname === "/api/black-events" && method === "POST") {
    const milestone = {
      id: store.nextMilestoneId++,
      title: body.title,
      description: body.description || null,
      kind: body.kind,
      event_date: body.event_date,
      completed: false,
      important: body.important ?? true,
      email_lead_days: body.email_lead_days || 5,
      color: validHexColor(body.color) ? body.color : eventColor(body),
      created_at: new Date().toISOString(),
    };
    store.milestones.push(milestone);
    touchLocal(store);
    writeLocalStore(store);
    return cloneLocal(milestone);
  }
  if (milestoneMatch && method === "PATCH") {
    const id = Number(milestoneMatch[1]);
    const index = store.milestones.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Not Found");
    store.milestones[index] = {
      ...store.milestones[index],
      ...body,
      color: validHexColor(body.color) ? body.color : eventColor(body),
    };
    touchLocal(store);
    writeLocalStore(store);
    return cloneLocal(store.milestones[index]);
  }
  if (milestoneMatch && method === "DELETE") {
    const before = store.milestones.length;
    store.milestones = store.milestones.filter((item) => item.id !== Number(milestoneMatch[1]));
    if (store.milestones.length === before) throw new Error("Not Found");
    touchLocal(store);
    writeLocalStore(store);
    return null;
  }
  if (url.pathname === "/api/radar" && method === "GET") return localRadarItems(store);
  if (url.pathname.startsWith("/api/calendar/") && method === "GET") return cloneLocal(store.calendar || []);
  throw new Error("Not Found");
}

async function deleteBlockById(id) {
  try {
    await api(`/api/blocks/${id}`, { method: "DELETE" });
    return true;
  } catch (problem) {
    if (problem.message === "Not Found") return false;
    throw problem;
  }
}

async function deleteMatchingLoadedBlocks(scope) {
  if (!pendingDeleteBlock) return { deleted: 0 };
  const sameSeries = (item) =>
    !item.completed &&
    item.title === pendingDeleteBlock.title &&
    item.category === pendingDeleteBlock.category;
  const candidates = loadedBlocks.filter((item) => {
    if (!sameSeries(item)) return false;
    if (scope === "all") return true;
    return Boolean(item.scheduled_date && pendingDeleteBlock.scheduled_date &&
      item.scheduled_date >= pendingDeleteBlock.scheduled_date);
  });
  let deleted = 0;
  for (const item of candidates) {
    if (await deleteBlockById(item.id)) deleted += 1;
  }
  return { deleted };
}

function emptyMessage(text) {
  const message = document.createElement("p");
  message.className = "empty";
  message.textContent = text;
  return message;
}

function actionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function eventColorPicker(label, value, onChange) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  input.title = label;
  input.setAttribute("aria-label", label);
  input.addEventListener("input", (event) => onChange(event.target.value));
  return input;
}

function blockCard(block) {
  const card = document.createElement("article");
  card.className = "block-card custom-color";
  applyBlockColor(card, block);

  const time = document.createElement("div");
  time.className = "block-time";
  time.textContent = block.start_time
    ? `${displayTime(block.start_time)}${block.end_time ? `–${displayTime(block.end_time)}` : ""}`
    : "Livre";

  const content = document.createElement("div");
  content.className = "block-content";
  const title = document.createElement("h3");
  title.className = "block-title";
  const icon = iconElement(inferredBlockIcon(block), "block-emoji", block.title);
  const titleText = document.createElement("span");
  titleText.textContent = block.title;
  title.append(icon, titleText);
  const meta = document.createElement("p");
  meta.textContent = `${categoryMeta[block.category].dot} ${categoryMeta[block.category].label}`;
  content.append(title, meta);
  if (block.description) {
    const description = document.createElement("p");
    description.className = "block-description";
    description.textContent = block.description;
    content.append(description);
  }

  const actions = document.createElement("div");
  actions.className = "block-actions";
  actions.append(actionButton("✓", "mini-button complete", async () => {
    await api(`/api/blocks/${block.id}/complete`, { method: "POST" });
    if (dayDialog.open) dayDialog.close();
    showToast("Feito. Pode soltar esse peso.");
    await loadAll();
  }));
  if (block.category !== "red") {
    actions.append(actionButton("Mover", "mini-button", () => openRollover(block)));
  }
  actions.append(actionButton("Editar", "mini-button", () => openEditBlock(block)));
  actions.append(actionButton("×", "mini-button remove", () => openDeleteBlock(block)));

  card.append(time, content, actions);
  return card;
}

function calendarChip(text, className, onClick) {
  const chip = document.createElement(onClick ? "button" : "div");
  if (onClick) chip.type = "button";
  chip.className = `calendar-chip ${className}`;
  chip.textContent = text;
  if (onClick) chip.addEventListener("click", onClick);
  return chip;
}

function blockCalendarChip(block, value) {
  const chip = calendarChip("", "custom-color", () => openDay(value));
  applyBlockColor(chip, block);
  const time = document.createElement("span");
  time.className = "chip-time";
  time.textContent = block.start_time ? displayTime(block.start_time) : "•";
  applyChipTimeColor(time, block);
  const icon = iconElement(inferredBlockIcon(block), "chip-emoji", block.title);
  const title = document.createElement("span");
  title.className = "chip-title";
  title.textContent = block.title;
  chip.append(time, icon, title);
  return chip;
}

function eventCalendarChip(event, value) {
  const chip = calendarChip(`⚫ ${event.title}`, "custom-color event-color", () => openDay(value));
  applyEventColor(chip, event);
  return chip;
}

function holidayCalendarChip(event, value) {
  const chip = calendarChip(`${event.icon || "🟡"} ${event.name}`, "custom-color event-color", () => openDay(value));
  applyCalendarEventColor(chip, event);
  return chip;
}

function monthFromVisible(offset) {
  return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
}

function dominantDateKind(value, blocks, milestones, calendarItems) {
  if (milestones.some((item) => item.event_date === value)) return "black";
  const block = blocks.find((item) => !item.completed && item.scheduled_date === value);
  if (block) return block.category;
  if (calendarItems.some((item) => item.entry_date === value)) return "holiday";
  return "";
}

function miniCalendarMarkers(value, blocks, milestones, calendarItems) {
  return [
    ...blocks
      .filter((item) => !item.completed && item.scheduled_date === value)
      .map((item) => ({ className: item.category, color: blockColor(item) })),
    ...milestones
      .filter((item) => item.event_date === value)
      .map((item) => ({ className: "event", color: eventColor(item) })),
    ...calendarItems
      .filter((item) => item.entry_date === value)
      .map((item) => ({ className: "holiday", color: calendarEventColor(item) })),
  ];
}

function renderMiniCalendar(month, blocks, milestones, calendarItems) {
  const today = isoDate();
  const wrapper = document.createElement("section");
  wrapper.className = "mini-calendar";

  const title = document.createElement("button");
  title.type = "button";
  title.className = "mini-calendar-title";
  title.textContent = miniMonthName.format(month);
  title.addEventListener("click", () => {
    navigateToMonth(month);
  });
  wrapper.append(title);

  const weekdays = document.createElement("div");
  weekdays.className = "mini-calendar-weekdays";
  weekLabels.forEach((name) => {
    const label = document.createElement("span");
    label.textContent = name.slice(0, 1);
    weekdays.append(label);
  });
  wrapper.append(weekdays);

  const grid = document.createElement("div");
  grid.className = "mini-calendar-grid";
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = isoDate(date);
    const markers = miniCalendarMarkers(value, blocks, milestones, calendarItems);
    const day = document.createElement("button");
    day.type = "button";
    day.className = `mini-calendar-day${date.getMonth() !== month.getMonth() ? " outside" : ""}${value === today ? " today" : ""}`;
    const number = document.createElement("span");
    number.className = "mini-calendar-number";
    number.textContent = date.getDate();
    const markerRow = document.createElement("span");
    markerRow.className = "mini-calendar-markers";
    markers.forEach((marker) => {
      const dot = document.createElement("span");
      dot.className = `mini-calendar-marker ${marker.className}`;
      if (marker.color) {
        dot.style.setProperty("background", marker.color, "important");
        dot.style.setProperty("background-color", marker.color, "important");
        dot.style.setProperty("border-color", marker.color, "important");
      }
      markerRow.append(dot);
    });
    day.append(number, markerRow);
    day.setAttribute("aria-label", `Ver ${longDate.format(date)}`);
    day.addEventListener("click", () => openDay(value));
    grid.append(day);
  }
  wrapper.append(grid);
  return wrapper;
}

function openDay(value) {
  selectedDay = value;
  $("#day-dialog-title").textContent = longDate.format(localDate(value));
  const container = $("#day-dialog-items");
  container.replaceChildren();

  const blocks = loadedBlocks
    .filter((item) => !item.completed && item.scheduled_date === value)
    .sort((a, b) => (a.start_time || "99:99").localeCompare(b.start_time || "99:99"));
  const milestones = loadedMilestones.filter((item) => item.event_date === value);
  const calendarItems = loadedCalendar.filter((item) => item.entry_date === value);

  blocks.forEach((item) => container.append(blockCard(item)));
  milestones.forEach((item) => {
    const row = document.createElement("div");
    row.className = "day-special event-color";
    row.textContent = `⚫ ${item.title}`;
    applyEventColor(row, item);
    row.append(eventColorPicker(`Cor de ${item.title}`, eventColor(item), (color) => {
      saveColor(EVENT_COLOR_STORE_KEY, item.title, color);
      item.color = color;
      loadedMilestones = resolveEventColors(loadedMilestones);
      renderAgenda(loadedBlocks, loadedMilestones, loadedCalendar);
      renderRadar(localRadarItems({
        ...emptyLocalStore(),
        blocks: loadedBlocks,
        milestones: loadedMilestones,
      }));
    }));
    container.append(row);
  });
  calendarItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "day-special event-color";
    row.textContent = `${item.icon || "🟡"} ${item.name}`;
    applyCalendarEventColor(row, item);
    row.append(eventColorPicker(`Cor de ${item.name}`, calendarEventColor(item), (color) => {
      saveColor(CALENDAR_EVENT_COLOR_STORE_KEY, item.name, color);
      item.color = color;
      loadedCalendar = resolveCalendarEventColors(loadedCalendar);
      renderAgenda(loadedBlocks, loadedMilestones, loadedCalendar);
    }));
    container.append(row);
  });

  if (!blocks.length && !milestones.length && !calendarItems.length) {
    container.append(emptyMessage("Nada marcado neste dia."));
  }
  dayDialog.showModal();
}

function renderAgenda(blocks, milestones, calendarItems) {
  agenda.replaceChildren();
  const today = isoDate();
  $("#agenda-title").textContent = monthName.format(visibleMonth);

  const weekdayHeader = document.createElement("div");
  weekdayHeader.className = "calendar-weekdays";
  weekLabels.forEach((name) => {
    const label = document.createElement("span");
    label.textContent = name;
    weekdayHeader.append(label);
  });

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const sundayOffset = firstDay.getDay();
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - sundayOffset);

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = isoDate(date);
    const outside = date.getMonth() !== visibleMonth.getMonth();
    const day = document.createElement("section");
    day.className = `calendar-day${outside ? " outside" : ""}${value === today ? " today" : ""}`;
    day.dataset.date = value;

    const dayNumber = document.createElement("button");
    dayNumber.type = "button";
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = date.getDate();
    dayNumber.setAttribute("aria-label", `Ver ${longDate.format(date)}`);
    dayNumber.addEventListener("click", () => openDay(value));
    day.append(dayNumber);

    const entries = [];
    blocks
      .filter((item) => !item.completed && item.scheduled_date === value)
      .sort((a, b) => (a.start_time || "99:99").localeCompare(b.start_time || "99:99"))
      .forEach((item) => entries.push({
        node: blockCalendarChip(item, value),
      }));
    milestones
      .filter((item) => item.event_date === value)
      .forEach((item) => entries.push({
        node: eventCalendarChip(item, value),
      }));
    calendarItems
      .filter((item) => item.entry_date === value)
      .forEach((item) => entries.push({
        node: holidayCalendarChip(item, value),
      }));

    entries.slice(0, 3).forEach((entry) => day.append(entry.node));
    if (entries.length > 3) {
      day.append(calendarChip(`+${entries.length - 3} itens`, "more", () => openDay(value)));
    }
    day.addEventListener("click", (event) => {
      if (!event.target.closest("button")) openDay(value);
    });
    day.addEventListener("dblclick", () => openDay(value));
    grid.append(day);
  }
  const currentCalendar = document.createElement("div");
  currentCalendar.className = "current-calendar";
  currentCalendar.append(weekdayHeader, grid);

  const context = document.createElement("aside");
  context.className = "calendar-context";
  context.append(
    renderMiniCalendar(monthFromVisible(-1), blocks, milestones, calendarItems),
    renderMiniCalendar(monthFromVisible(1), blocks, milestones, calendarItems),
  );

  const calendarLayout = document.createElement("div");
  calendarLayout.className = "calendar-layout";
  calendarLayout.append(radarPanel, currentCalendar, context);
  agenda.append(calendarLayout);

  const todayCount =
    blocks.filter((item) => !item.completed && item.scheduled_date === today).length +
    milestones.filter((item) => item.event_date === today).length +
    calendarItems.filter((item) => item.entry_date === today).length;
  $("#bell-dot").classList.toggle("hidden", todayCount === 0);
}

function renderBacklog(blocks) {
  backlog.replaceChildren();
  const items = blocks.filter((item) =>
    !item.completed && item.category === "yellow" && !item.scheduled_date
  );
  if (!items.length) {
    backlog.append(emptyMessage("Nenhum item sem data."));
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "backlog-item";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const schedule = actionButton("Alocar", "text-button", () => openRollover(item));
    row.append(title, schedule);
    backlog.append(row);
  });
}

function radarDaysLabel(days) {
  if (days === 0) return "é hoje";
  return `faltam ${days} ${days === 1 ? "dia" : "dias"}`;
}

async function openRadarItem(item) {
  const targetDate = item.event_date || item.scheduled_date || item.entry_date || isoDate();
  const block = loadedBlocks.find((candidate) =>
    !candidate.completed &&
    candidate.title === item.title &&
    candidate.scheduled_date === targetDate
  );

  if (block) {
    openEditBlock(block);
    return;
  }

  const milestone = loadedMilestones.find((candidate) =>
    candidate.title === item.title &&
    candidate.event_date === targetDate
  );
  if (milestone) {
    openEditMilestone(milestone);
    return;
  }

  const targetMonth = localDate(targetDate);
  const shouldChangeMonth =
    targetMonth.getFullYear() !== visibleMonth.getFullYear() ||
    targetMonth.getMonth() !== visibleMonth.getMonth();
  if (shouldChangeMonth) {
    visibleMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
    await loadAll();
  }
  openDay(targetDate);
}

function renderRadar(items) {
  radar.replaceChildren();
  if (!items.length) {
    radar.append(emptyMessage("Nenhum compromisso ou marco nos próximos 20 dias."));
    return;
  }
  items.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "radar-card";
    card.setAttribute("aria-label", `Abrir ${item.title}`);
    applyColor(card, itemColor(item));
    const icon = iconElement(item.icon, "radar-icon", item.title);
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.title;
    const count = document.createElement("strong");
    count.textContent = radarDaysLabel(item.days_remaining);
    const date = document.createElement("small");
    date.textContent = shortDate.format(localDate(item.event_date));
    copy.append(title, count, date);
    card.append(icon, copy);
    card.addEventListener("click", () => openRadarItem(item));
    radar.append(card);
  });
}

async function loadAll() {
  try {
    const year = visibleMonth.getFullYear();
    const calendarYears = [
      ...new Set([year, monthFromVisible(-1).getFullYear(), monthFromVisible(1).getFullYear()]),
    ];
    const [blocks, radarItems, milestones, calendarYearItems] = await Promise.all([
      api("/api/blocks"),
      api("/api/radar"),
      api("/api/black-events"),
      Promise.all(calendarYears.map((itemYear) => api(`/api/calendar/${itemYear}`))),
    ]);
    const coloredBlocks = resolveBlockColors(blocks);
    const coloredMilestones = resolveEventColors(milestones);
    const calendarItems = resolveCalendarEventColors(calendarYearItems.flat());
    mirrorRemoteData(coloredBlocks, coloredMilestones, calendarItems);
    loadedBlocks = coloredBlocks;
    loadedMilestones = coloredMilestones;
    loadedCalendar = calendarItems;
    renderAgenda(coloredBlocks, coloredMilestones, calendarItems);
    renderBacklog(coloredBlocks);
    renderRadar(radarItems);
    return true;
  } catch {
    agenda.replaceChildren(emptyMessage("Não consegui carregar sua agenda agora."));
    return false;
  }
}

function navigateToMonth(month) {
  visibleMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  loadAll();
}

function navigateByMonthOffset(offset) {
  navigateToMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1));
}

function startMonthSwipeFromPoint(point) {
  monthSwipeStart = {
    x: point.clientX,
    y: point.clientY,
    time: Date.now(),
  };
}

function maybeHoldMonthSwipe(point, event) {
  if (!monthSwipeStart) return;
  const deltaX = point.clientX - monthSwipeStart.x;
  const deltaY = point.clientY - monthSwipeStart.y;
  if (Math.abs(deltaX) > 18 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
    event?.preventDefault?.();
  }
}

function finishMonthSwipeFromPoint(point) {
  if (!monthSwipeStart) return;
  const deltaX = point.clientX - monthSwipeStart.x;
  const deltaY = point.clientY - monthSwipeStart.y;
  monthSwipeStart = null;
  if (Math.abs(deltaX) < MONTH_SWIPE_MIN_X || Math.abs(deltaY) > MONTH_SWIPE_MAX_Y) return;
  navigateByMonthOffset(deltaX > 0 ? 1 : -1);
}

function startMonthSwipe(event) {
  if (event.touches?.length !== 1) return;
  startMonthSwipeFromPoint(event.touches[0]);
}

function moveMonthSwipe(event) {
  if (event.touches?.length !== 1) return;
  maybeHoldMonthSwipe(event.touches[0], event);
}

function finishMonthSwipe(event) {
  if (event.changedTouches?.length !== 1) return;
  finishMonthSwipeFromPoint(event.changedTouches[0]);
}

function cancelMonthSwipe() {
  monthSwipeStart = null;
}

function startMonthPointerSwipe(event) {
  if (event.pointerType === "mouse") return;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  startMonthSwipeFromPoint(event);
}

function moveMonthPointerSwipe(event) {
  if (event.pointerType === "mouse") return;
  maybeHoldMonthSwipe(event, event);
}

function finishMonthPointerSwipe(event) {
  if (event.pointerType === "mouse") return;
  finishMonthSwipeFromPoint(event);
}

function openRollover(block) {
  const form = $("#rollover-form");
  form.reset();
  form.elements.block_id.value = block.id;
  $("#rollover-title").textContent = block.title;
  $("#rollover-date").value = block.scheduled_date || isoDate();
  rolloverDialog.showModal();
}

function openEditBlock(block) {
  const form = $("#edit-block-form");
  form.reset();
  form.elements.block_id.value = block.id;
  form.elements.title.value = block.title;
  form.elements.icon.value = inferredBlockIcon(block);
  form.elements.category.value = block.category;
  form.elements.scheduled_date.value = block.scheduled_date || "";
  form.elements.start_time.value = block.start_time || "";
  form.elements.end_time.value = block.end_time || "";
  form.elements.description.value = block.description || "";
  form.elements.range_end.value = block.scheduled_date ? addDays(block.scheduled_date, 14) : "";
  resetColorChoice(form, block);
  const defaultScope = hasRepeatedBlocks(block) || isWeekdaySchoolOrInternship(block.title) ? "all" : "single";
  $("#edit-scope").value = defaultScope;
  $("#edit-date-wrap").classList.toggle("hidden", defaultScope !== "single");
  $("#edit-range-wrap").classList.add("hidden");
  form.elements.range_end.required = false;
  $("#edit-block-error").textContent = "";
  updateEmojiPickerSelection(form);
  editBlockDialog.showModal();
}

function openEditMilestone(milestone) {
  const form = $("#milestone-form");
  form.reset();
  form.elements.event_id.value = milestone.id;
  form.elements.title.value = milestone.title;
  form.elements.kind.value = milestone.kind;
  form.elements.event_date.value = milestone.event_date;
  form.elements.description.value = milestone.description || "";
  resetEventColorChoice(form, milestone);
  $("#milestone-dialog-title").textContent = "Editar marco";
  $("#milestone-submit").textContent = "Salvar alterações";
  $("#milestone-error").textContent = "";
  milestoneDialog.showModal();
}

function openDeleteBlock(block) {
  pendingDeleteBlock = block;
  const form = $("#delete-block-form");
  form.reset();
  form.elements.block_id.value = block.id;
  form.elements.scope.value = block.scheduled_date ? "from_date" : "all";
  $("#delete-block-title").textContent = block.title;
  $("#delete-block-error").textContent = "";
  deleteBlockDialog.showModal();
}

$$("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.open);
    if (dialog === blockDialog) {
      const form = $("#block-form");
      form.reset();
      form.elements.icon.value = "";
      resetColorChoice(form);
      updateEmojiPickerSelection(form);
      $("#block-date").value = isoDate();
      $("#repeat-until").value = addDays(isoDate(), 120);
    }
    if (dialog === milestoneDialog) {
      const form = $("#milestone-form");
      form.reset();
      form.elements.event_id.value = "";
      resetEventColorChoice(form);
      $("#milestone-dialog-title").textContent = "Adicionar ao Radar";
      $("#milestone-submit").textContent = "Salvar marco";
      $("#milestone-error").textContent = "";
      $("#milestone-date").value = isoDate();
    }
    dialog.showModal();
  });
});

$("#add-to-day").addEventListener("click", () => {
  dayDialog.close();
  const form = $("#block-form");
  form.reset();
  form.elements.icon.value = "";
  resetColorChoice(form);
  updateEmojiPickerSelection(form);
  $("#repeat-until-wrap").classList.add("hidden");
  $("#block-date").required = true;
  $("#block-date").value = selectedDay;
  $("#repeat-until").value = addDays(selectedDay, 120);
  blockDialog.showModal();
});

$$("[data-close]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

$$("[data-emoji-picker]").forEach((picker) => {
  const form = $(`#${picker.dataset.emojiPicker}`);
  picker.addEventListener("click", (event) => {
    const button = event.target.closest("[data-emoji]");
    if (!button || !form) return;
    form.elements.icon.value = button.dataset.emoji;
    updateEmojiPickerSelection(form);
  });
  form?.elements.icon?.addEventListener("input", () => updateEmojiPickerSelection(form));
});

[$("#block-form"), $("#edit-block-form")].forEach((form) => {
  form?.elements.color?.addEventListener("input", () => {
    form.dataset.colorTouched = "true";
  });
  form?.elements.title?.addEventListener("input", () => syncColorChoiceWithTitle(form));
});

[$("#milestone-form")].forEach((form) => {
  form?.elements.color?.addEventListener("input", () => {
    form.dataset.colorTouched = "true";
  });
  form?.elements.title?.addEventListener("input", () => syncEventColorChoiceWithTitle(form));
});

$$("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

$("#repeat-weekly").addEventListener("change", (event) => {
  $("#repeat-until-wrap").classList.toggle("hidden", !event.target.checked);
  $("#repeat-until").required = event.target.checked;
});

$$('input[name="category"]').forEach((input) => {
  input.addEventListener("change", () => {
    const dateInput = $("#block-date");
    dateInput.required = input.value !== "yellow";
  });
});

$('#block-form input[name="title"]').addEventListener("input", (event) => {
  if (!isWeekdaySchoolOrInternship(event.target.value)) return;
  $("#repeat-weekly").checked = true;
  $("#repeat-until-wrap").classList.remove("hidden");
  $("#repeat-until").required = true;
  $("#repeat-interval").value = "weekdays";
  if (!$("#repeat-until").value) {
    $("#repeat-until").value = addDays($("#block-date").value || isoDate(), 120);
  }
});

$("#block-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = $("#block-error");
  error.textContent = "";
const data = new FormData(form);
  const startDate = data.get("scheduled_date");
  const repeating = data.get("repeat_weekly") === "on";
  const until = data.get("repeat_until");
  const repeatMode = data.get("repeat_interval") || "weekdays";
  const dates = startDate ? [startDate] : [null];

  if (repeating && startDate && until) {
    dates.length = 0;
    if (repeatMode === "weekdays") {
      let next = startDate;
      while (next <= until && dates.length < 180) {
        if (isWeekdayDate(next)) dates.push(next);
        next = addDays(next, 1);
      }
    } else {
      const repeatInterval = Number(repeatMode);
      let next = startDate;
      while (next <= until && dates.length < 60) {
        dates.push(next);
        next = addDays(next, 7 * repeatInterval);
      }
    }
  }

  const payloadBase = {
    title: data.get("title").trim(),
    description: data.get("description").trim() || null,
    category: data.get("category"),
    start_time: data.get("start_time") || null,
    end_time: data.get("end_time") || null,
    icon: chosenBlockIcon(form, data.get("title").trim(), data.get("category")),
    color: data.get("color"),
  };

  try {
    if ((payloadBase.start_time && !payloadBase.end_time) ||
        (!payloadBase.start_time && payloadBase.end_time)) {
      throw new Error("Informe o horário de início e de término juntos.");
    }
    if (!dates.length) {
      throw new Error("Nenhum dia útil encontrado nesse intervalo.");
    }
    saveColor(COLOR_STORE_KEY, payloadBase.title, data.get("color"));
    await Promise.all(dates.map((scheduled_date) =>
      api("/api/blocks", {
        method: "POST",
        body: JSON.stringify({ ...payloadBase, scheduled_date }),
      })
    ));
    form.reset();
    $("#repeat-until-wrap").classList.add("hidden");
    blockDialog.close();
    const cadence =
      repeatMode === "weekdays" ? "dias úteis" :
      repeatMode === "2" ? "datas quinzenais" :
      "semanas";
    showToast(dates.length > 1 ? `${dates.length} ${cadence} adicionados.` : "Adicionado à sua agenda.");
    await loadAll();
  } catch (problem) {
    error.textContent = problem.message;
  }
});

$("#milestone-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const error = $("#milestone-error");
  error.textContent = "";
  const eventId = data.get("event_id");
  const title = data.get("title").trim();
  const color = data.get("color");
  try {
    saveColor(EVENT_COLOR_STORE_KEY, title, color);
    const payload = {
      title,
      description: data.get("description").trim() || null,
      kind: data.get("kind"),
      event_date: data.get("event_date"),
      color,
      important: true,
      email_lead_days: 5,
    };
    await api(eventId ? `/api/black-events/${eventId}` : "/api/black-events", {
      method: eventId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    milestoneDialog.close();
    showToast(eventId ? "Marco atualizado no Radar." : "Marco salvo no Radar.");
    await loadAll();
  } catch (problem) {
    error.textContent = problem.message;
  }
});

$("#rollover-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const error = $("#rollover-error");
  error.textContent = "";
  try {
    await api(`/api/blocks/${data.get("block_id")}/rollover`, {
      method: "POST",
      body: JSON.stringify({
        new_date: data.get("new_date"),
        reason: data.get("reason"),
      }),
    });
    rolloverDialog.close();
    showToast("Movido. Sem punição, só informação.");
    await loadAll();
  } catch (problem) {
    error.textContent = problem.message;
  }
});

$("#edit-scope").addEventListener("change", (event) => {
  const scope = event.target.value;
  $("#edit-date-wrap").classList.toggle("hidden", scope !== "single");
  $("#edit-range-wrap").classList.toggle("hidden", scope !== "weekdays_until");
  $("#edit-block-form").elements.range_end.required = scope === "weekdays_until";
});

$("#edit-block-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const error = $("#edit-block-error");
  error.textContent = "";
  const scope = data.get("scope");
  const basePayload = {
    title: data.get("title").trim(),
    description: data.get("description").trim() || null,
    category: data.get("category"),
    start_time: data.get("start_time") || null,
    end_time: data.get("end_time") || null,
    icon: chosenBlockIcon(form, data.get("title").trim(), data.get("category")),
    color: data.get("color"),
  };
  try {
    saveColor(COLOR_STORE_KEY, basePayload.title, data.get("color"));
    let result = null;
    if (scope === "single") {
      result = await api(`/api/blocks/${data.get("block_id")}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...basePayload,
          scheduled_date: data.get("scheduled_date") || null,
        }),
      });
    } else {
      const rangeEnd =
        scope === "all"
          ? null
          : scope === "weekdays_15"
          ? addDays(data.get("scheduled_date") || selectedDay, 14)
          : data.get("range_end");
      result = await api(`/api/blocks/${data.get("block_id")}/weekday-series`, {
        method: "PATCH",
        body: JSON.stringify({
          ...basePayload,
          range_end: rangeEnd,
          scope: scope === "all" ? "all" : "range",
        }),
      });
    }
    editBlockDialog.close();
    if (dayDialog.open) dayDialog.close();
    showToast(result?.updated ? `${result.updated} compromissos atualizados.` : "Compromisso atualizado.");
    await loadAll();
  } catch (problem) {
    error.textContent = problem.message;
  }
});

$("#delete-block-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const error = $("#delete-block-error");
  error.textContent = "";
  try {
    const scope = data.get("scope");
    let result = null;
    if (scope === "single") {
      const deleted = await deleteBlockById(data.get("block_id"));
      result = { deleted: deleted ? 1 : 0 };
    } else {
      try {
        result = await api(`/api/blocks/${data.get("block_id")}/series?scope=${scope}`, {
          method: "DELETE",
        });
      } catch (problem) {
        if (problem.message !== "Not Found") throw problem;
        result = await deleteMatchingLoadedBlocks(scope);
      }
    }
    deleteBlockDialog.close();
    pendingDeleteBlock = null;
    if (dayDialog.open) dayDialog.close();
    showToast(
      result.deleted
        ? `${result.deleted} compromisso${result.deleted === 1 ? "" : "s"} removido${result.deleted === 1 ? "" : "s"}.`
        : "Esse compromisso já não estava mais na agenda."
    );
    await loadAll();
  } catch (problem) {
    error.textContent = problem.message;
  }
});

$("#previous-month").addEventListener("click", () => {
  navigateByMonthOffset(-1);
});
$("#next-month").addEventListener("click", () => {
  navigateByMonthOffset(1);
});
$("#current-month").addEventListener("click", () => {
  const now = new Date();
  navigateToMonth(new Date(now.getFullYear(), now.getMonth(), 1));
});
$("#bell").addEventListener("click", () => {
  const now = new Date();
  visibleMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  loadAll().then(() => {
    const todayCell = $(`.calendar-day[data-date="${isoDate()}"]`);
    (todayCell || $("#agenda-section")).scrollIntoView({ behavior: "smooth", block: "center" });
  });
});
refreshButtons.forEach((button) => {
  button.addEventListener("click", () => refreshAll({ announce: true, broadcast: true }));
});
if (radarToggle) {
  radarToggle.addEventListener("click", () => setRadarOpen(!radarPanel.classList.contains("radar-open")));
}
if (topRadarToggle) {
  topRadarToggle.addEventListener("click", () => {
    setRadarOpen(!radarPanel.classList.contains("radar-open"), { scroll: true });
  });
}

if (phoneServerButton) {
  phoneServerButton.addEventListener("click", openPhoneServer);
}
if (copyPhoneServerUrlButton) {
  copyPhoneServerUrlButton.addEventListener("click", async () => {
    const copied = await copyText(phoneServerUrl.value);
    showToast(copied ? "Link copiado." : "Não consegui copiar automaticamente.");
  });
}
infoToggleButton.addEventListener("click", toggleInfoPanel);
const agendaSection = $("#agenda-section");
agendaSection.style.touchAction = "pan-y";
agendaSection.addEventListener("touchstart", startMonthSwipe, { passive: true });
window.addEventListener("touchmove", moveMonthSwipe, { passive: false });
window.addEventListener("touchend", finishMonthSwipe, { passive: true });
window.addEventListener("touchcancel", cancelMonthSwipe, { passive: true });
agendaSection.addEventListener("pointerdown", startMonthPointerSwipe);
agendaSection.addEventListener("pointermove", moveMonthPointerSwipe);
agendaSection.addEventListener("pointerup", finishMonthPointerSwipe);
agendaSection.addEventListener("pointercancel", cancelMonthSwipe);

$("#today-label").textContent = longDate.format(new Date()).toUpperCase();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/static/service-worker.js").catch(() => {
    setAppStatus({
      title: "Cache indisponível",
      text: "O app abriu, mas o cache local não foi ativado nesta sessão.",
    });
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateConnectivityStatus();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  hideAppStatus();
});
window.addEventListener("online", updateConnectivityStatus);
window.addEventListener("offline", updateConnectivityStatus);
[installAppButton, statusInstallButton].forEach((button) => {
  button.addEventListener("click", installApp);
});
updateConnectivityStatus();
updateSeasonCountdowns();

loadAll().then(() => checkRemoteSync());
setInterval(checkRemoteSync, 5000);
setInterval(updateSeasonCountdowns, 60000);

