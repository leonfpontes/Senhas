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
});
