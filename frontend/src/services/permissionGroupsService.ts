import { apiClient } from './api_client';
import { PermissionFeature } from '../constants/permissionFeatures';

export interface GroupPermission {
  id?: string;
  group_id?: string;
  feature: PermissionFeature;
  can_view: boolean;
  can_insert: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface PermissionGroup {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  version: number;
  created_at: string;
  updated_at: string;
  members_count: number;
  features_configured_count: number;
}

export interface GroupMember {
  id: string;
  email: string;
  username: string;
  role?: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  description?: string;
}

export interface SetGroupPermissionsRequest {
  permissions: {
    feature: PermissionFeature;
    can_view: boolean;
    can_insert: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }[];
  version: number;
}

export const permissionGroupsService = {
  listGroups: async (): Promise<PermissionGroup[]> => {
    const res = await apiClient.get<PermissionGroup[]>('/api/v1/admin/permission-groups');
    return res.data;
  },

  createGroup: async (data: CreateGroupRequest): Promise<PermissionGroup> => {
    const res = await apiClient.post<PermissionGroup>('/api/v1/admin/permission-groups', data);
    return res.data;
  },

  getGroup: async (id: string): Promise<PermissionGroup> => {
    const res = await apiClient.get<PermissionGroup>(`/api/v1/admin/permission-groups/${id}`);
    return res.data;
  },

  updateGroup: async (id: string, data: UpdateGroupRequest): Promise<PermissionGroup> => {
    const res = await apiClient.put<PermissionGroup>(`/api/v1/admin/permission-groups/${id}`, data);
    return res.data;
  },

  deleteGroup: async (id: string, force = false): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/permission-groups/${id}`, {
      params: { force },
    });
  },

  getGroupPermissions: async (id: string): Promise<GroupPermission[]> => {
    const res = await apiClient.get<GroupPermission[]>(`/api/v1/admin/permission-groups/${id}/permissions`);
    return res.data;
  },

  setGroupPermissions: async (id: string, data: SetGroupPermissionsRequest): Promise<PermissionGroup> => {
    const res = await apiClient.put<PermissionGroup>(`/api/v1/admin/permission-groups/${id}/permissions`, data);
    return res.data;
  },

  getGroupMembers: async (id: string): Promise<GroupMember[]> => {
    const res = await apiClient.get<GroupMember[]>(`/api/v1/admin/permission-groups/${id}/members`);
    return res.data;
  },

  addMember: async (id: string, userId: string): Promise<GroupMember> => {
    const res = await apiClient.post<GroupMember>(`/api/v1/admin/permission-groups/${id}/members`, {
      user_id: userId,
    });
    return res.data;
  },

  removeMember: async (id: string, userId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/admin/permission-groups/${id}/members/${userId}`);
  },

  getMyPermissions: async (): Promise<Record<PermissionFeature, Record<string, boolean>>> => {
    const res = await apiClient.get<Record<PermissionFeature, Record<string, boolean>>>('/api/v1/admin/permission-groups/me/permissions');
    return res.data;
  },
};
