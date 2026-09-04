import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server Actions are reachable by direct POST, not just through the UI, so each
 * one must re-authenticate and scope its writes. These tests drive the actions
 * with hand-built FormData — the same thing an attacker would send.
 */

const OWNER = "11111111-1111-1111-1111-111111111111";

const create = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();
const examFindFirst = vi.fn();
const examUpdate = vi.fn();
const requireUser = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    course: { create, updateMany, deleteMany },
    exam: { findFirst: examFindFirst, update: examUpdate, create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    // The real redirect() signals by throwing; mirror that so control flow matches.
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
}));

const { createCourseAction, deleteCourseAction, updateCourseAction } = await import(
  "@/app/(app)/courses/actions"
);
const { redirect } = await import("next/navigation");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

function validFields(overrides: Record<string, string> = {}) {
  const nextYear = new Date();
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
  return {
    name: "Discrete Mathematics",
    code: "MATH1061",
    examDate: nextYear.toISOString().slice(0, 10),
    targetGrade: "DISTINCTION",
    weeklyStudyHours: "8",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: OWNER, name: "Owner", email: "owner@example.com" });
});

describe("createCourseAction", () => {
  it("writes the course against the signed-in user and creates its final exam", async () => {
    create.mockResolvedValue({ id: "course-1" });

    await expect(createCourseAction({}, form(validFields()))).rejects.toThrow("NEXT_REDIRECT");

    const data = create.mock.calls[0]?.[0]?.data;
    expect(data.userId).toBe(OWNER);
    expect(data.code).toBe("MATH1061");
    expect(data.weeklyStudyMinutes).toBe(480);
    expect(data.exams.create).toMatchObject({ type: "FINAL" });
    expect(redirect).toHaveBeenCalledWith("/courses/course-1");
  });

  it("ignores a userId smuggled in through the form", async () => {
    create.mockResolvedValue({ id: "course-1" });
    const attacker = "99999999-9999-9999-9999-999999999999";

    await expect(
      createCourseAction({}, form({ ...validFields(), userId: attacker })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(create.mock.calls[0]?.[0]?.data.userId).toBe(OWNER);
  });

  it("returns field errors instead of writing when input is invalid", async () => {
    const state = await createCourseAction({}, form(validFields({ examDate: "2020-01-01" })));

    expect(create).not.toHaveBeenCalled();
    expect(state.fieldErrors?.examDate).toBe("Your exam date is in the past");
  });

  it("requires authentication before doing anything", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(createCourseAction({}, form(validFields()))).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateCourseAction", () => {
  it("scopes the update by user id so another user's course cannot be edited", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const state = await updateCourseAction(
      {},
      form({ ...validFields(), courseId: "someone-elses-course" }),
    );

    expect(updateMany.mock.calls[0]?.[0]?.where).toEqual({
      id: "someone-elses-course",
      userId: OWNER,
    });
    // Nothing matched, so the exam must not be touched either.
    expect(examFindFirst).not.toHaveBeenCalled();
    expect(state.error).toBe("That course could not be found.");
  });

  it("moves the final exam date when the course is the user's own", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    examFindFirst.mockResolvedValue({ id: "exam-1" });
    examUpdate.mockResolvedValue({});

    await expect(
      updateCourseAction({}, form({ ...validFields(), courseId: "course-1" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    // The exam lookup is itself scoped through the course's owner.
    expect(examFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({
      courseId: "course-1",
      course: { userId: OWNER },
    });
    expect(examUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing course id", async () => {
    const state = await updateCourseAction({}, form(validFields()));
    expect(updateMany).not.toHaveBeenCalled();
    expect(state.error).toBe("That course could not be found.");
  });
});

describe("deleteCourseAction", () => {
  it("only ever deletes within the signed-in user's courses", async () => {
    deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      deleteCourseAction(form({ courseId: "someone-elses-course" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "someone-elses-course", userId: OWNER },
    });
  });

  it("does nothing without a course id", async () => {
    await deleteCourseAction(form({}));
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
