import type { IncomingMessage } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, lstat, open, unlink, copyFile, rename, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { RELEASE_API, type UpdateAsset } from './release.js';

export interface UpdateTransport {
  request(url: string, signal: AbortSignal, headers?: Record<string, string>, attempt?: number): Promise<IncomingMessage>;
  json(url: string, signal: AbortSignal): Promise<unknown>;
}
const CHUNK_SIZE = 4 * 1024 ** 2;
const CONCURRENCY = 4;

function assertActive(signal: AbortSignal): void { signal.throwIfAborted(); }
function rangeValid(response: IncomingMessage, start: number, end: number, size: number): boolean {
  return response.statusCode === 206 && response.headers['content-range'] === `bytes ${start}-${end}/${size}` &&
    Number(response.headers['content-length']) === end - start + 1;
}

/** 只跟随官方 HTTPS 下载端点；最终端点仍由 transport 校验。 */
async function binary(transport: UpdateTransport, url: string, signal: AbortSignal, headers: Record<string, string>, attempt = 0): Promise<{ response: IncomingMessage; url: string }> {
  for (let redirects = 0; redirects < 4; redirects++) {
    assertActive(signal);
    const response = await transport.request(url, signal, { Accept: 'application/octet-stream', ...headers }, attempt);
    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new Error('官方下载地址缺失。');
      const next = new URL(location, url);
      if (next.protocol !== 'https:' || next.hostname !== 'release-assets.githubusercontent.com' || next.username || next.password || (next.port && next.port !== '443')) {
        throw new Error('拒绝非官方安装包下载地址。');
      }
      url = next.href;
    } else return { response, url };
  }
  throw new Error('下载重定向次数过多。');
}

async function sizeOf(path: string): Promise<number> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('更新缓存路径无效。');
    return stat.size;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
}

export async function downloadUpdate(options: {
  transport: UpdateTransport; asset: UpdateAsset; cacheRoot: string; downloadsRoot: string;
  signal: AbortSignal; onProgress: (bytes: number) => void; onVerifying: () => void;
}): Promise<string> {
  const { transport, asset, signal, onProgress, onVerifying } = options;
  const directory = join(options.cacheRoot, `${asset.id}-${asset.sha256}`);
  await mkdir(directory, { recursive: true });
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('更新缓存目录无效。');
  const apiUrl = `${RELEASE_API}/assets/${asset.id}`;
  let downloadUrl = apiUrl;
  const probe = await binary(transport, apiUrl, signal, { Range: 'bytes=0-0' });
  const etag = probe.response.headers.etag;
  if (!rangeValid(probe.response, 0, 0, asset.size) || !etag || etag.startsWith('W/')) {
    probe.response.destroy();
    throw new Error('服务器未提供可验证的分段下载，请稍后重试。');
  }
  // Consume the one-byte probe so its socket can be reused.
  for await (const _ of probe.response) { assertActive(signal); }
  downloadUrl = probe.url;
  const manifestPath = join(directory, 'manifest.json');
  const identity = JSON.stringify({ id: asset.id, size: asset.size, sha256: asset.sha256, etag });
  let previous = '';
  try { previous = await readFile(manifestPath, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const count = Math.ceil(asset.size / CHUNK_SIZE);
  const paths = Array.from({ length: count }, (_, i) => join(directory, `${i}.part`));
  if (previous !== identity) for (const path of paths) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await writeFile(manifestPath, identity);
  const sizes = await Promise.all(paths.map(sizeOf));
  for (let i = 0; i < count; i++) {
    if (sizes[i] > Math.min(CHUNK_SIZE, asset.size - i * CHUNK_SIZE)) {
      await unlink(paths[i]); sizes[i] = 0;
    }
  }
  const progress = () => onProgress(sizes.reduce((sum, size) => sum + size, 0));
  progress();
  const stop = new AbortController();
  const workerSignal = AbortSignal.any([signal, stop.signal]);
  let refresh: Promise<string> | undefined;
  async function renewUrl(): Promise<string> {
    if (!refresh) refresh = (async () => {
      const result = await binary(transport, apiUrl, workerSignal, { Range: 'bytes=0-0' });
      if (!rangeValid(result.response, 0, 0, asset.size) || result.response.headers.etag !== etag) {
        result.response.destroy(); throw new Error('安装包已发生变化，请重新检查更新。');
      }
      for await (const _ of result.response) { assertActive(workerSignal); }
      downloadUrl = result.url;
      return result.url;
    })().finally(() => { refresh = undefined; });
    return refresh;
  }
  async function part(index: number): Promise<void> {
    const end = Math.min(asset.size, (index + 1) * CHUNK_SIZE) - 1;
    const length = end - index * CHUNK_SIZE + 1;
    for (let attempt = 0; sizes[index] < length && attempt < 8; attempt++) {
      assertActive(workerSignal);
      const start = index * CHUNK_SIZE + sizes[index];
      const attemptSignal = AbortSignal.any([workerSignal, AbortSignal.timeout(30_000)]);
      let response: IncomingMessage | undefined;
      try {
        ({ response } = await binary(transport, downloadUrl, attemptSignal, { Range: `bytes=${start}-${end}`, 'If-Range': etag! }, index + attempt));
        if ([401, 403].includes(response.statusCode ?? 0)) {
          response.destroy(); await renewUrl(); continue;
        }
        if (!rangeValid(response, start, end, asset.size) || response.headers.etag !== etag) {
          throw new Error('安装包分段校验失败，未追加无效响应。');
        }
        const file = await open(paths[index], 'a');
        try {
          for await (const data of response) {
            assertActive(workerSignal);
            const buffer = data as Buffer;
            if (sizes[index] + buffer.length > length) throw new Error('下载分段超出预期大小。');
            await file.writeFile(buffer);
            sizes[index] += buffer.length;
            progress();
          }
        } finally { await file.close(); }
        if (sizes[index] !== length || !response.complete) throw new Error('下载连接提前结束。');
      } catch (error) {
        assertActive(workerSignal);
        // Only bytes written after validating the exact range and ETag survive a retry.
        sizes[index] = await sizeOf(paths[index]);
        if (attempt === 7) throw new Error(`安装包下载中断，可点击重试继续下载。${error instanceof Error ? error.message : ''}`);
      } finally { response?.destroy(); }
    }
    if (sizes[index] !== length) throw new Error('下载地址持续失效，请重新检查更新后重试。');
  }
  let cursor = 0;
  let failure: unknown;
  await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, count) }, async () => {
    try { while (cursor < count) { const index = cursor++; await part(index); } }
    catch (error) { failure ??= error; stop.abort(); }
  }));
  assertActive(signal);
  if (failure) throw failure;
  onVerifying();
  const assembled = join(directory, 'verified.partial');
  const output = await open(assembled, 'w');
  const digest = createHash('sha256');
  try {
    for (const path of paths) {
      for await (const data of createReadStream(path)) {
        assertActive(signal); digest.update(data); await output.writeFile(data);
      }
    }
    await output.sync();
  } finally { await output.close(); }
  if ((await sizeOf(assembled)) !== asset.size || digest.digest('hex') !== asset.sha256) {
    for (const path of [...paths, assembled, manifestPath]) await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    throw new Error('安装包 SHA256 校验失败，缓存已清理，请重新下载。');
  }
  assertActive(signal);
  const downloads = join(options.downloadsRoot, 'ZahnerFlow');
  await mkdir(downloads, { recursive: true });
  // A unique directory prevents overwriting any existing user download.
  const destination = await mkdtemp(join(downloads, `${asset.id}-`));
  const finalPath = join(destination, asset.name);
  const pending = `${finalPath}.partial`;
  try {
    await copyFile(assembled, pending);
    assertActive(signal);
    await rename(pending, finalPath);
  } catch (error) { await unlink(pending).catch(() => undefined); throw error; }
  return finalPath;
}
