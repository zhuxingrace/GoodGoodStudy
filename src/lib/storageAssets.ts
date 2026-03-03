import { createUuid } from './id';
import { supabase } from './supabase';
import type { EntryAttachment } from '../types';

export const STUDY_UPLOAD_BUCKET = 'study-uploads';

type SignedUrlCacheEntry = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, SignedUrlCacheEntry>();

const sanitizeFilename = (filename: string) =>
  filename
    .trim()
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'upload';

export const buildStudyUploadPath = (userId: string, entryId: string, filename: string) =>
  `${userId}/${entryId}/${createUuid()}-${sanitizeFilename(filename)}`;

export const uploadStudyAsset = async (
  file: File,
  userId: string,
  entryId: string,
): Promise<EntryAttachment> => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const path = buildStudyUploadPath(userId, entryId, file.name);
  const { error } = await supabase.storage.from(STUDY_UPLOAD_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) {
    throw error;
  }

  return {
    id: createUuid(),
    name: file.name,
    bucket: STUDY_UPLOAD_BUCKET,
    path,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    created_at: new Date().toISOString(),
  };
};

export const getSignedStudyUrl = async (path: string, expiresInSeconds = 3600) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const cacheKey = `${STUDY_UPLOAD_BUCKET}:${path}`;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now + 30_000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage.from(STUDY_UPLOAD_BUCKET).createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw error ?? new Error('Unable to create a signed URL for this asset.');
  }

  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: now + expiresInSeconds * 1000,
  });

  return data.signedUrl;
};
