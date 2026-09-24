export declare function verifySha256(bytes: Buffer, expected: string): void;
export declare function fetchLockedSources(lockFile: string, outDir: string): Promise<string>;
export declare function bundleSources(sourceDir: string, outputZip: string, lockFile?: string): Promise<void>;
