/* ============================================================
   Логика страницы добавления / редактирования достопримечательности
   ------------------------------------------------------------
   Режим определяется по ?id=<...> в URL:
     • без id  -> создание новой записи (POST /api/attractions);
     • с id    -> редактирование: форма заполняется данными
                  с сервера, а при сохранении делаем PUT по тому же id
                  и удаляем медиафайлы, которые пользователь убрал.
   ============================================================ */

const state = {
  photos: [],
  videos: [],
  audios: [],
  stations: [],          // станции, выбранные пользователем (для отправки)
  allStations: [],       // справочник с сервера: [{ name, branch }]

  // --- режим редактирования ---
  editingId: null,       // id редактируемой записи (null = создание)
  existingMedia: [],     // медиа с сервера, которые оставляем: [{ raw, url, filename, type, _url }]
  removedMedia: [],      // имена файлов, которые надо удалить при сохранении
};

const $ = (id) => document.getElementById(id);

const TYPE_LABELS = { PHOTO: "Фото", VIDEO: "Видео", AUDIO: "Аудио" };
const TYPE_TO_KEY = { PHOTO: "photos", VIDEO: "videos", AUDIO: "audios" };

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/* -------- Статус -------- */
function showStatus(message, kind = "") {
  const el = $("status");
  el.textContent = message || "";
  el.hidden = !message;
  el.className = "status" + (kind ? " status--" + kind : "");
}

/* -------- Имя файла из URL/строки -------- */
/* "http://host/api/medias/download/abc.jpg" -> "abc.jpg"; "abc.jpg" -> "abc.jpg" */
function extractFilename(mediaRef) {
  if (!mediaRef) return null;
  const noQuery = String(mediaRef).split("?")[0];
  const parts = noQuery.split("/");
  return parts[parts.length - 1] || null;
}

/* -------- Выбор файлов -------- */
function setupFileButtons() {
  document.querySelectorAll(".btn--grey").forEach((btn) => {
    const inputId = btn.dataset.for;
    btn.addEventListener("click", () => $(inputId).click());
  });
}

function setupFileInputs() {
  bindInput("photo-input", "photos");
  bindInput("video-input", "videos");
  bindInput("audio-input", "audios");
}

function bindInput(inputId, stateKey) {
  $(inputId).addEventListener("change", (e) => {
    // выбор файлов ЗАМЕНЯЕТ текущий набор новых файлов (как и было раньше)
    state[stateKey] = Array.from(e.target.files || []);
    updateMediaCounts();
    if (modalType && TYPE_TO_KEY[modalType] === stateKey) renderModalBody();
  });
}

/* -------- Счётчики и кнопки "Посмотреть медиа" -------- */
function updateMediaCounts() {
  updateTypeCount("PHOTO", "photos", "photo-count", "photo-view-btn", "фото");
  updateTypeCount("VIDEO", "videos", "video-count", "video-view-btn", "видео");
  updateTypeCount("AUDIO", "audios", "audio-count", "audio-view-btn", "аудио");
}

function updateTypeCount(type, stateKey, countId, viewBtnId, label) {
  const existing = state.existingMedia.filter((m) => m.type === type).length;
  const added = state[stateKey].length;
  const total = existing + added;

  const countEl = $(countId);
  if (!total) {
    countEl.hidden = true;
  } else {
    let text;
    if (existing && added) text = `${cap(label)}: загружено ${existing}, новых ${added}`;
    else if (existing)     text = `${cap(label)}: загружено ${existing}`;
    else                   text = `Выбрано ${label}: ${added}`;
    countEl.textContent = text;
    countEl.hidden = false;
  }

  const vb = $(viewBtnId);
  if (vb) vb.disabled = total === 0;   // нечего смотреть — кнопка неактивна
}

/* ============================================================
   Просмотр медиа (модальное окно)
   ============================================================ */
let modalType = null;        // PHOTO | VIDEO | AUDIO | null
let newPreviewUrls = [];     // objectURL для новых файлов (пересоздаются при ре-рендере)

function setupMediaViewButtons() {
  document.querySelectorAll(".btn--view").forEach((btn) => {
    btn.addEventListener("click", () => openMediaModal(btn.dataset.type));
  });
}

function setupModal() {
  $("media-modal-close").addEventListener("click", closeMediaModal);
  document.querySelector("#media-modal .modal__backdrop")
    .addEventListener("click", closeMediaModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("media-modal").hidden) closeMediaModal();
  });
  window.addEventListener("beforeunload", revokeAllObjectUrls);
}

function openMediaModal(type) {
  modalType = type;
  $("media-modal-title").textContent = TYPE_LABELS[type] || "Медиа";
  renderModalBody();
  $("media-modal").hidden = false;
  document.body.classList.add("modal-open");
}

function closeMediaModal() {
  $("media-modal").hidden = true;
  document.body.classList.remove("modal-open");
  modalType = null;
  newPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  newPreviewUrls = [];
}

function renderModalBody() {
  const body = $("media-modal-body");
  body.innerHTML = "";

  // старые objectURL новых файлов больше не нужны
  newPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  newPreviewUrls = [];

  const existing = state.existingMedia.filter((m) => m.type === modalType);
  const stateKey = TYPE_TO_KEY[modalType];
  const newFiles = state[stateKey] || [];

  if (!existing.length && !newFiles.length) {
    const p = document.createElement("p");
    p.className = "modal__empty";
    p.textContent = "Нет медиафайлов";
    body.appendChild(p);
    return;
  }

  if (existing.length) {
    body.appendChild(sectionTitle("Загруженные"));
    existing.forEach((m) => body.appendChild(buildExistingMediaCard(m)));
  }
  if (newFiles.length) {
    body.appendChild(sectionTitle("Новые (ещё не сохранены)"));
    newFiles.forEach((file, i) => body.appendChild(buildNewMediaCard(file, stateKey, i)));
  }
}

function sectionTitle(text) {
  const d = document.createElement("div");
  d.className = "modal__section-title";
  d.textContent = text;
  return d;
}

function buildMediaElement(type, src) {
  let el;
  if (type === "VIDEO") {
    el = document.createElement("video");
    el.controls = true;
    el.preload = "metadata";
  } else if (type === "AUDIO") {
    el = document.createElement("audio");
    el.controls = true;
    el.preload = "metadata";
  } else {
    el = document.createElement("img");
    el.alt = "";
  }
  el.src = src;
  return el;
}

/* общий каркас карточки файла: область превью + строка "имя / кнопка" */
function mediaCardShell(name, removeLabel, onRemove) {
  const card = document.createElement("div");
  card.className = "media-card";

  const media = document.createElement("div");
  media.className = "media-card__media";
  card.appendChild(media);

  const row = document.createElement("div");
  row.className = "media-card__row";

  const nm = document.createElement("span");
  nm.className = "media-card__name";
  nm.textContent = name;
  row.appendChild(nm);

  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "btn btn--danger btn--small";
  rm.textContent = removeLabel;
  rm.addEventListener("click", onRemove);
  row.appendChild(rm);

  card.appendChild(row);
  return { card, media };
}

function buildExistingMediaCard(m) {
  const { card, media } = mediaCardShell(m.filename || "(файл)", "Удалить",
    () => removeExistingMedia(m));
  media.textContent = "Загрузка…";
  loadExistingPreview(m, media);
  return card;
}

function buildNewMediaCard(file, stateKey, index) {
  const url = URL.createObjectURL(file);
  newPreviewUrls.push(url);
  const { card, media } = mediaCardShell(file.name, "Убрать",
    () => removeNewFile(stateKey, index));
  media.appendChild(buildMediaElement(modalType, url));
  return card;
}

/* Грузим файл через apiFetch (с токеном) -> blob -> objectURL.
   Так превью работает, даже если эндпоинт download закрыт авторизацией.
   Если не вышло — показываем ссылку "открыть в новой вкладке". */
async function loadExistingPreview(m, container) {
  try {
    if (!m._url) m._url = await fetchMediaBlobUrl(m.url);
    container.textContent = "";
    container.appendChild(buildMediaElement(m.type, m._url));
  } catch (e) {
    container.textContent = "";
    const a = document.createElement("a");
    a.href = m.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "media-card__link";
    a.textContent = "Открыть в новой вкладке";
    container.appendChild(a);
  }
}

function removeExistingMedia(m) {
  state.existingMedia = state.existingMedia.filter((x) => x !== m);
  if (m.filename) state.removedMedia.push(m.filename); // запомним для удаления при сохранении
  if (m._url) { URL.revokeObjectURL(m._url); m._url = null; }
  updateMediaCounts();
  renderModalBody();
}

function removeNewFile(stateKey, index) {
  const arr = state[stateKey].slice();
  arr.splice(index, 1);
  state[stateKey] = arr;
  updateMediaCounts();
  renderModalBody();
}

function revokeAllObjectUrls() {
  newPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
  newPreviewUrls = [];
  state.existingMedia.forEach((m) => { if (m._url) { URL.revokeObjectURL(m._url); m._url = null; } });
}

/* -------- Справочник станций -------- */
async function loadStations() {
  const branchSelect = $("stationBranch");
  const stationSelect = $("stationName");
  try {
    const stations = await fetchStations();
    state.allStations = stations;

    const branches = [...new Set(stations.map((s) => s.branch))]
      .sort((a, b) => a.localeCompare(b, "ru"));

    fillSelect(branchSelect, branches, "Выберите ветку");
    fillSelect(stationSelect, [], "Сначала выберите ветку");
    stationSelect.disabled = true;
  } catch (err) {
    fillSelect(branchSelect, [], "Не удалось загрузить");
    fillSelect(stationSelect, [], "Не удалось загрузить");
    branchSelect.disabled = true;
    stationSelect.disabled = true;
    showStatus("Не удалось загрузить список станций: " + err.message, "error");
  }
}

function fillSelect(selectEl, items, placeholder) {
  selectEl.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  selectEl.appendChild(ph);

  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item;
    opt.textContent = item;
    selectEl.appendChild(opt);
  });
}

function onBranchChange() {
  const branch = $("stationBranch").value;
  const stationSelect = $("stationName");

  if (!branch) {
    fillSelect(stationSelect, [], "Сначала выберите ветку");
    stationSelect.disabled = true;
    return;
  }

  const stations = state.allStations
    .filter((s) => s.branch === branch)
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b, "ru"));

  fillSelect(stationSelect, stations, "Выберите станцию");
  stationSelect.disabled = false;
}

/* -------- Станции достопримечательности -------- */
function addStation() {
  const branch = $("stationBranch").value.trim();
  const stationName = $("stationName").value.trim();
  const distanceRaw = $("stationDistance").value.trim();
  const distance = parseInt(distanceRaw, 10);

  if (!branch) { showStatus("Выберите ветку", "error"); return; }
  if (!stationName) { showStatus("Выберите станцию", "error"); return; }
  if (Number.isNaN(distance) || distance < 0) {
    showStatus("Введите корректное расстояние", "error"); return;
  }
  if (state.stations.some((s) => s.stationName === stationName && s.branch === branch)) {
    showStatus("Эта станция уже добавлена", "error"); return;
  }

  state.stations.push({ stationName, branch, distance });
  renderStations();

  $("stationBranch").value = "";
  onBranchChange();              // станция -> снова заблокирована
  $("stationDistance").value = "";
  showStatus("");
}

function removeStation(index) {
  state.stations.splice(index, 1);
  renderStations();
}

function renderStations() {
  const list = $("stations-list");
  list.innerHTML = "";

  state.stations.forEach((s, index) => {
    const li = document.createElement("li");
    li.className = "station-item";

    const text = document.createElement("span");
    text.textContent = `${s.stationName} · ${s.branch} · ${s.distance} м`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "station-item__remove";
    remove.setAttribute("aria-label", "Удалить станцию");
    remove.textContent = "×";
    remove.addEventListener("click", () => removeStation(index));

    li.append(text, remove);
    list.appendChild(li);
  });
}

/* -------- Загрузка новых медиа -------- */
async function uploadMedia(files, type) {
  if (!files || files.length === 0) return [];

  const fd = new FormData();
  files.forEach((f) => fd.append(CONFIG.FILE_FIELD, f));

  // apiFetch сам добавит Authorization; Content-Type для FormData НЕ ставим.
  const res = await apiFetch(CONFIG.ENDPOINTS.upload, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`загрузка медиа — HTTP ${res.status}`);

  const keys = await res.json();
  return (keys || []).map((key) => ({
    urlRef: CONFIG.BASE_URL + CONFIG.ENDPOINTS.download + "/" + key,
    type,
  }));
}

/* ============================================================
   Режим редактирования: загрузка и заполнение формы
   ============================================================ */
function getEditId() {
  const id = new URLSearchParams(location.search).get("id");
  return id ? id : null;
}

/* Превращаем строку из images/videos/audios в объект медиа.
   url -> для просмотра и для urlRef новой записи; filename -> для удаления. */
function makeExistingMedia(raw, type) {
  const filename = extractFilename(raw);
  const url = String(raw).startsWith("http")
    ? String(raw)
    : CONFIG.BASE_URL + CONFIG.ENDPOINTS.download + "/" + raw;
  return { raw, filename, type, url, _url: null };
}

function setEditUiText() {
  document.title = "Редактирование достопримечательности";
  const h1 = document.querySelector("h1.title--lg");
  if (h1) h1.textContent = "Редактирование достопримечательности";
  $("submit-btn").textContent = "Сохранить изменения";
}

async function initEditMode(id) {
  state.editingId = id;
  setEditUiText();
  setLoading(true);
  showStatus("Загрузка данных...");
  try {
    const a = await fetchAttraction(id);
    fillForm(a);
    showStatus("");
  } catch (err) {
    showStatus("Не удалось загрузить достопримечательность: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

function fillForm(a) {
  $("name").value = a.name || "";
  $("description").value = a.description || "";
  $("address").value = a.address || "";
  $("workingHours").value = a.workingHours || "";
  $("phone").value = a.phoneNumber || "";
  $("website").value = a.urlRef || "";
  $("email").value = a.email || "";
  $("price").value = (a.price == null ? "" : a.price);

  // станции достопримечательности -> в state + рендер (с кнопкой удаления у каждой)
  state.stations = (a.stationAttractions || []).map((s) => ({
    stationName: s.stationName ?? s.name ?? "",
    branch: s.branch ?? "",
    distance: Number(s.distance) || 0,
  }));
  renderStations();

  // существующие медиа
  state.existingMedia = [];
  state.removedMedia = [];
  (a.images || []).forEach((m) => state.existingMedia.push(makeExistingMedia(m, "PHOTO")));
  (a.videos || []).forEach((m) => state.existingMedia.push(makeExistingMedia(m, "VIDEO")));
  (a.audios || []).forEach((m) => state.existingMedia.push(makeExistingMedia(m, "AUDIO")));
  updateMediaCounts();
}

/* ============================================================
   Отправка формы:
     создание         -> POST /api/attractions
     редактирование   -> PUT  /api/attractions/{id}
                         + удаление медиа, убранных пользователем
   ============================================================ */
async function onSubmit() {
  const name = $("name").value.trim();
  if (!name) {
    showStatus("Введите название", "error");
    $("name").focus();
    return;
  }

  setLoading(true);
  showStatus(state.editingId ? "Сохранение изменений..." : "Загрузка...");

  try {
    // 1. Загружаем новые файлы
    const photos = await uploadMedia(state.photos, "PHOTO");
    const videos = await uploadMedia(state.videos, "VIDEO");
    const audios = await uploadMedia(state.audios, "AUDIO");
    const newMedias = [...photos, ...videos, ...audios];

    // 2. Оставленные старые медиа — переносим их ссылки в запрос
    const keptMedias = state.existingMedia.map((m) => ({ urlRef: m.url, type: m.type }));

    const priceRaw = $("price").value.trim();
    const request = {
      name,
      description: $("description").value.trim(),
      address: $("address").value.trim(),
      price: priceRaw === "" ? null : parseInt(priceRaw, 10),
      workingHours: $("workingHours").value.trim(),
      phoneNumber: $("phone").value.trim(),
      email: $("email").value.trim(),
      urlRef: $("website").value.trim(),
      medias: [...keptMedias, ...newMedias],
      stationAttractions: state.stations,
    };

    // 3. Отправляем запрос: PUT при редактировании, иначе POST.
    const data = state.editingId
      ? await updateAttraction(state.editingId, request)
      : await createAttraction(request);

    // --- режим создания: на этом всё ---
    if (!state.editingId) {
      showStatus(`Сохранено, id=${data.id}`, "success");
      return;
    }

    // 4. Режим редактирования: удаляем файлы, которые пользователь убрал.
    //    Запись уже не ссылается на них (PUT отправлен с обновлённым medias),
    //    поэтому теперь можно безопасно их удалить.
    let mediaFailed = 0;
    if (state.removedMedia.length) {
      const results = await Promise.allSettled(
        state.removedMedia.map((fn) => deleteMedia(fn))
      );
      mediaFailed = results.filter((r) => r.status === "rejected").length;
      if (mediaFailed) {
        console.warn("Не удалось удалить часть файлов:",
          results.filter((r) => r.status === "rejected").map((r) => r.reason));
      }
    }

    const tail = mediaFailed ? ` (не удалось удалить файлов: ${mediaFailed})` : "";
    showStatus(`Изменения сохранены${tail}`, "success");
    setTimeout(() => { location.href = "manage-attractions.html"; }, 900);
  } catch (err) {
    showStatus("Ошибка: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

/* -------- Блокировка интерфейса -------- */
function setLoading(loading) {
  const ids = [
    "submit-btn", "add-station-btn",
    "name", "description", "address", "workingHours",
    "phone", "website", "email", "price",
    "stationName", "stationBranch", "stationDistance",
  ];
  ids.forEach((id) => { if ($(id)) $(id).disabled = loading; });

  document.querySelectorAll(".btn--grey").forEach((b) => (b.disabled = loading));
  if (loading) {
    document.querySelectorAll(".btn--view").forEach((b) => (b.disabled = true));
  }

  $("submit-btn").textContent = loading
    ? "Сохранение..."
    : (state.editingId ? "Сохранить изменения" : "Сохранить");

  // после разблокировки восстанавливаем корректное состояние
  // селекта станций и кнопок "Посмотреть медиа"
  if (!loading) {
    onBranchChange();
    updateMediaCounts();
  }
}

/* -------- Инициализация -------- */
document.addEventListener("DOMContentLoaded", async () => {
  // Защита маршрута: без токена — на логин.
  if (!sessionStorage.getItem("accessToken")) {
    location.replace("login.html");
    return;
  }

  setupFileButtons();
  setupFileInputs();
  setupMediaViewButtons();
  setupModal();

  $("stationBranch").addEventListener("change", onBranchChange);
  $("add-station-btn").addEventListener("click", addStation);

  $("attraction-form").addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit();
  });

  await loadStations();

  const editId = getEditId();
  if (editId) await initEditMode(editId);
});
