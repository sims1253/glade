export function isMacPlatform(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().startsWith('mac');
  }
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform === 'darwin';
  }
  return false;
}

export function isWindowsPlatform(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().startsWith('win');
  }
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform === 'win32';
  }
  return false;
}

export function isLinuxPlatform(): boolean {
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().startsWith('linux');
  }
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform === 'linux';
  }
  return false;
}
