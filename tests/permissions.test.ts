import { describe, expect, it } from 'vitest';
import { can, canWriteAnything, ROLES } from '@storyboard/core/model/permissions';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@storyboard/core/model/types';

describe('Rol yetki matrisi', () => {
  it('Sahip her şeyi yapabilir', () => {
    for (const cap of ['edit', 'annotate', 'export', 'invite', 'manageRoles', 'endSession'] as const) {
      expect(can('owner', cap), cap).toBe(true);
    }
  });

  it('Editör tam düzenleme yapar ama dışa aktaramaz', () => {
    expect(can('editor', 'edit')).toBe(true);
    expect(can('editor', 'annotate')).toBe(true);
    expect(can('editor', 'export')).toBe(false);
    expect(can('editor', 'invite')).toBe(false);
    expect(can('editor', 'manageRoles')).toBe(false);
  });

  it('Yorumcu yalnızca işaretleme yapar', () => {
    expect(can('commenter', 'annotate')).toBe(true);
    expect(can('commenter', 'edit')).toBe(false);
    expect(can('commenter', 'export')).toBe(false);
  });

  it('İzleyici salt okunurdur', () => {
    expect(canWriteAnything('viewer')).toBe(false);
    for (const cap of ['edit', 'annotate', 'export', 'invite', 'manageRoles'] as const) {
      expect(can('viewer', cap), cap).toBe(false);
    }
  });

  it('her rolün Türkçe etiketi ve açıklaması vardır', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });
});
