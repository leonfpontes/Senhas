/**
 * T043: API Client Service
 * Axios-based HTTP client for all API communication
 * Handles errors, auth headers, and request/response logging
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';


interface APIError {
  status: number;
  message: string;
  detail?: string;
}


class APIClient {
  private instance: AxiosInstance;
  private baseURL: string;

  constructor(baseURL: string = process.env.REACT_APP_API_URL || 'http://localhost:8000') {
    this.baseURL = baseURL;

    this.instance = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Response interceptor for error handling
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error),
    );

    // Request interceptor for logging
    this.instance.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Log request
        console.debug(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
          data: config.data,
          params: config.params,
        });

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
   * Unified error handler
   *
   * @param error Axios error object
   * @throws Formatted error
   */
  private handleError(error: AxiosError): Promise<never> {
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

    // Log error
    console.error(`[API] Error ${status}:`, {
      url: error.config?.url,
      message: data?.detail || data?.message || error.message,
      data,
    });

    // Specific error handling
    const errorMessage = data?.detail || data?.message || 'An error occurred';

    if (status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
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
