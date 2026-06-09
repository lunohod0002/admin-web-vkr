/* ============================================================
   Логика страницы добавления станции.
   Поток сохранения:
     1) загружаем медиа в /api/medias/upload (отдельно фото/видео/аудио),
     2) получаем ключи и собираем из них URL'ы,
     3) шлём JSON со станцией в /api/stations,
     4) показываем id из ответа.
   ============================================================ */

const state = {
  photos: [],
  videos: [],
  audios: [],
  towers: [],
  attractions: [],   // [{ attractionId, distance }]
};

const $ = (id) => document.getElementById(id);

/* -------- Статус -------- */
function showStatus(message, kind = "") {
  const el = $("status");
  el.textContent = message || "";
  el.hidden = !message;
  el.className = "status" + (kind ? " status--" + kind : "");
}

/* -------- Выбор файлов -------- */
function setupFileButtons() {
  document.querySelectorAll(".btn--grey").forEach((btn) => {
    const inputId = btn.dataset.for;
    btn.addEventListener("click", () => $(inputId).click());
  });
}

function setupFileInputs() {
  bindInput("photo-input", "photos", "photo-list");
  bindInput("video-input", "videos", "video-list");
  bindInput("audio-input", "audios", "audio-list");
}

function bindInput(inputId, stateKey, listId) {
  $(inputId).addEventListener("change", (e) => {
    // повторный выбор файлов ЗАМЕНЯЕТ предыдущий набор
    state[stateKey] = Array.from(e.target.files || []);
    renderMediaList(stateKey, listId);
  });
}

/* -------- Рендер списка медиа (имена файлов, без типа) -------- */
function renderMediaList(stateKey, listId) {
  const list = $(listId);
  list.innerHTML = "";

  state[stateKey].forEach((file, index) => {
    const li = document.createElement("li");
    li.className = "station-item";

    const text = document.createElement("span");
    text.textContent = file.name;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "station-item__remove";
    remove.setAttribute("aria-label", "Удалить файл");
    remove.textContent = "×";
    remove.addEventListener("click", () => removeMedia(stateKey, listId, index));

    li.append(text, remove);
    list.appendChild(li);
  });
}

function removeMedia(stateKey, listId, index) {
  state[stateKey].splice(index, 1);
  renderMediaList(stateKey, listId);
}

/* -------- Достопримечательности (по ID + расстояние) -------- */
function addAttraction() {
  const idRaw = $("attractionId").value.trim();
  const distanceRaw = $("attractionDistance").value.trim();

  const attractionId = parseInt(idRaw, 10);
  const distance = parseInt(distanceRaw, 10);

  if (Number.isNaN(attractionId) || attractionId < 0) {
    showStatus("Введите корректный ID достопримечательности", "error");
    return;
  }
  if (Number.isNaN(distance) || distance < 0) {
    showStatus("Введите корректное расстояние", "error");
    return;
  }
  if (state.attractions.some((a) => a.attractionId === attractionId)) {
    showStatus("Эта достопримечательность уже добавлена", "error");
    return;
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
    text.textContent = `ID ${a.attractionId} · ${a.distance} м`;

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
    showStatus("Заполните все поля вышки", "error");
    return;
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

/* -------- Загрузка медиа -------- */
/* Возвращает массив URL'ов вида BASE_URL + /api/medias/download/<key>. */
async function uploadMedia(files) {
  if (!files || files.length === 0) return [];

  const fd = new FormData();
  files.forEach((f) => fd.append(CONFIG.FILE_FIELD, f));

  // apiFetch сам добавит Authorization; Content-Type для FormData НЕ ставим.
  const res = await apiFetch(CONFIG.ENDPOINTS.upload, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`загрузка медиа — HTTP ${res.status}`);

  const keys = await res.json();
  return (keys || []).map((key) => CONFIG.BASE_URL + CONFIG.ENDPOINTS.download + "/" + key);
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
  showStatus("Загрузка...");

  try {
    // 1. Загружаем все медиа, получаем URL'ы
    const photoUrls = await uploadMedia(state.photos);
    const videoUrls = await uploadMedia(state.videos);
    const audioUrls = await uploadMedia(state.audios);

    // 2. Формируем тело запроса
    const request = {
      name,
      branch: $("branch").value.trim(),
      description: $("description").value.trim(),
      media: {
        photoUrls,
        videoUrls,
        audioUrls,
      },
      cellTowers: state.towers,
      stationAttractions: state.attractions,
    };

    // 3. POST /api/stations
    const data = await createStation(request);
    showStatus(`Сохранено, id=${data.id}`, "success");
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
  $("submit-btn").textContent = loading ? "Сохранение..." : "Сохранить";
}

/* -------- Инициализация -------- */
document.addEventListener("DOMContentLoaded", () => {
  // Защита маршрута: без токена — на логин.
  if (!sessionStorage.getItem("accessToken")) {
    location.replace("login.html");
    return;
  }

  setupFileButtons();
  setupFileInputs();

  $("add-attraction-btn").addEventListener("click", addAttraction);
  $("add-tower-btn").addEventListener("click", addTower);

  $("station-form").addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit();
  });
});