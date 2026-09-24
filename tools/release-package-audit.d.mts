export declare function auditPackageEntries(entries: string[]): {
  ok: boolean;
  rejected: string[];
};

export declare function collectPackageEntries(unpackedRoot: string): string[];
