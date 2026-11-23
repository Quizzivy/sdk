import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  jsonResponseSchema,
  loadSpec,
  operations,
  propertyNames,
  resolveRef,
  type Json,
} from "@tests/support/openapi";

/**
 * F2 (plan 77g): staff write to any student, the New message picker
 * (`listMessageRecipients`) and colleague threads. These pin what the server,
 * the web and the isolation suite rely on, and the leak review: no email and
 * no other personal field on a recipient or a colleague, class names as names
 * only, and no enum widened.
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
const other = "019535d9-3df7-79fb-b466-fa907fa17fa0";

const COLLEAGUE_OPS = [
  "listColleagueThreads",
  "getColleagueThread",
  "postColleagueMessage",
  "markColleagueThreadRead",
] as const;
const NEW_OPS = ["listMessageRecipients", ...COLLEAGUE_OPS] as const;

describe("the five new operations (T-F2.1)", () => {
  it.each([
    ["listMessageRecipients", "get", "/teacher/messages/recipients"],
    ["listColleagueThreads", "get", "/teacher/messages/colleagues"],
    ["getColleagueThread", "get", "/teacher/messages/colleagues/{colleagueId}"],
    ["postColleagueMessage", "post", "/teacher/messages/colleagues/{colleagueId}"],
    ["markColleagueThreadRead", "post", "/teacher/messages/colleagues/{colleagueId}/read"],
  ])("%s is %s %s, for workspace.teacher, under teacher-messages", (name, method, path) => {
    const found = op(name);
    expect(found.method).toBe(method);
    expect(found.path).toBe(path);
    expect(found.op["x-permission"]).toBe("workspace.teacher");
    expect(found.op.tags).toEqual(["teacher-messages"]);
  });
});

describe("x-resource on the messaging operations (T-R2.16's form)", () => {
  const kinds = (() => {
    const text: string = spec.info.description;
    const start = text.indexOf("`kind` is the owned resource the id names:");
    const end = text.indexOf("A `share` is", start);
    return new Set([...text.slice(start, end).matchAll(/`([a-z-]+)`/g)].map((m) => m[1]));
  })();

  it("lists messaging-colleague beside messaging-peer", () => {
    expect(kinds.has("messaging-peer")).toBe(true);
    expect(kinds.has("messaging-colleague")).toBe(true);
  });

  it("words messaging-peer as any student, the caller's own thread only", () => {
    const text: string = spec.info.description.replace(/\s+/g, " ");
    expect(text).toContain(
      "A `messaging-peer` is a student a staff member may read a direct thread with: one they have a thread with, or any account that passes the student predicate.",
    );
    expect(text).not.toMatch(/have taught, now or before, or created/);
    expect(text).toMatch(/A `messaging-colleague` is a staff member/);
  });

  /** Every path or query parameter whose schema is a Uuid. */
  function uuidParameters(path: string, operation: Json): Json[] {
    const all: Json[] = [...(spec.paths[path].parameters ?? []), ...(operation.parameters ?? [])];
    return all
      .map((p) => (p.$ref ? resolveRef(spec, p.$ref) : p))
      .filter((p) => p.schema?.$ref === "#/components/schemas/Uuid");
  }

  const messaging = ops.filter(({ path }) => path.startsWith("/teacher/messages/"));

  it.each(messaging.map((o) => [o.op.operationId, o] as const))(
    "%s names every uuid it takes in its path or query",
    (_label, { path, op: operation }) => {
      const declared = new Set(
        (operation["x-resource"] ?? []).map((r: Json) => `${r.in}:${r.name}`),
      );
      for (const p of uuidParameters(path, operation)) {
        expect(declared, `${p.in} ${p.name}`).toContain(`${p.in}:${p.name}`);
      }
    },
  );

  it("names each new id with the kind it is", () => {
    const resources = (name: string) => op(name).op["x-resource"];
    expect(resources("listMessageRecipients")).toEqual([
      { in: "query", name: "classId", kind: "class" },
    ]);
    expect(resources("listColleagueThreads")).toBeUndefined();
    expect(resources("getColleagueThread")).toEqual([
      { in: "path", name: "colleagueId", kind: "messaging-colleague" },
      { in: "query", name: "before", kind: "none" },
      { in: "query", name: "after", kind: "none" },
    ]);
    expect(resources("postColleagueMessage")).toEqual([
      { in: "path", name: "colleagueId", kind: "messaging-colleague" },
      { in: "body", name: "/clientId", kind: "none" },
      { in: "body", name: "/attachmentId", kind: "attachment" },
    ]);
    expect(resources("markColleagueThreadRead")).toEqual([
      { in: "path", name: "colleagueId", kind: "messaging-colleague" },
      { in: "body", name: "/lastReadMessageId", kind: "none" },
    ]);
  });

  it("declares no x-resource-list on the finder or the colleague list, whose rows are not owned resources", () => {
    for (const name of ["listMessageRecipients", "listColleagueThreads", "listStaffThreads"]) {
      expect(op(name).op["x-resource-list"], name).toBeUndefined();
    }
    const recipients = jsonResponseSchema(op("listMessageRecipients").op, 200);
    expect(Object.keys(recipients.properties)).toEqual(["recipients", "nextCursor"]);
    const colleagues = jsonResponseSchema(op("listColleagueThreads").op, 200);
    expect(Object.keys(colleagues.properties)).toEqual(["threads"]);
  });

  it("keeps the direct thread's student a messaging-peer", () => {
    for (const name of ["getStaffDirectThread", "postStaffDirectMessage", "markStaffDirectThreadRead"]) {
      expect(op(name).op["x-resource"][0]).toEqual({
        in: "path",
        name: "studentId",
        kind: "messaging-peer",
      });
    }
  });
});

describe("the leak review (T-F2.1)", () => {
  const PERSONAL =
    /email|username|birth|lastActive|signIn|lastSignIn|score|attempt|memberCount|studentCount|teacherName|classId|classes$/i;

  it.each(["MessageRecipient", "ColleagueThread", "ColleagueDirectThreadPeer"])(
    "%s reaches no email and no other personal field",
    (name) => {
      const names = [...propertyNames(spec, { $ref: `#/components/schemas/${name}` })];
      expect(names).toContain("name" in schemas[name].properties ? "name" : "title");
      expect(names.filter((n) => PERSONAL.test(n))).toEqual([]);
    },
  );

  it("answers no email from any of the five new operations", () => {
    const leaks = NEW_OPS.flatMap((name) => {
      const { op: operation } = op(name);
      return Object.keys(operation.responses)
        .filter((status) => status.startsWith("2"))
        .filter((status) => propertyNames(spec, jsonResponseSchema(operation, status)).has("email"))
        .map((status) => `${name} ${status}`);
    });
    expect(leaks).toEqual([]);
  });

  it("gives class names as strings only, never an id", () => {
    for (const name of ["MessageRecipient", "StaffThread", "StaffDirectThreadPeer"]) {
      const property = schemas[name].properties.otherClassNames;
      expect(property, name).toMatchObject({ type: "array", items: { type: "string" } });
      expect(schemas[name].required, name).toContain("otherClassNames");
    }
    expect(schemas.MessageRecipient.properties.classNames).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
  });

  it("keeps a colleague thread free of attempt cards and Seen by", () => {
    const thread = schemas.ColleagueDirectThread;
    expect(Object.keys(thread.properties).sort()).toEqual(
      ["colleague", "latestId", "messages", "nextBefore"].sort(),
    );
    expect(thread.properties.messages.items).toEqual({
      $ref: "#/components/schemas/StaffMessage",
    });
  });
});

describe("additive only: no enum gains a value", () => {
  it("keeps the thread kinds, the sender's sides and the notification routes", () => {
    expect(schemas.StaffThreadRef.properties.kind.enum).toEqual(["class", "direct"]);
    expect(schemas.StaffMessageSender.properties.side.enum).toEqual(["staff", "student"]);
    expect(schemas.StudentThreadRef.properties.kind.enum).toEqual(["class", "direct"]);
    expect(schemas.NotificationTarget.properties.route.enum).toEqual([
      "assignment",
      "attempt",
      "grading",
      "classes",
      "result",
      "studentAssignment",
      "sharedWithMe",
      "test",
      "messages",
      "studentMessages",
      "dashboard",
    ]);
  });

  it("adds colleagueId to NotificationTarget as an optional property", () => {
    expect(schemas.NotificationTarget.required).toEqual(["route"]);
    expect(schemas.NotificationTarget.properties.colleagueId).toMatchObject({
      $ref: "#/components/schemas/Uuid",
    });
    const valid = shape("NotificationTarget");
    expect(valid({ route: "messages", colleagueId: id }), JSON.stringify(valid.errors)).toBe(true);
    expect(valid({ route: "messages", studentId: id })).toBe(true);
  });

  it("reuses MESSAGING_NOT_ALLOWED for a post to a disabled colleague", () => {
    const conflict: string = op("postColleagueMessage").op.responses["409"].description;
    expect(conflict).toMatch(/^`MESSAGING_NOT_ALLOWED`/);
    expect(schemas.ErrorCode.enum).toContain("MESSAGING_NOT_ALLOWED");
  });
});

describe("listMessageRecipients", () => {
  const { op: finder } = op("listMessageRecipients");
  const param = (name: string) => finder.parameters.find((p: Json) => p.name === name);

  it("takes a required audience, a class or no class, a cursor and a bounded limit", () => {
    expect(param("audience")).toMatchObject({
      in: "query",
      required: true,
      schema: { enum: ["students", "colleagues"] },
    });
    expect(finder.parameters).toContainEqual({ $ref: "#/components/parameters/Query" });
    expect(param("classId").schema).toEqual({ $ref: "#/components/schemas/Uuid" });
    expect(param("inNoClass").schema.type).toBe("boolean");
    expect(param("cursor").schema.type).toBe("string");
    expect(param("limit").schema).toEqual({ type: "integer", minimum: 1, maximum: 50, default: 30 });
  });

  it("is limited to 60 a minute per signed-in user and documents the 429", () => {
    expect(finder.description).toContain("Limited to 60 a minute per signed-in user.");
    expect(finder.responses["429"]).toEqual({ $ref: "#/components/responses/TooManyRequests" });
    expect(finder.responses["404"]).toBeDefined();
  });

  it("answers students and colleagues in one row shape", () => {
    const valid = shape("MessageRecipient");
    const student = {
      id,
      name: "Nguyễn Văn An",
      avatarUrl: null,
      classNames: ["IELTS 6.5 tối 2-4-6"],
      otherClassNames: ["TOEIC sáng"],
      roleName: null,
      roleBuiltinKey: null,
      threadExists: false,
      canPost: true,
    };
    const colleague = {
      ...student,
      id: other,
      classNames: [],
      otherClassNames: [],
      roleName: "Giáo viên",
      roleBuiltinKey: "teacher",
      threadExists: true,
    };
    expect(valid(student), JSON.stringify(valid.errors)).toBe(true);
    expect(valid(colleague), JSON.stringify(valid.errors)).toBe(true);
    expect(valid({ ...student, email: "an@example.com" })).toBe(false);
  });
});

describe("colleague threads", () => {
  it("draws a thread with a disabled colleague and a file from either side", () => {
    const valid = shape("ColleagueDirectThread");
    const message = {
      id,
      sender: { id: other, name: "Lý Thanh Vân", avatarUrl: null, side: "staff" },
      body: null,
      attachment: { id, filename: "de-thi.pdf", bytes: 1024, mimeType: "application/pdf" },
      createdAt: "2026-11-24T03:00:00Z",
      mine: false,
    };
    const thread = {
      colleague: {
        id: other,
        name: "Lý Thanh Vân",
        avatarUrl: null,
        roleName: "Giáo viên",
        roleBuiltinKey: "teacher",
        disabled: true,
        canPost: false,
      },
      messages: [message],
      nextBefore: null,
      latestId: id,
    };
    expect(valid(thread), JSON.stringify(valid.errors)).toBe(true);
    expect(valid({ ...thread, contextEvents: [] })).toBe(false);
  });

  it("posts the staff message body, so either side may attach", () => {
    for (const name of ["postColleagueMessage", "postStaffDirectMessage"]) {
      const body = op(name).op.requestBody.content["application/json"].schema;
      expect(body, name).toEqual({ $ref: "#/components/schemas/StaffMessagePost" });
    }
    const posted = op("postColleagueMessage").op.responses;
    expect(Object.keys(posted).sort()).toEqual(["200", "201", "400", "404", "409", "422", "429"]);
  });

  it("lists a row with its role and a candidate with no activity", () => {
    const valid = shape("ColleagueThread");
    const row = {
      colleagueId: other,
      title: "Lý Thanh Vân",
      avatarUrl: null,
      roleName: "Quản trị viên",
      roleBuiltinKey: "admin",
      candidate: true,
      disabled: false,
      lastMessageAt: null,
      preview: null,
      unread: 0,
    };
    expect(valid(row), JSON.stringify(valid.errors)).toBe(true);
    expect(valid({ ...row, roleBuiltinKey: null, roleName: "Tổ trưởng" })).toBe(true);
  });

  it.each(COLLEAGUE_OPS.filter((n) => n !== "listColleagueThreads"))(
    "%s takes the colleague by the same path name",
    (name) => {
      expect(op(name).path.startsWith("/teacher/messages/colleagues/{colleagueId}")).toBe(true);
    },
  );
});
