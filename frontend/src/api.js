/** Thin wrapper around fetch for the backend API. */

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  loginPassword: (body) => request('/auth/login/password', { method: 'POST', body }),
  loginOtp: (body) => request('/auth/login/otp', { method: 'POST', body }),
  loginChallenge: (body) => request('/auth/login/challenge', { method: 'POST', body }),
  feed: (token) => request('/feed', { token }),
};
