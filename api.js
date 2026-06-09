/* ============================================================
   API-СЛОЙ: fetch с Bearer токеном + авто-refresh при 401
   ------------------------------------------------------------
   ВАЖНО про токены:
   Теперь access и refresh токены приходят в теле ответа (JSON).
   Мы сохраняем их в sessionStorage (чтобы не терять при перезагрузке).
   Access токен прикрепляется вручную в заголовок Authorization.
   При 401 ошибке делаем рефреш, отправляя refreshToken в теле запроса.
   ============================================================ */

let _refreshPromise = null;

function buildUrl(path) {
  return path.startsWith("http") ? path : CONFIG.BASE_URL + path;
}

/* -------- Хранилище токенов -------- */
function getAccessToken() {
  return sessionStorage.getItem("accessToken");
}

function getRefreshToken() {
  return sessionStorage.getItem("refreshToken");
}

function setTokens(access, refresh) {
  sessionStorage.setItem("accessToken", access);
  sessionStorage.setItem("refreshToken", refresh);
}

function clearTokens() {
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("refreshToken");
}

/**
 * Обновляет access-токен через /auth/refresh.
 * Отправляет refreshToken в теле JSON-запроса.
 * Сохраняет новую пару токенов.
 * Возвращает true, если обновление прошло успешно.
 */
async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise; // refresh уже идёт — ждём его

  _refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false; // Нечего обновлять

      const res = await fetch(buildUrl(CONFIG.ENDPOINTS.refresh), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }), // Отправляем в теле!
      });

      if (res.ok) {
        const data = await res.json();
        // Предполагаем, что бэкенд возвращает { accessToken: "...", refreshToken: "..." }
        setTokens(data.accessToken, data.refreshToken);
        return true;
      }
      
      clearTokens(); // Если бэкенд вернул ошибку, токены протухли
      return false;
    } catch {
      clearTokens();
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

/**
 * Запрос к API. Подкладывает Authorization: Bearer <token>.
 * При 401 один раз дёргает /auth/refresh и повторяет запрос.
 */
async function apiFetch(path, options = {}, _retry = true) {
  // Грамотно склеиваем заголовки: сохраняем те, что переданы, и добавляем Authorization
  const headers = new Headers(options.headers || {});
  
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Если в options передан body типа FormData, мы НЕ должны ставить Content-Type вручную,
  // браузер сам поставит multipart/form-data с границей (boundary).
  // Если это JSON — Content-Type уже должен быть в options.headers.

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
    // credentials: "include" больше НЕ нужен, так как куки не используем
  });

  // 401 = протух access-токен -> пробуем обновить и повторить ОДИН раз.
  if (res.status === 401 && _retry) {
    const ok = await refreshAccessToken();
    if (ok) {
      // Обновляем заголовок с новым токеном для повторного запроса
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
      return apiFetch(path, { ...options, headers }, false); 
    }

    // refresh не удался -> refresh-токен тоже протух -> на страницу входа
    clearTokens();
    redirectToLogin();
    throw new Error("Сессия истекла. Войдите снова.");
  }

  return res;
}

function redirectToLogin() {
  if (!location.pathname.endsWith("login.html")) {
    location.replace("login.html");
  }
}

/* -------- Авторизация -------- */

/**
 * Вход. Теперь читает токены из тела ответа и сохраняет их.
 */
async function login(loginValue, passwordValue) {
  const res = await fetch(buildUrl(CONFIG.ENDPOINTS.login), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: loginValue, password: passwordValue }),
  });

  if (res.ok) {
    const data = await res.json();
    // Предполагаем, что бэкенд возвращает { accessToken: "...", refreshToken: "..." }
    setTokens(data.accessToken, data.refreshToken);
  }

  return res; // Возвращаем res, чтобы страница логина могла обработать 401/403 (неверный пароль)
}

async function logout() {

  clearTokens();
  redirectToLogin();
}

/* -------- Справочники -------- */

/**
 * Получение списка всех станций.
 * Ожидаемый формат ответа: { stations: [{ id, name, branch }, ...] }
 * Возвращает массив объектов { id, name, branch }.
 */
async function fetchStations() {
  const res = await apiFetch(CONFIG.ENDPOINTS.stations);
  if (!res.ok) throw new Error(`получение станций — HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.stations) ? data.stations : [];
}
async function fetchAttractions() {
  const res = await apiFetch(CONFIG.ENDPOINTS.attractions);
  if (!res.ok) throw new Error(`получение достопримечательностей — HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.attractions) ? data.attractions : [];
}

/**
 * Получение одной достопримечательности по ID.
 * Используется на странице редактирования (add-attraction.html?id=...).
 * Ожидаемый ответ — объект AttractionInfoResponse:
 *   { id, name, phoneNumber, email, address, workingHours, description,
 *     price, urlRef, images[], videos[], audios[], stationAttractions[] }
 */
async function fetchAttraction(id) {
  const res = await apiFetch(`${CONFIG.ENDPOINTS.attractions}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`получение достопримечательности — HTTP ${res.status}`);
  return res.json();
}

/**
 * Удаление достопримечательности по ID.
 */
async function deleteAttraction(id) {
  const res = await apiFetch(`${CONFIG.ENDPOINTS.attractions}/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`удаление — HTTP ${res.status}`);
}

/**
 * Создание новой достопримечательности.
 * Тело — AttractionRequest. Возвращает созданный объект (AttractionInfoResponse).
 */
async function createAttraction(request) {
  const res = await apiFetch(CONFIG.ENDPOINTS.attractions, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`создание — HTTP ${res.status}`);
  return res.json();
}

/**
 * Обновление существующей достопримечательности по ID.
 * PUT /api/attractions/{id} с телом AttractionRequest.
 * Возвращает обновлённый объект (AttractionInfoResponse).
 */
async function updateAttraction(id, request) {
  const res = await apiFetch(
    `${CONFIG.ENDPOINTS.attractions}/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  if (!res.ok) throw new Error(`обновление — HTTP ${res.status}`);
  return res.json();
}
/* -------- Удаление медиа -------- */

/**
 * Удаление одного медиафайла по имени.
 * 404 трактуем как «уже удалён» — не ошибка.
 */
async function deleteMedia(filename) {
  if (!filename) return;
  const res = await apiFetch(
    `${CONFIG.ENDPOINTS.deleteMedia}/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`удаление файла ${filename} — HTTP ${res.status}`);
  }
}

/* -------- Просмотр медиа -------- */

/**
 * Скачивает медиафайл ЧЕРЕЗ apiFetch (с Bearer-токеном) и возвращает
 * локальный objectURL (blob:), который можно подставить в src у <img>/<video>/<audio>.
 *
 * Зачем так: теги <img>/<video>/<audio> грузят src напрямую и НЕ умеют
 * слать заголовок Authorization. Если эндпоинт download закрыт авторизацией,
 * прямой src вернёт 401. Поэтому качаем через fetch и отдаём blob-URL.
 *
 * ВАЖНО: вызывающий код обязан освободить URL через URL.revokeObjectURL(),
 * когда он больше не нужен (иначе утечка памяти).
 */
async function fetchMediaBlobUrl(urlOrPath) {
  const res = await apiFetch(urlOrPath);
  if (!res.ok) throw new Error(`загрузка медиа — HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
/**
 * Создание новой станции.
 * Тело — { name, branch, description, media: { photoUrls, videoUrls, audioUrls }, cellTowers[] }.
 * Возвращает созданный объект (минимум { id, ... }).
 */
async function createStation(request) {
  const res = await apiFetch(CONFIG.ENDPOINTS.createStation, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`создание станции — HTTP ${res.status}`);
  return res.json();
}

/**
 * Удаление станции по ID.
 * DELETE /api/stations/{id}
 */
async function deleteStation(id) {
  const res = await apiFetch(
    `${CONFIG.ENDPOINTS.stationsBase}/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  if (!res.ok) throw new Error(`удаление станции — HTTP ${res.status}`);
}
