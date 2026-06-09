/* ============================================================
   Логика страницы добавления / редактирования станции.
   Режим определяется по ?stationName=&branch= в URL.
   ============================================================ */

const state = {
  photos: [],
  videos: [],
  audios: [],
  towers: [],
  attractions: [],       // [{ attractionId, distance }]
  
  // --- режим редактирования ---
  editingId: null,       // id станции (получим с сервера)
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

/* -------- Имя файла из URL -------- */
function extractFilename(mediaRef) {
  if (!mediaRef) return null;
  const noQuery = String(mediaRef).split("?")[0];
  const parts = noQuery.split("/");
  return parts[parts.length - 1] || null;
}

function makeExistingMedia(raw, type) {
  const filename = extractFilename(raw);
  const url = String(raw).startsWith("http")
    ? String(raw)
    : CONFIG.BASE_URL + CONFIG.ENDPOINTS.download + "/" + raw;
  return { raw, filename, type, url, _url: null };
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
  if (vb) vb.disabled = total === 0;
}

/* ============================================================
   Просмотр медиа (модальное окно)
   ============================================================ */
let modalType = null;
let newPreviewUrls = [];

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
  if (type === "VIDEO") { el = document.createElement("video"); el.controls = true; el.preload = "metadata"; }
  else if (type === "AUDIO") { el = document.createElement("audio"); el.controls = true; el.preload = "metadata"; }
  else { el = document.createElement("img"); el.alt = ""; }
  el.src = src;
  return el;
}

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

async function loadExistingPreview(m, container) {
  try {
    if (!m._url) m._url = await fetchMediaBlobUrl(m.url);
    container.textContent = "";
    container.appendChild(buildMediaElement(m.type, m._url));
  } catch (e) {
    container.textContent = "";
    const a = document.createElement("a");
    a.href = m.url; a.target = "_blank"; a.rel = "noopener";
    a.className = "media-card__link"; a.textContent = "Открыть в новой вкладке";
    container.appendChild(a);
  }
}

function removeExistingMedia(m) {
  state.existingMedia = state.existingMedia.filter((x) => x !== m);
  if (m.filename) state.removedMedia.push(m.filename);
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

/* -------- Достопримечательности -------- */
function addAttraction() {
  const idRaw = $("attractionId").value.trim();
  const distanceRaw = $("attractionDistance").value.trim();
  const attractionId = parseInt(idRaw, 10);
  const distance = parseInt(distanceRaw, 10);

  if (Number.isNaN(attractionId) || attractionId < 0) {
    showStatus("Введите корректный ID достопримечательности", "error"); return;
  }
  if (Number.isNaN(distance) || distance < 0) {
    showStatus("Введите корректное расстояние", "error"); return;
  }
  if (state.attractions.some((a) => a.attractionId === attractionId)) {
    showStatus("Эта достопримечательность уже добавлена", "error"); return;
  }

  state.attractions.push({ attractionId, distance });
  renderAttractions();
  $("attractionId").value = "";
  $("attractionDistance").value = "";
  showStatus("");
}

function removeAttraction(index) {
  state.attractions.splice(index, 1);
  renderAttractions();
}

function renderAttractions() {
  const list = $("attractions-list");
  list.innerHTML = "";

  state.attractions.forEach((a, index) => {
    const li = document.createElement("li");
    li.className = "station-item";

    const text = document.createElement("span");
    // Если с сервера пришло имя, показываем его, иначе падаем на ID
    const displayText = a.name 
      ? `${a.name} (ID ${a.attractionId}) · ${a.distance} м` 
      : `ID ${a.attractionId} · ${a.distance} м`;
    text.textContent = displayText;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "station-item__remove";
    remove.setAttribute("aria-label", "Удалить достопримечательность");
    remove.textContent = "×";
    remove.addEventListener("click", () => removeAttraction(index));

    li.append(text, remove);
    list.appendChild(li);
  });
}

/* -------- Вышки сотовой связи -------- */
function addTower() {
  const mcc = $("towerMcc").value.trim();
  const mnc = $("towerMnc").value.trim();
  const cid = $("towerCid").value.trim();
  const lac = $("towerLac").value.trim();
  const radio = $("towerRadio").value.trim();

  if (!mcc || !mnc || !cid || !lac || !radio) {
    showStatus("Заполните все поля вышки", "error"); return;
  }

  state.towers.push({ mcc, mnc, cid, lac, radio });
  renderTowers();
  $("towerMcc").value = "";
  $("towerMnc").value = "";
  $("towerCid").value = "";
  $("towerLac").value = "";
  $("towerRadio").value = "";
  showStatus("");
}

function removeTower(index) {
  state.towers.splice(index, 1);
  renderTowers();
}

function renderTowers() {
  const list = $("towers-list");
  list.innerHTML = "";
  state.towers.forEach((t, index) => {
    const li = document.createElement("li");
    li.className = "station-item";
    const text = document.createElement("span");
    text.textContent = `MCC: ${t.mcc} · MNC: ${t.mnc} · CID: ${t.cid} · LAC: ${t.lac} · Radio: ${t.radio}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "station-item__remove";
    remove.setAttribute("aria-label", "Удалить вышку");
    remove.textContent = "×";
    remove.addEventListener("click", () => removeTower(index));
    li.append(text, remove);
    list.appendChild(li);
  });
}

/* -------- Загрузка новых медиа -------- */
async function uploadMedia(files) {
  if (!files || files.length === 0) return [];
  const fd = new FormData();
  files.forEach((f) => fd.append(CONFIG.FILE_FIELD, f));
  const res = await apiFetch(CONFIG.ENDPOINTS.upload, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`загрузка медиа — HTTP ${res.status}`);
  const keys = await res.json();
  return (keys || []).map((key) => CONFIG.BASE_URL + CONFIG.ENDPOINTS.download + "/" + key);
}

/* ============================================================
   Режим редактирования
   ============================================================ */
function getEditModeParams() {
  const params = new URLSearchParams(location.search);
  const stationName = params.get("stationName");
  const branch = params.get("branch");
  return (stationName && branch) ? { stationName, branch } : null;
}

function setEditUiText() {
  document.title = "Редактирование станции";
  const h1 = document.querySelector("h1.title--lg");
  if (h1) h1.textContent = "Редактирование станции";
  $("submit-btn").textContent = "Сохранить изменения";
}

async function initEditMode(params) {
  setEditUiText();
  setLoading(true);
  showStatus("Загрузка данных станции...");
  try {
    const s = await fetchStationByNameAndBranch(params.stationName, params.branch);
    if (!s) throw new Error("Станция не найдена");
    
    state.editingId = s.id;
    fillForm(s);
    showStatus("");
  } catch (err) {
    showStatus("Не удалось загрузить станцию: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

function fillForm(s) {
  $("name").value = s.name || "";
  $("branch").value = s.branch || "";
  $("description").value = s.description || "";

  // Вышки (если сервер их не возвращает, будет пустой массив)
  state.towers = s.cellTowers || [];
  renderTowers();

  // Достопримечательности: маппим attractionResponseList в формат стейта
  // Сохраняем name для красивого отображения, но при отправке будем использовать attractionId
  state.attractions = (s.attractionResponseList || []).map((a) => ({
    attractionId: a.id,
    distance: a.distance,
    name: a.name, // оставляем для UI
  }));
  renderAttractions();

  // Существующие медиа: используем реальные ключи из ответа
  state.existingMedia = [];
  state.removedMedia = [];
  
  (s.imagesRef || []).forEach((m) => state.existingMedia.push(makeExistingMedia(m, "PHOTO")));
  (s.videosRef || []).forEach((m) => state.existingMedia.push(makeExistingMedia(m, "VIDEO")));
  (s.audiosRef || []).forEach((m) => state.existingMedia.push(makeExistingMedia(m, "AUDIO")));
  
  updateMediaCounts();
}

/* -------- Сохранение -------- */
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
    // Загружаем новые файлы
    const uploadedPhotoUrls = await uploadMedia(state.photos);
    const uploadedVideoUrls = await uploadMedia(state.videos);
    const uploadedAudioUrls = await uploadMedia(state.audios);

    // Оставленные старые медиа
    const keptPhotoUrls = state.existingMedia.filter(m => m.type === "PHOTO").map(m => m.url);
    const keptVideoUrls = state.existingMedia.filter(m => m.type === "VIDEO").map(m => m.url);
    const keptAudioUrls = state.existingMedia.filter(m => m.type === "AUDIO").map(m => m.url);

    // Строго требуемая структура PUT запроса
        // Строго требуемая структура PUT запроса
    const request = {
      name,
      branch: $("branch").value.trim(),
      description: $("description").value.trim(),
      address:  "",
      media: {
        photoUrls: [...keptPhotoUrls, ...uploadedPhotoUrls],
        videoUrls: [...keptVideoUrls, ...uploadedVideoUrls],
        audioUrls: [...keptAudioUrls, ...uploadedAudioUrls],
      },
      cellTowers: state.towers,
      // Важно: убираем лишние поля (name), отправляем только attractionId и distance
      attractions: state.attractions.map(a => ({ 
        attractionId: a.attractionId, 
        distance: a.distance 
      })),
    };

    if (state.editingId) {
      // PUT /api/stations/{id}
      await updateStation(state.editingId, request);

      // Удаляем медиа, убранные пользователем
      let mediaFailed = 0;
      if (state.removedMedia.length) {
        const results = await Promise.allSettled(state.removedMedia.map((fn) => deleteMedia(fn)));
        mediaFailed = results.filter((r) => r.status === "rejected").length;
      }

      const tail = mediaFailed ? ` (не удалось удалить файлов: ${mediaFailed})` : "";
      showStatus(`Изменения сохранены${tail}`, "success");
      setTimeout(() => { location.href = "manage-stations.html"; }, 900);
    } else {
      // POST /api/stations
      const data = await createStation(request);
      showStatus(`Сохранено, id=${data.id}`, "success");
    }
  } catch (err) {
    showStatus("Ошибка: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

/* -------- Блокировка интерфейса -------- */
function setLoading(loading) {
  const ids = [
    "submit-btn", "add-tower-btn", "add-attraction-btn",
    "name", "branch", "description",
    "towerMcc", "towerMnc", "towerCid", "towerLac", "towerRadio",
    "attractionId", "attractionDistance",
  ];
  ids.forEach((id) => { if ($(id)) $(id).disabled = loading; });
  document.querySelectorAll(".btn--grey").forEach((b) => (b.disabled = loading));
  if (loading) document.querySelectorAll(".btn--view").forEach((b) => (b.disabled = true));

  $("submit-btn").textContent = loading
    ? "Сохранение..."
    : (state.editingId ? "Сохранить изменения" : "Сохранить");

  if (!loading) updateMediaCounts();
}

/* -------- Инициализация -------- */
document.addEventListener("DOMContentLoaded", async () => {
  if (!sessionStorage.getItem("accessToken")) {
    location.replace("login.html");
    return;
  }

  setupFileButtons();
  setupFileInputs();
  setupMediaViewButtons();
  setupModal();

  $("add-attraction-btn").addEventListener("click", addAttraction);
  $("add-tower-btn").addEventListener("click", addTower);

  $("station-form").addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit();
  });

  // Проверяем, находимся ли мы в режиме редактирования
  const editParams = getEditModeParams();
  if (editParams) await initEditMode(editParams);
});