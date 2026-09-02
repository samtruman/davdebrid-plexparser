const VIDEO_EXTENSIONS = new Set([
  '3g2', '3gp', 'avi', 'flv', 'mkv', 'mk3d', 'mov', 'mp2', 'mp4', 'm4v',
  'mpe', 'mpeg', 'mpg', 'mpv', 'webm', 'wmv', 'ogm', 'ts', 'm2ts'
]);

// Strong episode markers used by Plex-style media naming.
const EPISODE_PATTERNS = [
  /\bS\d{1,2}\s*E\d{1,3}\b/i,
  /\bS\d{1,2}[^A-Za-z0-9]+E\d{1,3}\b/i,
  /\b\d{1,2}x\d{1,3}\b/i,
  /\b(?:season|stagione)[ ._-]*\d{1,2}[ ._-]*(?:episode|episodio)[ ._-]*\d{1,3}\b/i
];

function baseName(name = '') {
  return String(name)
    .split(/[\\/]/).pop()
    .replace(/\.[^.]+$/, '');
}

function hasEpisodeMarker(name) {
  const value = baseName(name);
  return EPISODE_PATTERNS.some(pattern => pattern.test(value));
}

export function classifyMedia(file = {}) {
  const name = file.name || '';
  const type = file.type || '';

  if (type !== 'video' && type !== 'subtitle') {
    return null;
  }

  if (hasEpisodeMarker(name)) {
    return 'show';
  }

  // Preserve a conservative fallback for files where the extension/type is
  // supplied by an older Debrid implementation.
  if (!type) {
    const extension = String(name).split('.').pop().toLowerCase();
    if (!VIDEO_EXTENSIONS.has(extension)) {
      return null;
    }
  }

  return 'movie';
}

export function isShow(file) {
  return classifyMedia(file) === 'show';
}

export function isMovie(file) {
  return classifyMedia(file) === 'movie';
}

export default classifyMedia;
