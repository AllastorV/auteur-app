export declare function auditPackageEntries(entries: string[]): {
  ok: boolean;
  rejected: string[];
};

export declare function collectPackageEntries(unpackedRoot: string): string[];
export declare function auditFfmpegBundle(
  unpackedRoot: string,
  buildRecordPath: string,
  sourceManifestPath: string,
  inspectImports?: (binary: string) => string[],
): { ok: boolean; errors: string[] };
