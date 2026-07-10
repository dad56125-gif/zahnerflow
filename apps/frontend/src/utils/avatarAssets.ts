const PRESET_AVATAR_PATTERN = /^(?:\.\/|\/)?presets\/preset_(\d+)\.png$/;
const VITE_BASE_URL = ((import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL || './');

export function presetAvatarUrl(presetNum: number): string {
  return `${VITE_BASE_URL}presets/preset_${presetNum}.png`;
}

export function resolveAvatarSrc(avatar?: string | null): string {
  if (!avatar) return '';

  const match = avatar.match(PRESET_AVATAR_PATTERN);
  if (!match) return avatar;

  return presetAvatarUrl(Number(match[1]));
}
