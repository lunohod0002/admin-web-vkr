const CONFIG = {
  BASE_URL: "http://localhost:8080",
  ENDPOINTS: {
    login:         "/auth/login",
    refresh:       "/auth/refresh",
    logout:        "/auth/logout",
    upload:        "/api/medias/upload",
    download:      "/api/medias/download",
    deleteMedia:   "/api/medias/delete",
    attractions:   "/api/attractions",
    stations:      "/api/stations/all",
    createStation: "/api/stations",       // создание (POST)
    stationsBase:  "/api/stations",       // базовый путь для операций по id (DELETE/PUT/GET)
  },
  FILE_FIELD: "file",
};
