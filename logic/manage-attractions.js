

const state = {
  attractions: [],
  filtered: [],
  query: "",
};

const $ = (id) => document.getElementById(id);

function showStatus(message, kind = "") {
  const el = $("status");
  el.textContent = message || "";
  el.hidden = !message;
  el.className = "status" + (kind ? " status--" + kind : "");
}

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


function extractFilename(mediaRef) {
  if (!mediaRef) return null;
  const noQuery = String(mediaRef).split("?")[0];
  const parts = noQuery.split("/");
  return parts[parts.length - 1] || null;
}



function collectMediaFilenames(a) {
  const all = [
    ...(a.images || []),
    ...(a.videos || []),
    ...(a.audios || []),
  ];
  const filenames = all.map(extractFilename).filter(Boolean);
  return [...new Set(filenames)];
}

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

function onEdit(a) {

  location.href = "add-attraction.html?id=" + encodeURIComponent(a.id);
}

async function onDelete(a, btn) {
  const filenames = collectMediaFilenames(a);
  const mediaInfo = filenames.length ? ` и ${filenames.length} медиафайл(ов)` : "";

  if (!confirm(`Удалить «${a.name}»${mediaInfo}?`)) return;

  btn.disabled = true;
  try {

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

    await deleteAttraction(a.id);

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

let searchTimer = null;
function onSearchInput(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = value;
    applyFilter();
  }, 150);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!sessionStorage.getItem("accessToken")) {
    location.replace("login.html");
    return;
  }

  $("search").addEventListener("input", (e) => onSearchInput(e.target.value));
  loadAttractions();
});
