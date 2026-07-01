/**
 * Tests for APIClient service
 */
import axios from 'axios';

// Mock axios before importing the module
jest.mock('axios', () => {
  const mockInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  return {
    create: jest.fn(() => mockInstance),
    isCancel: jest.fn(() => false),
    __mockInstance: mockInstance,
  };
});

// Access the mock instance
let mockInstance: any;

describe('APIClient', () => {
  let apiClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear module cache to get fresh instance
    jest.resetModules();
    // Re-require after reset
    const mod = require('@/services/api_client');
    apiClient = mod.apiClient;
    mockInstance = require('axios').__mockInstance;
  });

  describe('Constructor', () => {
    it('creates axios instance with correct defaults', () => {
      expect(require('axios').create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('registers response interceptor', () => {
      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('registers request interceptor', () => {
      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('HTTP Methods', () => {
    it('get delegates to axios instance', async () => {
      mockInstance.get.mockResolvedValue({ data: { ok: true } });
      const result = await apiClient.get('/test');
      expect(mockInstance.get).toHaveBeenCalledWith('/test', undefined);
      expect(result.data.ok).toBe(true);
    });

    it('post delegates to axios instance', async () => {
      mockInstance.post.mockResolvedValue({ data: { id: 1 } });
      const result = await apiClient.post('/test', { name: 'test' });
      expect(mockInstance.post).toHaveBeenCalledWith('/test', { name: 'test' }, undefined);
    });

    it('put delegates to axios instance', async () => {
      mockInstance.put.mockResolvedValue({ data: {} });
      await apiClient.put('/test/1', { name: 'updated' });
      expect(mockInstance.put).toHaveBeenCalledWith('/test/1', { name: 'updated' }, undefined);
    });

    it('delete delegates to axios instance', async () => {
      mockInstance.delete.mockResolvedValue({ data: {} });
      await apiClient.delete('/test/1');
      expect(mockInstance.delete).toHaveBeenCalledWith('/test/1', undefined);
    });

    it('patch delegates to axios instance', async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });
      await apiClient.patch('/test/1', { status: 'active' });
      expect(mockInstance.patch).toHaveBeenCalledWith('/test/1', { status: 'active' }, undefined);
    });
  });

  describe('healthCheck', () => {
    it('returns true on success', async () => {
      mockInstance.get.mockResolvedValue({ status: 200 });
      const result = await apiClient.healthCheck();
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockInstance.get.mockRejectedValue(new Error('timeout'));
      const result = await apiClient.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('getBaseURL', () => {
    it('returns the configured base URL', () => {
      const url = apiClient.getBaseURL();
      expect(typeof url).toBe('string');
    });
  });

  describe('401 handling (silent refresh + cross-tab logout)', () => {
    // Grabs the rejection handler passed to interceptors.response.use(success, errorHandler)
    const getErrorHandler = () => mockInstance.interceptors.response.use.mock.calls[0][1];

    const makeError = (url: string, overrides: Record<string, any> = {}) => ({
      response: { status: 401, data: { detail: 'Usuário não identificado' } },
      config: { url, headers: {}, ...overrides },
      isAxiosError: true,
    });

    beforeEach(() => {
      document.cookie = 'auth_state=1';
      delete (window as any).location;
      (window as any).location = { href: '', pathname: '/admin/tickets' };
    });

    afterEach(() => {
      document.cookie = 'auth_state=; expires=Thu, 01 Jan 1970 00:00:00 UTC';
    });

    it('retries the original request after a successful silent refresh, without logging out', async () => {
      mockInstance.post.mockImplementation((url: string) => {
        if (url === '/api/v1/auth/refresh') return Promise.resolve({ data: {} });
        return Promise.resolve({ data: { ok: true } });
      });
      mockInstance.request = jest.fn().mockResolvedValue({ data: { ok: true } });

      const errorHandler = getErrorHandler();
      const result = await errorHandler(makeError('/api/v1/admin/tickets'));

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/api/v1/auth/refresh',
        undefined,
        expect.objectContaining({ skipAutoLogout: true }),
      );
      expect(mockInstance.request).toHaveBeenCalled();
      expect(result).toEqual({ data: { ok: true } });
      // Real logout must NOT have been triggered
      expect(mockInstance.post).not.toHaveBeenCalledWith('/api/v1/auth/logout');
      expect(window.location.href).toBe('');
    });

    it('dedupes concurrent refresh calls into a single POST /auth/refresh', async () => {
      let resolveRefresh: (v: any) => void;
      mockInstance.post.mockImplementation((url: string) => {
        if (url === '/api/v1/auth/refresh') {
          return new Promise((resolve) => {
            resolveRefresh = resolve;
          });
        }
        return Promise.resolve({ data: {} });
      });
      mockInstance.request = jest.fn().mockResolvedValue({ data: { ok: true } });

      const errorHandler = getErrorHandler();
      const p1 = errorHandler(makeError('/api/v1/admin/tickets'));
      const p2 = errorHandler(makeError('/api/v1/admin/subscription'));

      resolveRefresh!({ data: {} });
      await Promise.all([p1, p2]);

      const refreshCalls = mockInstance.post.mock.calls.filter((c: any[]) => c[0] === '/api/v1/auth/refresh');
      expect(refreshCalls).toHaveLength(1);
    });

    it('falls back to full logout and broadcasts to other tabs when refresh fails', async () => {
      mockInstance.post.mockImplementation((url: string) => {
        if (url === '/api/v1/auth/refresh') return Promise.reject(new Error('refresh_token expired'));
        if (url === '/api/v1/auth/logout') return Promise.resolve({ data: {} });
        return Promise.resolve({ data: {} });
      });

      const postMessage = jest.fn();
      (apiClient as any).authChannel = { postMessage };

      const errorHandler = getErrorHandler();
      await expect(errorHandler(makeError('/api/v1/admin/tickets'))).rejects.toBeTruthy();

      expect(mockInstance.post).toHaveBeenCalledWith('/api/v1/auth/logout');
      expect(postMessage).toHaveBeenCalledWith('logout');
      expect(window.location.href).toBe('/login');
    });

    it('does not attempt refresh for the refresh/login endpoints themselves (no infinite loop)', async () => {
      mockInstance.post.mockResolvedValue({ data: {} });

      const errorHandler = getErrorHandler();
      await expect(errorHandler(makeError('/api/v1/auth/refresh'))).rejects.toBeTruthy();

      const refreshCalls = mockInstance.post.mock.calls.filter((c: any[]) => c[0] === '/api/v1/auth/refresh');
      expect(refreshCalls).toHaveLength(0);
    });

    it('does not retry a request that has already been retried once', async () => {
      mockInstance.post.mockResolvedValue({ data: {} });

      const errorHandler = getErrorHandler();
      await expect(
        errorHandler(makeError('/api/v1/admin/tickets', { _retry: true })),
      ).rejects.toBeTruthy();

      const refreshCalls = mockInstance.post.mock.calls.filter((c: any[]) => c[0] === '/api/v1/auth/refresh');
      expect(refreshCalls).toHaveLength(0);
      expect(mockInstance.post).toHaveBeenCalledWith('/api/v1/auth/logout');
    });
  });
});
