import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { components } from "@quizzivy/sdk";
import {
  loadSpec,
  operations,
  propertyNames,
  resolveRef,
  jsonResponseSchema,
  type Json,
} from "@tests/support/openapi";

/**
 * R8's schedule (plan 78): the class timetable on every class surface and the
 * public join preview, the calendar, attendance, terms and the student's week.
 * These pin what the server, the web and the isolation suite rely on.
 */

const spec = loadSpec();
const ops = operations(spec);
const schemas = spec.components.schemas;
const ajv = new Ajv({ strict: false, validateFormats: true });
addFormats(ajv);

function shape(name: string) {
  return ajv.compile({ $ref: `#/components/schemas/${name}`, components: spec.components });
}

function op(operationId: string): Json {
  const found = ops.find(({ op }) => op.operationId === operationId);
  if (!found) throw new Error(`no operation ${operationId}`);
  return found;
}

const id = "019535d9-3df7-79fb-b466-fa907fa17f9e";
const occurrence = `${id}.20260922`;

describe("the join preview (T-R8.7, DG-02)", () => {
  const preview = jsonResponseSchema(op("previewJoinCode").op, 200);
  const five = ["classId", "className", "teacherName", "schedule", "room"];

  it("answers exactly five keys, all required, and no other", () => {
    expect(Object.keys(preview.properties).sort()).toEqual([...five].sort());
    expect([...preview.required].sort()).toEqual([...five].sort());
    expect(preview.additionalProperties).toBe(false);
  });

  it("reaches no count, date, note or cancellation", () => {
    const names = [...propertyNames(spec, preview)];
    const leaks = names.filter((n) =>
      /count|date|note|cancel|startsAt|members|students|attempt/i.test(n),
    );
    expect(leaks).toEqual([]);
  });

  it("keeps the 404 and the rate limits as they were", () => {
    const { op: preview } = op("previewJoinCode");
    expect(preview.responses["404"]).toBeDefined();
    expect(preview["x-rate-limit"]).toEqual({
      perIp: { perMinute: 120, perHour: 600 },
      perCode: { perHour: 200 },
    });
  });
});

describe("the derived schedule and room on every class surface (T-R8.7)", () => {
  it.each(["Class", "ClassListItem", "AdminClassRow", "MyClass"])(
    "%s requires schedule and room",
    (name) => {
      expect(schemas[name].properties.schedule).toEqual({
        $ref: "#/components/schemas/ClassSchedule",
      });
      expect(schemas[name].required).toContain("schedule");
      expect(schemas[name].properties.room.description).toMatch(/derived/);
    },
  );

  it("holds Class and ClassListItem to one property list", () => {
    expect(Object.keys(schemas.ClassListItem.properties)).toEqual(
      Object.keys(schemas.Class.properties),
    );
    const listOnly = schemas.ClassListItem.required.filter(
      (k: string) => !schemas.Class.required.includes(k),
    );
    expect(listOnly).toEqual(["averageScore"]);
  });

  it("gives MyClass no count, date, note or cancellation", () => {
    const names = [...propertyNames(spec, { $ref: "#/components/schemas/MyClass" })];
    expect(names.filter((n) => /count|date|note|cancel|startsAt/i.test(n))).toEqual([]);
  });

  it("bounds a schedule to fourteen weekly slots", () => {
    const valid = shape("ClassSchedule");
    const slot = { weekday: 1, startTime: "18:00", durationMinutes: 90 };
    expect(valid({ slots: [slot], label: null }), JSON.stringify(valid.errors)).toBe(true);
    expect(valid({ slots: Array(15).fill(slot), label: null })).toBe(false);
    expect(valid({ slots: [{ ...slot, weekday: 0 }], label: null })).toBe(false);
    expect(valid({ slots: [{ ...slot, startTime: "24:00" }], label: null })).toBe(false);
    expect(valid({ slots: [{ ...slot, durationMinutes: 10 }], label: null })).toBe(false);
  });
});

describe("x-resource on the schedule's operations (T-R2.16's form)", () => {
  const kinds = (() => {
    const text: string = spec.info.description;
    const start = text.indexOf("`kind` is the owned resource the id names:");
    const end = text.indexOf("A `share` is", start);
    return new Set([...text.slice(start, end).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
  })();

  it("lists session and session-series as kinds", () => {
    expect(kinds.has("session")).toBe(true);
    expect(kinds.has("session-series")).toBe(true);
    expect(kinds.has("class")).toBe(true);
  });

  it("declares only listed kinds, or none, anywhere in the contract", () => {
    const unknown = ops.flatMap(({ method, path, op }) => {
      const declared: Json[] = op["x-resource"] ?? [];
      const list: string[] = op["x-resource-list"] ? [op["x-resource-list"]] : [];
      return [...declared.map((r) => r.kind), ...list]
        .filter((k) => k !== "none" && !kinds.has(k))
        .map((k) => `${method.toUpperCase()} ${path}: ${k}`);
    });
    expect(unknown).toEqual([]);
  });

  /** Every path or query parameter that is a Uuid or a SessionId. */
  function idParameters(path: string, operation: Json): Json[] {
    const all: Json[] = [...(spec.paths[path].parameters ?? []), ...(operation.parameters ?? [])];
    return all
      .map((p) => (p.$ref ? resolveRef(spec, p.$ref) : p))
      .filter((p) =>
        ["#/components/schemas/Uuid", "#/components/schemas/SessionId"].includes(
          p.schema?.$ref,
        ),
      );
  }

  const scheduleOps = ops.filter(({ op }) => (op.tags ?? []).includes("teacher-schedule"));

  it("finds the schedule's nine operations", () => {
    expect(scheduleOps.map(({ op }) => op.operationId).sort()).toEqual(
      [
        "createClassSession",
        "deleteClassSession",
        "endSessionSeries",
        "getCalendar",
        "getSessionAttendance",
        "listAttendanceSessions",
        "saveSessionAttendance",
        "updateClassSession",
        "updateSessionSeries",
      ].sort(),
    );
  });

  it.each(scheduleOps.map((o) => [o.op.operationId, o] as const))(
    "%s names every id it takes",
    (_label, { path, op: operation }) => {
      const declared = new Set(
        (operation["x-resource"] ?? []).map((r: Json) => `${r.in}:${r.name}`),
      );
      for (const p of idParameters(path, operation)) {
        expect(declared, `${p.in} ${p.name}`).toContain(`${p.in}:${p.name}`);
      }
    },
  );

  it("names each id with the kind it is", () => {
    const resources = (operationId: string) => op(operationId).op["x-resource"];
    expect(resources("createClassSession")).toEqual([{ in: "path", name: "id", kind: "class" }]);
    for (const name of ["updateClassSession", "deleteClassSession", "getSessionAttendance"]) {
      expect(resources(name)).toEqual([{ in: "path", name: "sessionId", kind: "session" }]);
    }
    expect(resources("saveSessionAttendance")).toEqual([
      { in: "path", name: "sessionId", kind: "session" },
      { in: "body", name: "/marks/-/studentId", kind: "student" },
    ]);
    for (const name of ["updateSessionSeries", "endSessionSeries"]) {
      expect(resources(name)).toEqual([
        { in: "path", name: "seriesId", kind: "session-series" },
      ]);
    }
    for (const name of ["getCalendar", "listAttendanceSessions"]) {
      expect(resources(name)).toEqual([{ in: "query", name: "classId", kind: "class" }]);
      expect(op(name).op["x-resource-list"]).toBe("session");
    }
  });

  it("uses the class segment's existing name, so one position has one name", () => {
    expect(op("createClassSession").path).toBe("/teacher/classes/{id}/sessions");
  });

  it("keeps a session id opaque: no uuid format and no pattern, so a bad one is a 404", () => {
    expect(schemas.SessionId.type).toBe("string");
    expect(schemas.SessionId.format).toBeUndefined();
    expect(schemas.SessionId.pattern).toBeUndefined();
    const valid = shape("SessionId");
    expect(valid(id)).toBe(true);
    expect(valid(occurrence)).toBe(true);
  });

  it("gives the student's week no id, so it declares none", () => {
    const week = op("getStudentWeek");
    expect(week.path).toBe("/app/week");
    expect(week.op["x-permission"]).toBe("learning.take_tests");
    expect(week.op["x-resource"]).toBeUndefined();
  });
});

describe("permissions (plan 78 T-R8.3 … T-R8.8)", () => {
  it.each([
    ["listTerms", "system.settings.write"],
    ["createTerm", "system.settings.write"],
    ["updateTerm", "system.settings.write"],
    ["deleteTerm", "system.settings.write"],
    ["createClassSession", "teaching.classes.write"],
    ["updateClassSession", "teaching.classes.write"],
    ["deleteClassSession", "teaching.classes.write"],
    ["updateSessionSeries", "teaching.classes.write"],
    ["endSessionSeries", "teaching.classes.write"],
    ["getCalendar", "workspace.teacher"],
    ["listAttendanceSessions", "teaching.attendance"],
    ["getSessionAttendance", "teaching.attendance"],
    ["saveSessionAttendance", "teaching.attendance"],
    ["getStudentWeek", "learning.take_tests"],
  ])("%s needs %s", (operationId, permission) => {
    expect(op(operationId).op["x-permission"]).toBe(permission);
  });
});

describe("error codes", () => {
  it("adds the schedule's five codes", () => {
    const codes: string[] = schemas.ErrorCode.enum;
    for (const code of [
      "TERM_OVERLAPS",
      "SESSION_IN_SERIES",
      "SESSION_HAS_ATTENDANCE",
      "SESSION_NOT_STARTED",
      "SESSION_CANCELLED",
    ]) {
      expect(codes).toContain(code);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("names attendance among the references that refuse a class delete", () => {
    expect(schemas.ReferencedBy.enum).toContain("attendance");
  });
});

describe("the dashboard's Today (T-R8.9)", () => {
  const valid = shape("Dashboard");
  function dashboard(today: unknown[]): unknown {
    return {
      awaitingGrading: 0,
      flaggedAttempts: 0,
      newestFlaggedAttempt: null,
      takingNow: { students: 0, assignments: 0, assignmentId: null },
      submissions: {
        days: Array.from({ length: 7 }, (_, i) => ({
          date: `2026-09-2${i}`,
          count: 0,
        })),
        total: 0,
        averagePercent: null,
      },
      today,
      recentActivity: [],
    };
  }
  const session: components["schemas"]["DashboardTodaySession"] = {
    kind: "session",
    at: "2026-09-22T11:00:00Z",
    sessionId: occurrence,
    classId: id,
    className: "IELTS 6.5",
    room: "Phòng 2",
  };
  const opens: components["schemas"]["DashboardTodayAssignment"] = {
    kind: "opens",
    at: "2026-09-22T01:00:00Z",
    assignmentId: id,
    title: "Unit 3",
    notSubmitted: 4,
  };

  it("holds assignment items and sessions side by side", () => {
    expect(valid(dashboard([opens, session])), JSON.stringify(valid.errors)).toBe(true);
    expect(schemas.Dashboard.properties.today.maxItems).toBe(40);
  });

  it("keeps each kind to its own fields", () => {
    expect(valid(dashboard([{ ...session, notSubmitted: 0 }]))).toBe(false);
    expect(valid(dashboard([{ ...opens, kind: "session" }]))).toBe(false);
    expect(valid(dashboard([{ ...session, kind: "closes" }]))).toBe(false);
  });
});

describe("the student's week (T-R8.8)", () => {
  const valid = shape("StudentWeek");
  function week(items: unknown[]): unknown {
    return {
      start: "2026-09-21",
      end: "2026-09-27",
      days: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-09-2${i + 1}`,
        items: i === 1 ? items : [],
      })),
    };
  }
  const session: components["schemas"]["WeekSessionItem"] = {
    kind: "session",
    classId: id,
    className: "IELTS 6.5",
    startsAt: "2026-09-22T11:00:00Z",
    durationMinutes: 90,
    room: null,
    note: "Room 3 this week",
    cancelled: false,
  };
  const due: components["schemas"]["WeekDueItem"] = {
    kind: "due",
    assignmentId: id,
    title: "Unit 3",
    closesAt: "2026-09-22T16:59:59Z",
    state: "in_progress",
    durationMinutes: 30,
  };

  it("holds seven days of sessions and due items", () => {
    expect(valid(week([session, due])), JSON.stringify(valid.errors)).toBe(true);
    const short = week([]) as { days: unknown[] };
    expect(valid({ ...short, days: short.days.slice(1) })).toBe(false);
  });

  it("carries no counts, members, attendance or other students", () => {
    const names = [...propertyNames(spec, { $ref: "#/components/schemas/StudentWeek" })];
    expect(
      names.filter((n) => /count|member|student|attendance|marked|rate|status/i.test(n)),
    ).toEqual([]);
  });

  it("refuses a session item with another kind's fields", () => {
    expect(valid(week([{ ...session, title: "x" }]))).toBe(false);
    expect(valid(week([{ ...due, kind: "session" }]))).toBe(false);
  });
});

describe("attendance (T-R8.6)", () => {
  it("takes a mark per student, a null status to unmark, and at most 200", () => {
    const valid = shape("AttendanceSave");
    const mark = { studentId: id, status: "late", note: "Đến muộn 10 phút" };
    expect(valid({ marks: [mark, { studentId: id, status: null }] })).toBe(true);
    expect(valid({ marks: [] })).toBe(false);
    expect(valid({ marks: Array(201).fill(mark) })).toBe(false);
    expect(valid({ marks: [{ ...mark, status: "excused" }] })).toBe(false);
    expect(valid({ marks: [{ ...mark, note: "x".repeat(501) }] })).toBe(false);
  });

  it("keeps the statuses to DG-92's three", () => {
    expect(schemas.AttendanceStatus.enum).toEqual(["present", "late", "absent"]);
  });

  it("gives a row its counts only once it is marked, and pages by a cursor", () => {
    const valid = shape("AttendanceSessionList");
    const row: components["schemas"]["AttendanceSessionRow"] = {
      id: occurrence,
      classId: id,
      className: "IELTS 6.5",
      room: null,
      startsAt: "2026-09-22T11:00:00Z",
      marked: false,
      studentCount: 12,
      counts: null,
    };
    expect(
      valid({ items: [row], nextBefore: row.startsAt, notMarked: 1 }),
      JSON.stringify(valid.errors),
    ).toBe(true);
    expect(valid({ items: [], nextBefore: null, notMarked: 0 })).toBe(true);
    const params = op("listAttendanceSessions").op.parameters.map((p: Json) => p.name);
    expect(params).toEqual(["classId", "before", "since", "marked", "limit"]);
  });
});

describe("terms (T-R8.3)", () => {
  it("lives under Admin settings, with an overlap answered as TERM_OVERLAPS", () => {
    expect(op("listTerms").path).toBe("/admin/settings/terms");
    expect(op("updateTerm").path).toBe("/admin/settings/terms/{id}");
    for (const name of ["listTerms", "createTerm", "updateTerm", "deleteTerm"]) {
      expect(op(name).op.tags).toEqual(["admin-settings"]);
    }
    expect(op("createTerm").op.responses["409"].description).toContain("TERM_OVERLAPS");
  });

  it("states a term against today and asks for a change to a patch", () => {
    expect(schemas.Term.properties.state.enum).toEqual(["current", "upcoming", "past"]);
    expect(schemas.TermPatch.minProperties).toBe(1);
  });
});
