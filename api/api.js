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
/* -------- Хранилище токенов -------- */
function getAccessToken() {
  const token = sessionStorage.getItem("accessToken");
  return (token && token !== "undefined") ? token : null; // Защита от строки "undefined"
}

function getRefreshToken() {
  const token = sessionStorage.getItem("refreshToken");
  return (token && token !== "undefined") ? token : null; // Защита от строки "undefined"
}

function setTokens(access, refresh) {
  // ВАЖНО: не сохраняем undefined или null, чтобы не ломать логику
  if (!access || !refresh) {
    console.error("Попытка сохранить невалидные токены:", { access, refresh });
    clearTokens();
    return;
  }
  sessionStorage.setItem("accessToken", access);
  sessionStorage.setItem("refreshToken", refresh);
}

function clearTokens() {
  sessionStorage.removeItem("accessToken"); // Используем removeItem вместо removeItem("undefined")
  sessionStorage.removeItem("refreshToken");
}
/**
 * Обновляет access-токен через /auth/refresh.
 * Отправляет refreshToken в теле JSON-запроса.
 * Сохраняет новую пару токенов.
 * Возвращает true, если обновление прошло успешно.
 */
/**
 * Обновляет access-токен через /auth/refresh.
 */
async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise; // refresh уже идёт — ждём его

  _refreshPromise = (async () => {
    try {
      const oldRefreshToken = getRefreshToken();
      
      if (!oldRefreshToken) {
        console.warn("[Auth] Попытка обновить токен, но refreshToken отсутствует.");
        clearTokens();
        return false; 
      }

      console.log("[Auth] Пробуем обновить accessToken...");
      const res = await fetch(buildUrl(CONFIG.ENDPOINTS.refresh), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: oldRefreshToken }), 
      });

      if (res.ok) {
        const data = await res.json();
        console.log("[Auth] Успешный ответ /auth/refresh:", data);
        
        const newAccess = data.accessToken || data.access_token;
        // Если бэкенд не возвращает новый refreshToken, оставляем старый!
        const newRefresh = data.refreshToken || data.refresh_token || oldRefreshToken;
        
        if (newAccess) {
           setTokens(newAccess, newRefresh);
           console.log("[Auth] Токены сохранены. AccessToken обновлен.");
           return true;
        } else {
           console.error("[Auth] Сервер вернул 200, но accessToken отсутствует:", data);
           clearTokens();
           return false;
        }
      }
      
      // Если сервер ответил ошибкой (400, 401 и т.д.)
      const errorText = await res.text();
      console.error(`[Auth] Ошибка обновления токена: HTTP ${res.status}`, errorText);
      clearTokens(); 
      return false;
    } catch (err) {
      console.error("[Auth] Исключение при обновлении токена:", err);
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
 */
async function apiFetch(path, options = {}, _retry = true) {
  const headers = new Headers(options.headers || {});
  
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
  });

  // 401 = протух access-токен -> пробуем обновить и повторить ОДИН раз.
  if (res.status === 401 && _retry) {
    console.warn(`[API] Получен 401 на ${path}. Пробуем обновить токен...`);
    const ok = await refreshAccessToken();
    if (ok) {
      console.log("[API] Токен обновлён, повторяем запрос...");
      headers.set("Authorization", `Bearer ${getAccessToken()}`);
      return apiFetch(path, { ...options, headers }, false); 
    }

    console.error("[API] Не удалось обновить токен. Редирект на логин.");
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
    
    // ДИАГНОСТИКА: Посмотри в консоль, как реально называются поля!
    console.log("Ответ сервера при логине:", data); 
    
    // Поддержка разных вариантов названий полей от бэкенда
    const accessToken = data.accessToken || data.access_token || data.token;
    const refreshToken = data.refreshToken || data.refresh_token;

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken);
    } else {
      console.error("Бэкенд не вернул ожидаемые токены! Проверь структуру ответа в консоли.");
      // Если бэкенд не использует refreshToken, возможно нужно сохранить только accessToken
      // В таком случае нужно поменять логику refreshAccessToken
    }
  }

  return res;
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
/* Добавь это в конец файла api.js */

/**
 * Получение станции по названию и ветке.
 * GET /api/stations?stationName=...&branch=...
 */
async function fetchStationByNameAndBranch(name, branch) {
  const url = `${CONFIG.ENDPOINTS.stationsBase}?stationName=${encodeURIComponent(name)}&branch=${encodeURIComponent(branch)}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`получение станции — HTTP ${res.status}`);
  const data = await res.json();
  // В зависимости от бэкенда, может возвращаться массив или объект. Безопасно обрабатываем оба случая.
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

/**
 * Обновление станции по ID.
 * PUT /api/stations/{id}
 */
async function updateStation(id, request) {
  const res = await apiFetch(
    `${CONFIG.ENDPOINTS.stationsBase}/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  if (!res.ok) throw new Error(`обновление станции — HTTP ${res.status}`);
  return res.json();
}