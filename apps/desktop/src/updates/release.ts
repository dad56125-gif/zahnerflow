import type { DesktopUpdateRelease } from '@zahnerflow/types';

export const RELEASE_API = 'https://api.github.com/repos/dad56125-gif/zahnerflow/releases';
export interface UpdateAsset { id: number; name: string; size: number; sha256: string }
export interface ParsedRelease { info: DesktopUpdateRelease; asset?: UpdateAsset }

export function parseVersion(value: string): number[] {
  const match = /^(?:release\/)?v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) throw new Error('版本号格式无效，无法比较更新。');
  const result = match.slice(1).map(Number);
  if (!result.every(Number.isSafeInteger)) throw new Error('版本号超出支持范围。');
  return result;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate), b = parseVersion(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GitHub 返回的版本信息无效。');
  return value as Record<string, unknown>;
}

export function parseRelease(value: unknown, platform: string, arch: string): ParsedRelease {
  const data = record(value);
  if (data.draft !== false || data.prerelease !== false || typeof data.tag_name !== 'string') {
    throw new Error('未获取到有效的正式发行版。');
  }
  const version = parseVersion(data.tag_name).join('.');
  const info: DesktopUpdateRelease = {
    version, tag: data.tag_name,
    name: typeof data.name === 'string' ? data.name.slice(0, 200) : `ZahnerFlow ${version}`,
    notes: typeof data.body === 'string' ? data.body.slice(0, 50_000) : '',
    publishedAt: typeof data.published_at === 'string' ? data.published_at : '',
    canDownload: false,
  };
  if (platform !== 'win32' || arch !== 'x64') {
    info.unsupportedReason = '当前提供 Windows x64 安装包，此平台暂不支持下载。';
    return { info };
  }
  const name = `ZAHNERFLOW.Setup.${version}.exe`;
  const candidates = Array.isArray(data.assets) ? data.assets.filter(a => a && typeof a === 'object' && a.name === name) : [];
  if (candidates.length !== 1) {
    info.unsupportedReason = '此版本尚未发布 Windows x64 安装包。';
    return { info };
  }
  const item = record(candidates[0]);
  if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || !Number.isSafeInteger(item.size) || Number(item.size) <= 0 || Number(item.size) > 4 * 1024 ** 3) {
    throw new Error('安装包的大小或标识无效。');
  }
  if (typeof item.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(item.digest)) {
    info.unsupportedReason = '此安装包缺少有效的 SHA256，暂不能安全下载。';
    return { info };
  }
  info.canDownload = true;
  info.assetName = name;
  info.assetSize = Number(item.size);
  return { info, asset: { id: Number(item.id), name, size: Number(item.size), sha256: item.digest.slice(7).toLowerCase() } };
}
