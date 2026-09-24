/** A project map is not a World entity; only this reserved map key may start with @. */
export const PROJECT_MAP_ID = '@project' as const;

export function validMapId(id: unknown): id is string {
  return id === PROJECT_MAP_ID ||
    (typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id));
}
