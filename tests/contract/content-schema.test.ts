import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { loadSpec, propertyNames, SPEC_PATH } from "@tests/support/openapi";

/**
 * The contract's half of the content and DG-109 media fixtures (D-064). The
 * server states its rules in api/testdata; here the schema must describe them.
 * Whether a client's own guards take and refuse the same documents is each
 * client's test, against the SDK it pins (the web's content-contract and
 * question-media-contract tests).
 */

type ContentCase = { name: string; document: unknown; schemaValid: boolean };
type MediaCase = {
  name: string;
  profile: "prompt" | "explanation";
  document: unknown;
  valid: boolean;
};

const testdata = <T>(name: string): T[] =>
  JSON.parse(readFileSync(resolve(SPEC_PATH, "../testdata", name), "utf8")) as T[];

const doc = loadSpec();
const schemas = doc.components.schemas as Record<string, Record<string, unknown>>;
const ajv = new Ajv({ strict: false, validateFormats: true });
addFormats(ajv);
const compile = (name: string) =>
  ajv.compile({ $ref: `#/components/schemas/${name}`, components: doc.components });

describe("content-v1.json", () => {
  const cases = testdata<ContentCase>("content-v1.json");
  const shape = compile("ContentDocument");

  test.each(cases)("$name meets the schema exactly when the fixture says so", (fixture) => {
    expect(shape(fixture.document), JSON.stringify(shape.errors)).toBe(fixture.schemaValid);
  });

  test("the content vocabulary carries no answer keys or provenance", () => {
    const names = propertyNames(doc, doc.components.schemas.ContentDocument);
    for (const field of [
      "isCorrect",
      "acceptedAnswers",
      "sampleAnswer",
      "transcript",
      "transcripts",
      "sourcePath",
      "teacherNote",
    ])
      expect(names.has(field)).toBe(false);
  });
});

describe("question-media-v1.json (DG-109)", () => {
  const cases = testdata<MediaCase>("question-media-v1.json");
  const profiles = {
    prompt: compile("QuestionPromptContent"),
    explanation: compile("QuestionExplanationContent"),
  };

  test.each(cases.filter((fixture) => fixture.valid))(
    "$name is a document the contract describes",
    (fixture) => {
      const shape = profiles[fixture.profile];
      expect(shape(fixture.document), JSON.stringify(shape.errors)).toBe(true);
    },
  );

  test("a media block inside a list item is no document the contract describes", () => {
    const nested = cases.find((fixture) => fixture.name === "an image in a list item is refused");
    expect(nested).toBeDefined();
    expect(profiles.prompt(nested?.document)).toBe(false);
  });

  test("both profiles carry the same media-block limit", () => {
    const blocks = schemas["QuestionPromptContent"]?.["x-media-blocks"];
    expect(Number.isInteger(blocks) && (blocks as number) > 0).toBe(true);
    expect(schemas["QuestionExplanationContent"]?.["x-media-blocks"]).toBe(blocks);
  });
});
