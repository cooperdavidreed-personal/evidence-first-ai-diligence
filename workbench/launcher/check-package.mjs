import {readFile, lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// Integrity checks detect incomplete extraction or accidental edits, not publisher identity.
export async function checkPackage(root) {
  let manifest;
  try {
    const path = join(root, 'manifest.json');
    const meta = await lstat(path);
    if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 2_000_000) throw new Error();
    manifest = JSON.parse(await readFile(path, 'utf8'));
  } catch { throw new Error('Package manifest is missing or unreadable. Extract the original ZIP again into a new folder.'); }
  if (manifest?.format !== 'underwriting-desk.local-package/v1' || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Package manifest has an unsupported format. Extract the original ZIP again.');
  }
  const files = Object.entries(manifest.files);
  if (files.length === 0 || files.length > 10_000) throw new Error('Package manifest contains an invalid file list.');
  for (const name of ['start-desk.mjs', 'check-package.mjs', 'dist/index.html', 'mcp-server/local-server.mjs']) {
    if (!Object.hasOwn(manifest.files, name)) throw new Error(`Package manifest is incomplete: ${name}. Extract the original ZIP again.`);
  }
  for (const [name, receipt] of files) {
    const parts = name.split('/');
    if (!name || name.includes('\\') || name.includes(':') || parts.some(part => !part || part === '.' || part === '..' || /[\x00-\x1f]/.test(part)) || !Number.isSafeInteger(receipt?.bytes) || receipt.bytes < 0 || !/^[a-f0-9]{64}$/.test(receipt?.sha256 ?? '')) {
      throw new Error('Package manifest contains an invalid file entry. Extract the original ZIP again.');
    }
    let path = root;
    let meta;
    try {
      for (let index = 0; index < parts.length; index++) {
        path = join(path, parts[index]); meta = await lstat(path);
        if (meta.isSymbolicLink() || (index < parts.length - 1 ? !meta.isDirectory() : !meta.isFile())) throw new Error();
      }
    } catch { throw new Error(`Package file is missing or is not a regular file: ${name}. Extract the original ZIP again.`); }
    if (meta.size !== receipt.bytes || createHash('sha256').update(await readFile(path)).digest('hex') !== receipt.sha256) {
      throw new Error(`Package file has changed: ${name}. Extract the original ZIP again into a new folder. Your saved workspace is separate.`);
    }
  }
  return {fileCount: files.length};
}
