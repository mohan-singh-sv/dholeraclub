export async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = localStorage.getItem('ddaoi_admin_token');
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !url.endsWith('/api/admin/login')) {
    localStorage.removeItem('ddaoi_admin_token');
    localStorage.removeItem('ddaoi_admin');
    window.location.assign('/admin/');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}
