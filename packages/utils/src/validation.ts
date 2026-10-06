/** Loose but practical email check — Supabase still validates server-side. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Returns a user-facing error message when the password is unacceptable,
 * or `null` when it is fine.
 */
export function passwordError(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 72) return 'Password must be at most 72 characters.';
  return null;
}

/** Lowercase + trim a username so matching stays unambiguous. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * Username rules mirrored from the `profiles_username_format` DB check —
 * returns a user-facing message or `null` when acceptable.
 */
export function usernameError(username: string): string | null {
  if (username.length < 3 || username.length > 30) {
    return 'Username must be 3–30 characters.';
  }
  if (!/^[a-z0-9._]+$/.test(username)) {
    return 'Only lowercase letters, numbers, dots and underscores.';
  }
  if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) {
    return 'Username cannot start or end with a dot, or contain two dots.';
  }
  return null;
}

/** Minimal structural file shape — keeps this package free of DOM types. */
export interface FileLike {
  name: string;
  type: string;
  size: number;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Upload validation (client side; the bucket's allowed_mime_types and
 * file_size_limit enforce the same rules server-side).
 */
export function validateImageFile(file: FileLike, maxMegabytes: number): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG or WEBP images are allowed.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > maxMegabytes * 1024 * 1024) {
    return `Image must be smaller than ${maxMegabytes} MB.`;
  }
  return null;
}

/** Story media: images pass through fast, videos may fill the whole bucket. */
const ALLOWED_STORY_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

/**
 * Client-side story upload validation (type + size). The `story-media` bucket
 * repeats both rules server-side via `allowed_mime_types` / `file_size_limit`,
 * so a tampered client can bypass this but never the database.
 */
export function validateStoryFile(file: FileLike, maxMegabytes: number): string | null {
  if (!ALLOWED_STORY_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, WEBP, MP4, MOV or WEBM files can be shared as a story.';
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > maxMegabytes * 1024 * 1024) {
    return `Story media must be smaller than ${maxMegabytes} MB.`;
  }
  return null;
}

/**
 * Minimal structural shape of something whose first bytes can be read
 * (`Blob` / `File` satisfy it). Keeps this package free of DOM types.
 */
export interface ByteSource {
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

/** `ftyp`-style brands and legacy QuickTime atoms that both mean MP4/MOV. */
const CONTAINER_BRANDS: Record<'video/mp4' | 'video/quicktime', string[]> = {
  'video/mp4': ['ftyp'],
  'video/quicktime': ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'],
};

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function matchesAt(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

/** Byte patterns of the formats the social buckets accept. */
const MEDIA_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) => matchesAt(bytes, 0, [0xff, 0xd8, 0xff]),
  'image/png': (bytes) =>
    matchesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  // RIFF container whose form type at offset 8 reads "WEBP".
  'image/webp': (bytes) =>
    matchesAt(bytes, 0, ascii('RIFF')) && matchesAt(bytes, 8, ascii('WEBP')),
  // ISO base media files: a box size followed by the fourcc at offset 4.
  'video/mp4': (bytes) => matchesAt(bytes, 4, ascii('ftyp')),
  'video/quicktime': (bytes) =>
    CONTAINER_BRANDS['video/quicktime'].some((brand) => matchesAt(bytes, 4, ascii(brand))),
  // Matroska / WebM EBML header.
  'video/webm': (bytes) => matchesAt(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3]),
};

/**
 * Security rule: never trust a filename or the `type` a browser reports.
 * Reads the file's magic bytes and rejects content that does not match the
 * declared MIME type (a renamed executable, an HTML file, a broken export…).
 *
 * Returns a user-facing message, or `null` when the content checks out.
 */
export async function checkMediaSignature(
  file: ByteSource,
  declaredType: string,
): Promise<string | null> {
  const check = MEDIA_SIGNATURES[declaredType];
  if (!check) return 'That file type cannot be shared here.';

  let buffer: ArrayBuffer;
  try {
    buffer = await file.slice(0, 16).arrayBuffer();
  } catch {
    return 'That file could not be read. Please pick another one.';
  }

  if (!check(new Uint8Array(buffer))) {
    return 'The file contents do not match its type — it may be renamed or corrupted.';
  }
  return null;
}

const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

/**
 * Upload validation for reels (client side; the `reel-media` bucket repeats
 * the same MIME and size limits server-side).
 */
export function validateVideoFile(file: FileLike, maxMegabytes: number): string | null {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return 'Only MP4, MOV or WEBM videos are allowed.';
  }
  if (file.size === 0) {
    return 'That file is empty.';
  }
  if (file.size > maxMegabytes * 1024 * 1024) {
    return `Video must be smaller than ${maxMegabytes} MB.`;
  }
  return null;
}

/** Turn any thrown value into a message that is safe to display. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong. Please try again.';
}
