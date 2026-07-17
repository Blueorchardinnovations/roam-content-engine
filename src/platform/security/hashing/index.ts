import { createHash } from 'node:crypto';

/**
 * Computes a deterministic SHA-256 hash of transcript content.
 *
 * This is the canonical hashing algorithm used throughout
 * the RoaM Platform for transcript identity, deduplication,
 * version detection, and idempotency.
 */
export function computeTranscriptHash(
  transcript: string
): string {
  return createHash('sha256')
    .update(normalizeTranscript(transcript), 'utf8')
    .digest('hex');
}

/**
 * Normalizes transcript text prior to hashing.
 *
 * Normalization ensures semantically identical transcripts
 * generate identical hashes even when whitespace differs.
 */
export function normalizeTranscript(
  transcript: string
): string {
  return transcript
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
