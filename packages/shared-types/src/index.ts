/**
 * API Contract Types - Shared Types Package
 * 
 * This file contains TypeScript interfaces for all API contracts
 * between backend and frontend in the Senhas system.
 */

// ============================================================================
// PRIORITY CATEGORY (Preferential queue)
// ============================================================================

/**
 * Priority categories for preferential queue ordering.
 * Order: ELDERLY > DISABILITY_OR_AUTISM > PREGNANT_LACTATING_OR_INFANT > REDUCED_MOBILITY
 */
export const PriorityCategory = {
  ELDERLY: 'ELDERLY',
  DISABILITY_OR_AUTISM: 'DISABILITY_OR_AUTISM',
  PREGNANT_LACTATING_OR_INFANT: 'PREGNANT_LACTATING_OR_INFANT',
  REDUCED_MOBILITY: 'REDUCED_MOBILITY',
} as const;

export type PriorityCategoryType = typeof PriorityCategory[keyof typeof PriorityCategory];

/** Ordered array from highest to lowest priority. */
export const PRIORITY_ORDER: PriorityCategoryType[] = [
  PriorityCategory.ELDERLY,
  PriorityCategory.DISABILITY_OR_AUTISM,
  PriorityCategory.PREGNANT_LACTATING_OR_INFANT,
  PriorityCategory.REDUCED_MOBILITY,
];

/** Portuguese labels for each priority category. */
export const PRIORITY_CATEGORY_LABELS: Record<PriorityCategoryType, string> = {
  [PriorityCategory.ELDERLY]: 'Idoso (60+)',
  [PriorityCategory.DISABILITY_OR_AUTISM]: 'PcD / TEA',
  [PriorityCategory.PREGNANT_LACTATING_OR_INFANT]: 'Gestante, Lactante ou Criança de colo',
  [PriorityCategory.REDUCED_MOBILITY]: 'Mobilidade Reduzida',
};

// ============================================================================
// COMMON TYPES
// ============================================================================

export type UUID = string & { readonly brand: 'UUID' };

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  success: boolean;
}

// ============================================================================
// TENANT TYPES
// ============================================================================

export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  description?: string;
  is_active?: boolean;
}

// ============================================================================
// USER TYPES
// ============================================================================

export type UserRole = 'admin' | 'member';

export interface User {
  id: UUID;
  tenant_id: UUID;
  email: string;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRequest {
  email: string;
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  email?: string;
  username?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ============================================================================
// PASSWORD ENTRY TYPES
// ============================================================================

export type PasswordStatus = 'active' | 'archived' | 'deleted';

export interface PasswordEntry {
  id: UUID;
  tenant_id: UUID;
  title: string;
  description?: string;
  category?: string;
  status: PasswordStatus;
  created_by: UUID;
  created_at: string;
  updated_at: string;
}

export interface CreatePasswordRequest {
  title: string;
  description?: string;
  category?: string;
  value: string;
}

export interface UpdatePasswordRequest {
  title?: string;
  description?: string;
  category?: string;
  value?: string;
  status?: PasswordStatus;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export type AuditAction = 'create' | 'read' | 'update' | 'delete';

export interface AuditLog {
  id: UUID;
  tenant_id: UUID;
  user_id?: UUID;
  action: AuditAction;
  resource_type: string;
  resource_id?: UUID;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface QueryAuditLogsRequest {
  resource_type?: string;
  action?: AuditAction;
  user_id?: UUID;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}
