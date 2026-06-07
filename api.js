
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
  try {
    const refreshToken = getRefreshToken();
    await apiFetch(CONFIG.ENDPOINTS.logout, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    }, false);
  } catch (_) {
  }
  clearTokens();
  redirectToLogin();
}