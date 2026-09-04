import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES } from "@/lib/materials/constants";

/**
 * Direct-to-storage upload authorisation.
 *
 * The file no longer passes through the app server, which removes a whole class
 * of host limits but means the server must be careful about what it takes on
 * trust. Three things matter and are covered here: ownership is checked before
 * a signed URL is minted, the storage path is chosen by the server rather than
 * the client, and the client's claim to have uploaded is verified against
 * storage rather than believed.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";

const courseFindFirst = vi.fn();
const materialFindFirst = vi.fn();
const materialCreate = vi.fn();
const materialUpdate = vi.fn();
const requireUser = vi.fn();
const createUploadUrl = vi.fn();
const statMaterial = vi.fn();
const processMaterial = vi.fn();
const after = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    course: { findFirst: courseFindFirst },
    material: {
      findFirst: materialFindFirst,
      create: materialCreate,
      update: materialUpdate,
    },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/materials/process", () => ({ processMaterial }));
vi.mock("@/lib/materials/storage", () => ({
  createUploadUrl,
  statMaterial,
  buildStoragePath: (userId: string, courseId: string, materialId: string, name: string) =>
    `${userId}/${courseId}/${materialId}-${name}`,
}));

const { finishUploadAction, startUploadAction } = await import(
  "@/app/(app)/courses/[courseId]/materials/upload-actions"
);

function start(overrides: Partial<Parameters<typeof startUploadAction>[0]> = {}) {
  return startUploadAction({
    courseId: "course-1",
    filename: "Lecture 01.pdf",
    mimeType: "application/pdf",
    sizeBytes: 5_000_000,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: OWNER, email: "owner@example.com", name: "Owner" });
  courseFindFirst.mockResolvedValue({ id: "course-1" });
  materialFindFirst.mockResolvedValue(null);
  materialCreate.mockResolvedValue({ id: "material-1" });
  materialUpdate.mockResolvedValue({});
  createUploadUrl.mockResolvedValue({
    ok: true,
    token: "signed-token",
    path: `${OWNER}/course-1/material-1-Lecture 01.pdf`,
  });
  statMaterial.mockResolvedValue({ exists: true, sizeBytes: 5_000_000 });
});

describe("startUploadAction", () => {
  it("checks course ownership before minting a signed URL", async () => {
    courseFindFirst.mockResolvedValue(null);

    const result = await start({ courseId: "someone-elses-course" });

    expect(courseFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "someone-elses-course",
      userId: OWNER,
    });
    // No signed URL and no row for a course the user does not own.
    expect(createUploadUrl).not.toHaveBeenCalled();
    expect(materialCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: "That course could not be found." });
  });

  it("builds the storage path from the signed-in user, not from client input", async () => {
    await start();

    // The client supplies a filename and nothing else that reaches the path.
    expect(createUploadUrl).toHaveBeenCalledWith(
      `${OWNER}/course-1/material-1-Lecture 01.pdf`,
    );
  });

  it("sanitises the filename before it reaches a storage key", async () => {
    await start({ filename: "../../../etc/passwd.pdf" });
    expect(createUploadUrl).toHaveBeenCalledWith(`${OWNER}/course-1/material-1-passwd.pdf`);
  });

  it("rejects an unsupported type without creating anything", async () => {
    const result = await start({ filename: "archive.zip", mimeType: "application/zip" });

    expect(materialCreate).not.toHaveBeenCalled();
    expect(createUploadUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects a file over the configured limit before any upload starts", async () => {
    const result = await start({ sizeBytes: MAX_FILE_BYTES + 1 });

    expect(createUploadUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/limit is/) });
  });

  it("reports a duplicate distinctly so the UI can say 'skipped'", async () => {
    materialFindFirst.mockResolvedValue({ id: "existing" });

    const result = await start();

    expect(materialCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: "__DUPLICATE__" });
  });

  it("marks the row failed if a signed URL cannot be minted", async () => {
    createUploadUrl.mockResolvedValue({ ok: false, reason: "Could not start the upload." });

    const result = await start();

    // Otherwise the row would sit on UPLOADING forever with no explanation.
    expect(materialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(result.ok).toBe(false);
  });

  it("returns everything the browser needs and nothing more", async () => {
    const result = await start();

    expect(result).toMatchObject({
      ok: true,
      materialId: "material-1",
      token: "signed-token",
      filename: "Lecture 01.pdf",
    });
  });
});

describe("finishUploadAction", () => {
  beforeEach(() => {
    materialFindFirst.mockResolvedValue({
      id: "material-1",
      filename: "Lecture 01.pdf",
      storagePath: `${OWNER}/course-1/material-1-Lecture 01.pdf`,
      courseId: "course-1",
    });
  });

  it("will not finish another user's upload", async () => {
    materialFindFirst.mockResolvedValue(null);

    const result = await finishUploadAction({
      courseId: "course-1",
      materialId: "someone-elses-material",
    });

    expect(materialFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "someone-elses-material",
      course: { userId: OWNER },
    });
    expect(after).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
  });

  it("verifies with storage rather than believing the client", async () => {
    // The client claims success; storage says the object is not there.
    statMaterial.mockResolvedValue({ exists: false });

    const result = await finishUploadAction({
      courseId: "course-1",
      materialId: "material-1",
    });

    expect(after).not.toHaveBeenCalled();
    expect(materialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(result.status).toBe("failed");
  });

  it("records the size storage reports, not the size the client declared", async () => {
    statMaterial.mockResolvedValue({ exists: true, sizeBytes: 12_345 });

    await finishUploadAction({ courseId: "course-1", materialId: "material-1" });

    expect(materialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSING", sizeBytes: 12_345 }),
      }),
    );
  });

  it("queues processing only after the response", async () => {
    await finishUploadAction({ courseId: "course-1", materialId: "material-1" });

    expect(processMaterial).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("records a browser-side upload failure instead of leaving the row hanging", async () => {
    const result = await finishUploadAction({
      courseId: "course-1",
      materialId: "material-1",
      failed: "The upload did not complete.",
    });

    expect(materialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          statusError: "The upload did not complete.",
        }),
      }),
    );
    expect(after).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");
  });
});
