import { isAbsolute, relative, resolve, sep } from 'node:path';

export interface MediaStorage {
  readonly rootPath: string;
  resolvePath(storageKey: string): string;
}

export function createMediaStorage(rootDirectory: string): MediaStorage {
  const rootPath = resolve(rootDirectory);

  return {
    rootPath,
    resolvePath(storageKey) {
      if (!storageKey || isAbsolute(storageKey)) {
        throw new Error('Storage key must be a non-empty relative path inside the media root');
      }

      const filePath = resolve(rootPath, storageKey);
      const pathFromRoot = relative(rootPath, filePath);

      if (
        pathFromRoot === '' ||
        pathFromRoot === '..' ||
        pathFromRoot.startsWith(`..${sep}`) ||
        isAbsolute(pathFromRoot)
      ) {
        throw new Error('Storage key must resolve to a file inside the media root');
      }

      return filePath;
    },
  };
}
