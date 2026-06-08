/* ============================================================
   Логика страницы управления достопримечательностями.
   ============================================================ */

const state = {
  attractions: [],
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
async function loadAttractions() {
  showStatus("Загрузка...");
  try {
    const list = await fetchAttractions();
    state.attractions = list;
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
 * Собирает все имена медиафайлов достопримечательности
 * из images/videos/audios, удаляя дубликаты.
 */
function collectMediaFilenames(a) {
  const all = [
    ...(a.images || []),
    ...(a.videos || []),
    ...(a.audios || []),
  ];
  const filenames = all.map(extractFilename).filter(Boolean);
  return [...new Set(filenames)];
}

/* -------- Локальная фильтрация -------- */
function applyFilter() {
  const q = state.query.trim().toLowerCase();

  if (!q) {
    state.filtered = state.attractions.slice();
  } else {
    state.filtered = state.attractions.filter((a) => {
      const idStr = String(a.id ?? "");
      const name = (a.name || "").toLowerCase();
      return idStr.includes(q) || name.includes(q);
    });
  }

  render();
}

/* -------- Рендер -------- */
function render() {
  const list = $("attractions-list");
  list.innerHTML = "";

  const empty = $("empty-state");
  if (state.filtered.length === 0) {
    empty.textContent = state.attractions.length === 0
      ? "Список пуст"
      : "Ничего не найдено";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((a) => fragment.appendChild(buildCard(a)));
  list.appendChild(fragment);
}

function buildCard(a) {
  const li = document.createElement("li");
  li.className = "attraction-card";
  li.dataset.id = a.id;

  /* Левая часть — информация */
  const info = document.createElement("div");
  info.className = "attraction-card__info";

  const header = document.createElement("div");
  header.className = "attraction-card__header";

  const name = document.createElement("span");
  name.className = "attraction-card__name";
  name.textContent = a.name || "(без названия)";

  const idBadge = document.createElement("span");
  idBadge.className = "attraction-card__id";
  idBadge.textContent = "ID " + a.id;

  header.append(name, idBadge);
  info.append(header);

  /* Мета: адрес, часы, цена, медиа */
  const metaParts = [];
  if (a.address) metaParts.push(a.address);
  if (a.workingHours) metaParts.push(a.workingHours);
  if (a.price != null) metaParts.push(a.price + " ₽");

  const mediaCount =
    (a.images?.length || 0) +
    (a.videos?.length || 0) +
    (a.audios?.length || 0);
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
  editBtn.addEventListener("click", () => onEdit(a));

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "btn btn--danger btn--small";
  delBtn.textContent = "Удалить";
  delBtn.addEventListener("click", () => onDelete(a, delBtn));

  actions.append(editBtn, delBtn);

  li.append(info, actions);
  return li;
}

/* -------- Действия -------- */
function onEdit(a) {
  // Переходим на ту же форму, что и для добавления, но в режиме
  // редактирования: attraction.js увидит ?id=... и подтянет данные с сервера.
  location.href = "add-attraction.html?id=" + encodeURIComponent(a.id);
}

async function onDelete(a, btn) {
  const filenames = collectMediaFilenames(a);
  const mediaInfo = filenames.length ? ` и ${filenames.length} медиафайл(ов)` : "";

  if (!confirm(`Удалить «${a.name}»${mediaInfo}?`)) return;

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
        console.warn("Не удалось удалить часть файлов:", failed.map((f) => f.reason));
      }
    }

    // 2. Удаляем саму достопримечательность.
    await deleteAttraction(a.id);

    // 3. Обновляем UI.
    state.attractions = state.attractions.filter((x) => x.id !== a.id);
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
  loadAttractions();
});
