import { API_DOMAIN } from '@/config/constant';

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed with status code ${status}`);
    this.name = 'ApiError';
  }
}

export const apiFetch = async <Response>(path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_DOMAIN}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return (await response.json()) as Response;
};
