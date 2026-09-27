import { supabase } from "@/lib/supabase";

/**
 * Resolve a storage object (private bucket path) to a temporary signed URL.
 * If the value is already a full URL, it is returned as-is.
 */
export async function signedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function signedUrls(
  bucket: string,
  paths: string[] | null | undefined,
  expiresIn = 3600
): Promise<string[]> {
  if (!paths?.length) return [];
  const resolved = await Promise.all(paths.map((p) => signedUrl(bucket, p, expiresIn)));
  return resolved.filter((u): u is string => !!u);
}
