import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cross-user access protection.
 *
 * Course ids appear in URLs and in form fields, so they are attacker-controlled.
 * Every read and write must be scoped by the signed-in user's id. These tests
 * assert the shape of the query rather than hitting a database, so the contract
 * is checked on every run without external state.
 */

const findMany = vi.fn().mockResolvedValue([]);
const findFirst = vi.fn().mockResolvedValue(null);
const updateMany = vi.fn().mockResolvedValue({ count: 0 });
const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/lib/db", () => ({
  prisma: {
    course: { findMany, findFirst, updateMany, deleteMany },
  },
}));

vi.mock("next/navigation", () => ({
  notFound,
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const { getOwnedCourse, listCourseSummaries, requireOwnedCourse } = await import(
  "@/lib/courses"
);

const OWNER = "11111111-1111-1111-1111-111111111111";
const ATTACKER = "22222222-2222-2222-2222-222222222222";

describe("course reads are scoped to the signed-in user", () => {
  beforeEach(() => {
    findMany.mockClear();
    findFirst.mockClear();
    notFound.mockClear();
  });

  it("filters the course list by user id", async () => {
    await listCourseSummaries(OWNER);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0]?.where).toEqual({ userId: OWNER });
  });

  it("looks a single course up by id AND user id", async () => {
    await getOwnedCourse("course-abc", OWNER);

    expect(findFirst.mock.calls[0]?.[0]?.where).toEqual({
      id: "course-abc",
      userId: OWNER,
    });
  });

  it("reports another user's course as missing, not forbidden", async () => {
    // Returning 403 would confirm the id exists; 404 leaks nothing.
    findFirst.mockResolvedValueOnce(null);

    await expect(requireOwnedCourse("someone-elses-course", ATTACKER)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("returns the course when the user does own it", async () => {
    findFirst.mockResolvedValueOnce({ id: "course-abc", userId: OWNER, exams: [] });

    const course = await requireOwnedCourse("course-abc", OWNER);
    expect(course.id).toBe("course-abc");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("listCourseSummaries", () => {
  beforeEach(() => findMany.mockClear());

  it("picks the soonest exam that has not happened yet", async () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 30);
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 10);
    const later = new Date();
    later.setUTCDate(later.getUTCDate() + 60);

    findMany.mockResolvedValueOnce([
      {
        id: "c1",
        name: "Discrete Mathematics",
        code: "MATH1061",
        targetGrade: "CREDIT",
        weeklyStudyMinutes: 480,
        exams: [
          { id: "e0", title: "Midterm", date: past },
          { id: "e1", title: "Final Exam", date: soon },
          { id: "e2", title: "Supplementary", date: later },
        ],
        _count: { topics: 6, materials: 2 },
      },
    ]);

    const [course] = await listCourseSummaries(OWNER);
    expect(course.nextExam?.id).toBe("e1");
    expect(course.topicCount).toBe(6);
    expect(course.materialCount).toBe(2);
  });

  it("falls back to the most recent exam once they have all passed", async () => {
    const older = new Date();
    older.setUTCDate(older.getUTCDate() - 60);
    const recent = new Date();
    recent.setUTCDate(recent.getUTCDate() - 5);

    findMany.mockResolvedValueOnce([
      {
        id: "c1",
        name: "Old Course",
        code: "OLD101",
        targetGrade: "PASS",
        weeklyStudyMinutes: 60,
        exams: [
          { id: "e0", title: "Midterm", date: older },
          { id: "e1", title: "Final Exam", date: recent },
        ],
        _count: { topics: 0, materials: 0 },
      },
    ]);

    const [course] = await listCourseSummaries(OWNER);
    expect(course.nextExam?.id).toBe("e1");
  });

  it("handles a course with no exams", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "c1",
        name: "No Exam",
        code: "NX101",
        targetGrade: "PASS",
        weeklyStudyMinutes: 60,
        exams: [],
        _count: { topics: 0, materials: 0 },
      },
    ]);

    const [course] = await listCourseSummaries(OWNER);
    expect(course.nextExam).toBeNull();
  });
});
