/**
 * The outcome of uploading one file.
 *
 * Shared between the upload route handler and the client that calls it, so the
 * two cannot drift. Files are uploaded one request at a time, so a slow or
 * rejected file never stalls or fails the rest of the batch.
 */
export type UploadResult =
  | { status: "uploaded"; filename: string }
  | { status: "skipped"; filename: string }
  | { status: "failed"; filename: string; error: string };
