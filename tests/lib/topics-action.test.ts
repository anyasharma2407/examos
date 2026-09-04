import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Knowledge map generation authorisation.
 *
 * Each run costs a model call over a large slice of the course, so ownership is
 * checked before any of that work starts.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";

const courseFindFirst = vi.fn();
const requireUser = vi.fn();
const buildKnowledgeMap = vi.fn();
const guardAi = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: { course: { findFirst: courseFindFirst } } }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/topics", () => ({ buildKnowledgeMap }));
vi.mock("@/lib/ai/guard", () => ({ guardAi }));

const { buildKnowledgeMapAction } = await import(
  "@/app/(app)/courses/[courseId]/topics/actions"
);

function form(courseId?: string): FormData {
  const data = new FormData();
  if (courseId !== undefined) data.append("courseId", courseId);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: OWNER, email: "owner@example.com", name: "Owner" });
  courseFindFirst.mockResolvedValue({ id: "course-1", name: "Discrete Maths", code: "MATH1061" });
  guardAi.mockResolvedValue({ ok: true });
  buildKnowledgeMap.mockResolvedValue({
    ok: true,
    created: 6,
    updated: 0,
    removed: 0,
    total: 6,
  });
});

describe("buildKnowledgeMapAction", () => {
  it("will not build a map for someone else's course", async () => {
    courseFindFirst.mockResolvedValue(null);

    const state = await buildKnowledgeMapAction({}, form("someone-elses-course"));

    expect(courseFindFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "someone-elses-course",
      userId: OWNER,
    });
    // No model call, so no cost, for a course the user does not own.
    expect(buildKnowledgeMap).not.toHaveBeenCalled();
    expect(state.error).toBe("That course could not be found.");
  });

  it("requires a course id", async () => {
    const state = await buildKnowledgeMapAction({}, form());
    expect(buildKnowledgeMap).not.toHaveBeenCalled();
    expect(state.error).toBe("That course could not be found.");
  });

  it("builds the map for the owner and summarises what changed", async () => {
    buildKnowledgeMap.mockResolvedValue({
      ok: true,
      created: 2,
      updated: 4,
      removed: 1,
      total: 6,
    });

    const state = await buildKnowledgeMapAction({}, form("course-1"));

    expect(buildKnowledgeMap).toHaveBeenCalledWith("course-1", {
      id: "course-1",
      name: "Discrete Maths",
      code: "MATH1061",
    });
    expect(state.success).toBe("6 topics found, 4 kept from before, 1 no longer covered.");
  });

  it("surfaces a build failure as a message rather than throwing", async () => {
    buildKnowledgeMap.mockResolvedValue({
      ok: false,
      error: "No processed material yet.",
    });

    const state = await buildKnowledgeMapAction({}, form("course-1"));
    expect(state.error).toBe("No processed material yet.");
    expect(state.success).toBeUndefined();
  });

  it("goes through the shared guard, not a per-process limiter", async () => {
    await buildKnowledgeMapAction({}, form("course-1"));

    // Counting in one Node process is close to meaningless on a platform that
    // runs many instances, so the limit and the budget live in the database.
    expect(guardAi).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER, feature: "knowledge_map" }),
    );
  });

  it("surfaces a guard refusal instead of doing the work", async () => {
    guardAi.mockResolvedValue({ ok: false, error: "Try again in 5 minutes." });

    const state = await buildKnowledgeMapAction({}, form("course-1"));

    expect(buildKnowledgeMap).not.toHaveBeenCalled();
    expect(state.error).toBe("Try again in 5 minutes.");
  });

  it("checks ownership before spending a guard allowance", async () => {
    courseFindFirst.mockResolvedValue(null);

    await buildKnowledgeMapAction({}, form("someone-elses-course"));

    // Otherwise probing other people's course ids would burn the caller's quota.
    expect(guardAi).not.toHaveBeenCalled();
  });
});
