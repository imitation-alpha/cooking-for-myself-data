import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

export function readRecordSet(root, relativeDir, collectionKey) {
  const dir = path.join(root, relativeDir);
  const meta = readJson(root, path.join(relativeDir, '_meta.json'));
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json') && file !== '_meta.json');
  const orderedFiles = Array.isArray(meta.recordOrder)
    ? meta.recordOrder.map((id) => id + '.json')
    : files.sort();
  const missing = orderedFiles.filter((file) => !files.includes(file));
  if (missing.length > 0) {
    throw new Error(relativeDir + ' recordOrder references missing files: ' + missing.join(', '));
  }
  const unlisted = files.filter((file) => !orderedFiles.includes(file)).sort();
  if (unlisted.length > 0) {
    throw new Error(relativeDir + ' has files missing from recordOrder: ' + unlisted.join(', '));
  }

  const records = orderedFiles.map((file) => {
      const record = readJson(root, path.join(relativeDir, file));
      const expectedId = path.basename(file, '.json');
      if (record.id !== expectedId) {
        throw new Error(relativeDir + '/' + file + ' id must be ' + expectedId);
      }
      return record;
    });

  return { meta, [collectionKey]: records };
}
