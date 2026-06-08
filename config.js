const CONFIG = {
  BASE_URL: "http://localhost:8080",
  ENDPOINTS: {
    login:       "/auth/login",
    refresh:     "/auth/refresh",
    logout:      "/auth/logout",
    upload:      "/api/medias/upload",
    download:    "/api/medias/download",
    deleteMedia: "/api/medias/delete",   // ← новое
    attractions: "/api/attractions",
    stations:    "/api/stations/all",
  },
  FILE_FIELD: "file",
};