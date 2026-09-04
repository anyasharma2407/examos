import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Material management authorisation.
 *
 * A material id travels through the client, so every action must reach the row
 * through a filter on the signed-in user. Uploading is covered separately in
 * material-upload-route.test.ts.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";

const materialFindFirst = vi.fn();
const materialUpdate = vi.fn();
const materialDelete = vi.fn();
const requireUser = vi.fn();
const removeMaterial = vi.fn();
const processMaterial = vi.fn();
const after = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    material: {
      findFirst: materialFindFirst,
      update: materialUpdate,
      delete: materialDelete,
    },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/materials/process", () => ({ processMaterial }));
vi.mock("@/lib/materials/storage", () => ({
  removeMaterial,
  createSignedUrl: vi.fn(),
}));

const { deleteMaterialAction, retryMaterialAction } = await import(
  "@/app/(app)/courses/[courseId]/materials/actions"
);

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: OWNER, email: "owner@example.com", name: "Owner" });
  materialFindFirst.mockResolvedValue(null);
  materialUpdate.mockResolvedValue({});
});

describe("deleteMaterialAction", () => {
  it("reaches the material through its course owner", async () => {
    materialFindFirst.mockResolvedValue(null);

    const data = new FormData();
    data.append("materialId", "someone-elses-material");
    await deleteMaterialAction(data);

    expect(materialFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "someone-elses-material",
      course: { userId: OWNER },
    });
    expect(materialDelete).not.toHaveBeenCalled();
    expect(removeMaterial).not.toHaveBeenCalled();
  });

  it("removes the row and the stored object for the owner", async () => {
    materialFindFirst.mockResolvedValue({
      id: "material-1",
      courseId: "course-1",
      storagePath: `${OWNER}/course-1/material-1-lecture.pdf`,
    });

    const data = new FormData();
    data.append("materialId", "material-1");
    await deleteMaterialAction(data);

    expect(materialDelete).toHaveBeenCalledWith({ where: { id: "material-1" } });
    expect(removeMaterial).toHaveBeenCalledWith(`${OWNER}/course-1/material-1-lecture.pdf`);
  });
});

describe("retryMaterialAction", () => {
  it("will not reprocess another user's material", async () => {
    materialFindFirst.mockResolvedValue(null);

    const data = new FormData();
    data.append("materialId", "someone-elses-material");
    await retryMaterialAction(data);

    expect(materialUpdate).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("resets the status and re-queues processing for the owner", async () => {
    materialFindFirst.mockResolvedValue({ id: "material-1", courseId: "course-1" });

    const data = new FormData();
    data.append("materialId", "material-1");
    await retryMaterialAction(data);

    expect(materialUpdate).toHaveBeenCalledWith({
      where: { id: "material-1" },
      data: { status: "PROCESSING", statusError: null },
    });
    expect(after).toHaveBeenCalledTimes(1);
  });
});
