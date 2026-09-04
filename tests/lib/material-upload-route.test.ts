import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FILE_BYTES } from "@/lib/materials/constants";
import type { UploadResult } from "@/lib/materials/types";

/**
 * The material upload endpoint.
 *
 * Uploading lives in a Route Handler rather than a Server Action so that large
 * files are not truncated by the Server Action body limit or the proxy's body
 * buffer. It is a public HTTP endpoint, so it has to do its own authentication
 * and its own ownership check — these tests cover both, plus the size ceiling
 * the student actually cares about.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";

const courseFindFirst = vi.fn();
const materialFindFirst = vi.fn();
const materialCreate = vi.fn();
const materialUpdate = vi.fn();
const requireUser = vi.fn();
const uploadMaterial = vi.fn();
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
vi.mock("@/lib/materials/process", () => ({ processMaterial }));
vi.mock("@/lib/materials/storage", () => ({
  uploadMaterial,
  buildStoragePath: (userId: string, courseId: string, materialId: string, name: string) =>
    `${userId}/${courseId}/${materialId}-${name}`,
}));

// `after` ships from next/server alongside NextResponse, so keep the real module
// and replace only that export.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after,
}));

const { POST } = await import("@/app/api/materials/upload/route");

/** Explicitly backed by an ArrayBuffer so it satisfies BlobPart. */
function pdfBytes(sizeBytes: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(sizeBytes));
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  return bytes;
}

function pdfFile(name = "lecture.pdf", sizeBytes = 2048): File {
  return new File([pdfBytes(sizeBytes)], name, { type: "application/pdf" });
}

function uploadRequest(courseId: string, file?: File): Request {
  const data = new FormData();
  data.append("courseId", courseId);
  if (file) data.append("file", file);
  return new Request("http://localhost/api/materials/upload", {
    method: "POST",
    body: data,
  });
}

async function post(courseId: string, file?: File) {
  // The handler only uses Request behaviour, so a plain Request is enough.
  const response = await POST(uploadRequest(courseId, file) as never);
  return { response, body: (await response.json()) as UploadResult };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: OWNER, email: "owner@example.com", name: "Owner" });
  courseFindFirst.mockResolvedValue({ id: "course-1" });
  materialFindFirst.mockResolvedValue(null);
  materialCreate.mockResolvedValue({ id: "material-1" });
  materialUpdate.mockResolvedValue({});
  uploadMaterial.mockResolvedValue({ ok: true });
});

describe("authentication and ownership", () => {
  it("refuses an unauthenticated request instead of redirecting", async () => {
    // requireUser() redirects by throwing, which is useless to fetch().
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    const { response, body } = await post("course-1", pdfFile());

    expect(response.status).toBe(401);
    expect(body.status).toBe("failed");
    expect(uploadMaterial).not.toHaveBeenCalled();
  });

  it("checks course ownership before touching storage", async () => {
    courseFindFirst.mockResolvedValue(null);

    const { response, body } = await post("someone-elses-course", pdfFile());

    expect(courseFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "someone-elses-course",
      userId: OWNER,
    });
    expect(response.status).toBe(404);
    expect(body).toMatchObject({ error: "That course could not be found." });
    expect(materialCreate).not.toHaveBeenCalled();
    expect(uploadMaterial).not.toHaveBeenCalled();
  });

  it("stores the object under the owner's id prefix", async () => {
    await post("course-1", pdfFile());

    const [path] = uploadMaterial.mock.calls[0] ?? [];
    // The user id prefix means a path can never address another user's object.
    expect(path).toBe(`${OWNER}/course-1/material-1-lecture.pdf`);
  });
});

describe("file size", () => {
  it("accepts a file far larger than the old 20MB limit", async () => {
    // 60MB: scanned lecture notes and image-heavy slide decks run this big.
    const big = new File([pdfBytes(60 * 1024 * 1024)], "scanned-notes.pdf", {
      type: "application/pdf",
    });

    const { body } = await post("course-1", big);

    expect(body.status).toBe("uploaded");
    expect(materialCreate.mock.calls[0]?.[0]?.data.sizeBytes).toBe(60 * 1024 * 1024);
  });

  it("still rejects a file past the ceiling, and says what the ceiling is", async () => {
    const tooBig = new File([pdfBytes(MAX_FILE_BYTES + 1024)], "huge.pdf", {
      type: "application/pdf",
    });

    const { body } = await post("course-1", tooBig);

    expect(body).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/limit is/),
    });
    expect(uploadMaterial).not.toHaveBeenCalled();
  });
});

describe("validation and deduplication", () => {
  it("rejects a disguised file without writing anything", async () => {
    const executable = new Uint8Array(new ArrayBuffer(4));
    executable.set([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — a Windows PE
    const fake = new File([executable], "notes.pdf", { type: "application/pdf" });

    const { body } = await post("course-1", fake);

    expect(body.status).toBe("failed");
    expect(materialCreate).not.toHaveBeenCalled();
    expect(uploadMaterial).not.toHaveBeenCalled();
  });

  it("skips a file already on the course instead of duplicating it", async () => {
    materialFindFirst.mockResolvedValue({ id: "existing" });

    const { body } = await post("course-1", pdfFile());

    expect(body).toMatchObject({ status: "skipped" });
    expect(materialCreate).not.toHaveBeenCalled();
  });

  it("reports a missing file rather than throwing", async () => {
    const { response, body } = await post("course-1");

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ status: "failed", error: "No file was received." });
  });

  it("rejects a missing course id", async () => {
    const { response } = await post("");
    expect(response.status).toBe(400);
  });
});

describe("processing and failure handling", () => {
  it("queues extraction after the response rather than inline", async () => {
    await post("course-1", pdfFile());

    // Extraction is slow; running it inline would stall the upload response.
    expect(processMaterial).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("records a storage failure against the material rather than losing it", async () => {
    uploadMaterial.mockResolvedValue({ ok: false, reason: "The file could not be saved." });

    const { body } = await post("course-1", pdfFile());

    expect(materialUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(body.status).toBe("failed");
    expect(after).not.toHaveBeenCalled();
  });
});
