/**
 * T043: API Client Service
 * Axios-based HTTP client for all API communication
 * Handles errors, auth headers, and request/response logging
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';


interface APIError {
  status: number;
  message: string;
  detail?: string;
}

type RetryableConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  skipAutoLogout?: boolean;
};

// Nome do canal usado para coordenar logout entre abas/telas abertas na mesma
// origem. Sem isso, uma aba que perde a sessão apaga os cookies HttpOnly
// (compartilhados por todas as abas) e cada aba aberta dispara seu próprio
// ciclo de logout/redirect, gerando um loop de login em usuários que mantêm
// múltiplas telas do painel abertas ao mesmo tempo (ex.: Porta + Tickets +
// Relatório de Gira durante uma gira ao vivo).
const AUTH_BROADCAST_CHANNEL = 'senhas-auth';
const REFRESH_PATH = '/api/v1/auth/refresh';
const LOGIN_PATH = '/api/v1/auth/login';


class APIClient {
  private instance: AxiosInstance;
  private baseURL: string;
  // Deduplica chamadas de refresh concorrentes: várias requisições podem
  // 401 ao mesmo tempo (ex.: fetch inicial de uma página dispara profile +
  // subscription + tenant/config em paralelo) — todas devem esperar o mesmo
  // refresh em vez de disparar um POST /auth/refresh cada uma.
  private refreshPromise: Promise<boolean> | null = null;
  private authChannel: BroadcastChannel | null = null;

  constructor(baseURL: string = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000') {
    this.baseURL = baseURL;

    this.instance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      // Necessário para enviar/receber cookies HttpOnly (access_token, refresh_token)
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (typeof BroadcastChannel !== 'undefined') {
      this.authChannel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      this.authChannel.onmessage = (event) => {
        if (
          event.data === 'logout' &&
          typeof window !== 'undefined' &&
          window.location.pathname !== '/login'
        ) {
          // Outra aba já tratou o logout (chamou /auth/logout e limpou os
          // cookies). Aqui só redirecionamos — sem repetir a chamada à API.
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      };
    }

    // Response interceptor for error handling
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error),
    );

    // Request interceptor for logging
    this.instance.interceptors.request.use(
      (config) => {
        // Impersonation token fica no sessionStorage e deve ir como Authorization header.
        // Autenticação normal usa cookie HttpOnly (access_token) enviado automaticamente
        // pelo browser via withCredentials — não precisa de header manual.
        const impersonationToken =
          typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('access_token') : null;
        if (impersonationToken) {
          config.headers.Authorization = `Bearer ${impersonationToken}`;
        }

        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        }

        return config;
      },
      (error) => Promise.reject(error),
    );
  }

  /**
   * GET request
   *
   * @param url Endpoint URL
   * @param config Optional axios config
   * @returns Promise with response data
   */
  async get<T = any>(url: string, config?: any): Promise<AxiosResponse<T>> {
    return this.instance.get<T>(url, config);
  }

  /**
   * POST request
   *
   * @param url Endpoint URL
   * @param data Request body
   * @param config Optional axios config
   * @returns Promise with response data
   */
  async post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.instance.post<T>(url, data, config);
  }

  /**
   * PUT request
   *
   * @param url Endpoint URL
   * @param data Request body
   * @param config Optional axios config
   * @returns Promise with response data
   */
  async put<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.instance.put<T>(url, data, config);
  }

  /**
   * DELETE request
   *
   * @param url Endpoint URL
   * @param config Optional axios config
   * @returns Promise with response data
   */
  async delete<T = any>(url: string, config?: any): Promise<AxiosResponse<T>> {
    return this.instance.delete<T>(url, config);
  }

  /**
   * PATCH request
   *
   * @param url Endpoint URL
   * @param data Request body
   * @param config Optional axios config
   * @returns Promise with response data
   */
  async patch<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.instance.patch<T>(url, data, config);
  }

  /**
   * Attempts a silent token refresh using the HttpOnly refresh_token cookie.
   * Concurrent callers share the same in-flight promise so a burst of 401s
   * (e.g. several widgets fetching in parallel on page load) triggers a
   * single POST /auth/refresh instead of one per failed request.
   *
   * @returns true if a new access_token was issued, false otherwise
   */
  private tryRefresh(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.instance
        .post(REFRESH_PATH, undefined, { skipAutoLogout: true } as any)
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  /**
   * Unified error handler
   *
   * @param error Axios error object
   * @throws Formatted error
   */
  private async handleError(error: AxiosError): Promise<any> {
    // Requests aborted via AbortController (axios >= 0.22 sets code 'ERR_CANCELED').
    // Re-throw as-is so callers can detect and silently ignore them.
    if (axios.isCancel(error) || (error as any).code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const response = error.response;

    if (!response) {
      // Network error
      console.error('[API] Network error:', error.message);
      return Promise.reject({
        status: 0,
        message: 'Network error. Please check your connection.',
      });
    }

    const status = response.status;
    const data: any = response.data;
    const config = error.config as RetryableConfig | undefined;

    // Log error
    console.error(`[API] Error ${status}:`, {
      url: config?.url,
      message: data?.detail || data?.message || error.message,
      data,
    });

    // Specific error handling
    const errorMessage = data?.detail || data?.message || 'An error occurred';

    if (status === 401) {
      const skipAutoLogout = config?.skipAutoLogout === true;
      const isImpersonating = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('impersonating');
      const isAuthEndpoint = Boolean(config?.url && (config.url.includes(REFRESH_PATH) || config.url.includes(LOGIN_PATH)));

      // O access_token dura 24h e o refresh_token 30 dias. Antes de forçar
      // logout, tenta renovar silenciosamente via /auth/refresh e repetir a
      // requisição original — isso evita derrubar o usuário sempre que o
      // access_token expira em uma sessão longa (ex.: tela de Tickets/Porta
      // aberta durante uma gira inteira).
      if (config && !config._retry && !skipAutoLogout && !isAuthEndpoint && !isImpersonating) {
        config._retry = true;
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          return this.instance.request(config);
        }
      }

      // Only clear token and redirect if:
      // 1. Not already on the login page (avoid redirect loop)
      // 2. The failed request actually carried a token (stale requests without tokens shouldn't clear a newly stored token)
      // 3. The caller did NOT opt-out via skipAutoLogout (e.g. delete-account dialog where 401 means "wrong password")
      const hadToken = config?.headers?.Authorization || document.cookie.includes('auth_state=1');
      if (!skipAutoLogout && typeof window !== 'undefined' && window.location.pathname !== '/login' && hadToken) {
        if (isImpersonating) {
          endImpersonation();
        } else {
          // Limpa os cookies HttpOnly via endpoint e remove dados locais
          try { await this.instance.post('/api/v1/auth/logout'); } catch { /* non-critical */ }
          localStorage.removeItem('user');
          // Avisa outras abas para redirecionarem sem repetir a chamada de
          // logout — os cookies já foram apagados e são compartilhados por
          // todas as abas dessa origem.
          this.authChannel?.postMessage('logout');
          window.location.href = '/login';
        }
      }
    } else if (status === 403) {
      // Forbidden
      console.warn('[API] Access forbidden');
    } else if (status === 429) {
      // Rate limited
      console.warn('[API] Rate limit exceeded');
    }

    return Promise.reject({
      status,
      message: errorMessage,
      detail: data?.detail,
      response,
    });
  }

  /**
   * Check if service is healthy
   *
   * @returns Promise<boolean> True if healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.instance.get('/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get current API base URL
   *
   * @returns Base URL string
   */
  getBaseURL(): string {
    return this.baseURL;
  }
}

// Create and export singleton instance
export const apiClient = new APIClient();

export type { APIError };

/**
 * Ends an active impersonation session.
 * Clears sessionStorage, tries to close the tab, and falls back to /login.
 * Exported so that other modules (admin_layout) can reuse the same logic.
 */
export function endImpersonation(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('user');
  sessionStorage.removeItem('impersonating');
  sessionStorage.removeItem('impersonate_tenant');
  if (typeof window !== 'undefined') {
    window.close();
    // Fallback: if the tab was not opened by script, window.close() is a no-op.
    // Redirect to login after a short delay.
    setTimeout(() => {
      if (!window.closed) {
        window.location.href = '/login';
      }
    }, 300);
  }
}
