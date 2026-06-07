

const state = {
  photos: [],
  videos: [],
  audios: [],
  stations: [],
};

const $ = (id) => document.getElementById(id);

function showStatus(message, kind = "") {
  const el = $("status");
  el.textContent = message || "";
  el.hidden = !message;
  el.className = "status" + (kind ? " status--" + kind : "");
}

function setupFileButtons() {
  document.querySelectorAll(".btn--grey").forEach((btn) => {
    const inputId = btn.dataset.for;
    btn.addEventListener("click", () => $(inputId).click());
  });
}

function setupFileInputs() {
  bindInput("photo-input", "photos", "photo-count", "фото");
  bindInput("video-input", "videos", "video-count", "видео");
  bindInput("audio-input", "audios", "audio-count", "аудио");
}

function bindInput(inputId, stateKey, countId, label) {
  $(inputId).addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    state[stateKey] = files;

    const countEl = $(countId);
    if (files.length) {
      countEl.textContent = `Выбрано ${label}: ${files.length}`;
      countEl.hidden = false;
    } else {
      countEl.hidden = true;
    }
  });
}

function addStation() {
  const stationName = $("stationName").value.trim();
  const branch = $("stationBranch").value.trim();
  const distance = parseInt($("stationDistance").value.trim(), 10);

  if (!stationName || !branch || Number.isNaN(distance)) {
    showStatus("Заполните все поля станции", "error");
    return;
  }

  state.stations.push({ stationName, branch, distance });
  renderStations();

  $("stationName").value = "";
  $("stationBranch").value = "";
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

async function uploadMedia(files, type) {
  if (!files || files.length === 0) return [];

  const fd = new FormData();
  files.forEach((f) => fd.append(CONFIG.FILE_FIELD, f));

  // apiFetch сам добавит Authorization заголовок!
  // Content-Type для FormData НЕ ставим — браузер сделает всё сам.
  const res = await apiFetch(CONFIG.ENDPOINTS.upload, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`загрузка медиа — HTTP ${res.status}`);

  const keys = await res.json();
  return (keys || []).map((key) => ({
    urlRef: CONFIG.BASE_URL + CONFIG.ENDPOINTS.download + "/" + key,
    type,
  }));
}

async function onSubmit() {
  const name = $("name").value.trim();
  if (!name) {
    showStatus("Введите название", "error");
    $("name").focus();
    return;
  }

  showStatus("Загрузка...");

  try {
    const photos = await uploadMedia(state.photos, "PHOTO");
    const videos = await uploadMedia(state.videos, "VIDEO");
    const audios = await uploadMedia(state.audios, "AUDIO");
    const medias = [...photos, ...videos, ...audios];

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
      medias,
      stationAttractions: state.stations,
    };

    // apiFetch сам подставит Bearer токен в заголовок!
    const res = await apiFetch(CONFIG.ENDPOINTS.attractions, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`создание — HTTP ${res.status}`);

    const data = await res.json();
    showStatus(`Сохранено, id=${data.id}`, "success");
  } catch (err) {
    showStatus("Ошибка: " + err.message, "error");
  } finally {
    setLoading(false);
  }
}

function setLoading(loading) {
  const ids = [
    "submit-btn", "add-station-btn",
    "name", "description", "address", "workingHours",
    "phone", "website", "email", "price",
    "stationName", "stationBranch", "stationDistance",
  ];
  ids.forEach((id) => { if ($(id)) $(id).disabled = loading; });

  document.querySelectorAll(".btn--grey").forEach((b) => (b.disabled = loading));
  $("submit-btn").textContent = loading ? "Сохранение..." : "Сохранить";
}

document.addEventListener("DOMContentLoaded", () => {
  setupFileButtons();
  setupFileInputs();

  $("add-station-btn").addEventListener("click", addStation);

  $("attraction-form").addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit();
  });
});