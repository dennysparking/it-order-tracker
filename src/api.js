let onAuthExpired = null;

export function setAuthExpiredHandler(handler) {
  onAuthExpired = handler;
}

export const api = {
  async fetch(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401) {
      onAuthExpired?.();
      return null;
    }
    return res.json();
  },
  get: (path) => api.fetch(path),
  post: (path, body) => api.fetch(path, { method: "POST", body }),
  put: (path, body) => api.fetch(path, { method: "PUT", body }),
  patch: (path, body) => api.fetch(path, { method: "PATCH", body }),
  del: (path) => api.fetch(path, { method: "DELETE" }),
};
