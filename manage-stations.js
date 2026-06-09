/* ============================================================
   Логика страницы управления станциями.
   Загружает список станций (GET /api/stations/all), даёт поиск
   по названию/ID и удаление (DELETE /api/stations/{id}).
   При удалении станции также удаляются все привязанные к ней медиафайлы.
   ============================================================ */

const state = {
  stations: [],
  filtered: [],
  query: "",
};

const $ = (id) => document.getElementById(id);

/* -------- Статусы -------- */
function showStatus(message, kind = "") {
  const el = $("status");
  el.textContent = message || "";
  el.hidden = !message;
  el.className = "status" + (kind ? " status--" + kind : "");
}

/* -------- Загрузка с сервера -------- */
async function loadStations() {
  showStatus("Загрузка...");
  try {
    const list = await fetchStations();
    state.stations = list;
    applyFilter();
    showStatus("");
  } catch (err) {
    showStatus("Не удалось загрузить список: " + err.message, "error");
  }
}

/* -------- Работа с медиа -------- */

/**
 * Из строки (имя файла или полный URL) достаёт чистое имя файла.
 * "http://localhost:8080/api/medias/download/abc.jpg" -> "abc.jpg"
 * "abc.jpg" -> "abc.jpg"
 */
function extractFilename(mediaRef) {
  if (!mediaRef) return null;
  const noQuery = String(mediaRef).split("?")[0];
  const parts = noQuery.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Собирает все имена медиафайлов станции
 * из объекта medias { VIDEO: [...], PHOTO: [...], AUDIO: [...] },
 * удаляя дубликаты.
 */
function collectMediaFilenames(s) {
  if (!s.medias || typeof s.medias !== "object") return [];
  
  // Собираем все массивы URL из объекта medias в один плоский массив
  const all = Object.values(s.medias).flat();
  
  const filenames = all.map(extractFilename).filter(Boolean);
  return [...new Set(filenames)];
}

/* -------- Локальная фильтрация -------- */
function applyFilter() {
  const q = state.query.trim().toLowerCase();

  if (!q) {
    state.filtered = state.stations.slice();
  } else {
    state.filtered = state.stations.filter((s) => {
      const idStr = String(s.id ?? "");
      const name = (s.name || "").toLowerCase();
      return idStr.includes(q) || name.includes(q);
    });
  }

  render();
}

/* -------- Рендер -------- */
function render() {
  const list = $("stations-list");
  list.innerHTML = "";

  const empty = $("empty-state");
  if (state.filtered.length === 0) {
    empty.textContent = state.stations.length === 0
      ? "Список пуст"
      : "Ничего не найдено";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((s) => fragment.appendChild(buildCard(s)));
  list.appendChild(fragment);
}

function buildCard(s) {
  // Переиспользуем стилевые классы attraction-card* — карточка
  // визуально такая же, как для достопримечательностей.
  const li = document.createElement("li");
  li.className = "attraction-card";
  li.dataset.id = s.id;

  /* Левая часть — информация */
  const info = document.createElement("div");
  info.className = "attraction-card__info";

  const header = document.createElement("div");
  header.className = "attraction-card__header";

  const name = document.createElement("span");
  name.className = "attraction-card__name";
  name.textContent = s.name || "(без названия)";

  const idBadge = document.createElement("span");
  idBadge.className = "attraction-card__id";
  idBadge.textContent = "ID " + s.id;

  header.append(name, idBadge);
  info.append(header);

  /* Мета: ветка и количество медиа */
  const metaParts = [];
  if (s.branch) metaParts.push("Ветка: " + s.branch);
  
  const mediaCount = s.medias 
    ? Object.values(s.medias).reduce((acc, arr) => acc + arr.length, 0) 
    : 0;
  if (mediaCount) metaParts.push(`медиа: ${mediaCount}`);

  if (metaParts.length) {
    const meta = document.createElement("div");
    meta.className = "attraction-card__meta";
    meta.textContent = metaParts.join(" · ");
    info.append(meta);
  }

  /* Правая часть — кнопки */
  const actions = document.createElement("div");
  actions.className = "attraction-card__actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn--outline btn--small";
  editBtn.textContent = "Редактировать";
  // Функционал намеренно не реализован — пока показываем заглушку
  editBtn.addEventListener("click", () => onEditStub(s));
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn--danger btn--small";
  delBtn.textContent = "Удалить";
  delBtn.addEventListener("click", () => onDelete(s, delBtn));

  actions.append(editBtn, delBtn);

  li.append(info, actions);
  return li;
}

/* -------- Действия -------- */
function onEditStub(s) {
  // Переходим на страницу станции с параметрами name и branch
  location.href = `add-station.html?stationName=${encodeURIComponent(s.name)}&branch=${encodeURIComponent(s.branch)}`;
}

async function onDelete(s, btn) {
  const filenames = collectMediaFilenames(s);
  const mediaInfo = filenames.length ? ` и ${filenames.length} медиафайл(ов)` : "";

  if (!confirm(`Удалить станцию «${s.name}»${mediaInfo}?`)) return;

  btn.disabled = true;
  try {
    // 1. Удаляем медиафайлы параллельно. Используем allSettled,
    //    чтобы один сбойный файл не блокировал остальные и саму запись.
    let failedCount = 0;
    if (filenames.length) {
      const results = await Promise.allSettled(
        filenames.map((name) => deleteMedia(name))
      );
      const failed = results.filter((r) => r.status === "rejected");
      failedCount = failed.length;
      if (failed.length) {
        console.warn("Не удалось удалить часть файлов станции:", failed.map((f) => f.reason));
      }
    }

    // 2. Удаляем саму станцию.
    await deleteStation(s.id);

    // 3. Обновляем UI.
    state.stations = state.stations.filter((x) => x.id !== s.id);
    applyFilter();

    if (failedCount) {
      showStatus(`Удалено, но ${failedCount} файл(ов) не удалось снести`, "error");
    } else {
      showStatus("Удалено", "success");
    }
  } catch (err) {
    showStatus("Не удалось удалить: " + err.message, "error");
    btn.disabled = false;
  }
}

/* -------- Поиск с debounce -------- */
let searchTimer = null;
function onSearchInput(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = value;
    applyFilter();
  }, 150);
}

/* -------- Инициализация -------- */
document.addEventListener("DOMContentLoaded", () => {
  if (!sessionStorage.getItem("accessToken")) {
    location.replace("login.html");
    return;
  }

  $("search").addEventListener("input", (e) => onSearchInput(e.target.value));
  loadStations();
});