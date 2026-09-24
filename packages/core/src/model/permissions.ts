import type { Role } from './types';

export type Capability =
  | 'edit'          // ana içeriği düzenle
  | 'annotate'      // yorum / işaretleme katmanına yaz
  | 'export'        // dışa aktar
  | 'invite'        // davet et
  | 'manageRoles'   // rol değiştir
  | 'endSession';   // oturumu kapat

const MATRIX: Record<Role, Capability[]> = {
  owner: ['edit', 'annotate', 'export', 'invite', 'manageRoles', 'endSession'],
  editor: ['edit', 'annotate'],
  commenter: ['annotate'],
  viewer: [],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

/** Bir rolün herhangi bir yazma yetkisi var mı? */
export function canWriteAnything(role: Role): boolean {
  return can(role, 'edit') || can(role, 'annotate');
}

export const ROLES: Role[] = ['owner', 'editor', 'commenter', 'viewer'];
