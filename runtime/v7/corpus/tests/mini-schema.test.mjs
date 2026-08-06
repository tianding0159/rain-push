// Tests for the zero-dep mini-schema validator. The four corpus schemas depend on it, so
// each supported keyword must be proven to both accept valid data and reject invalid data,
// including enumFrom resolution against the policy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, SCHEMA_ERROR_CODES } from "../lib/mini-schema.mjs";
import { loadPolicy } from "../lib/source-policy.mjs";
import { loadSchemas } from "../lib/io.mjs";

const policy = loadPolicy();

function codes(res) { return res.errors.map((e) => e.code); }

test("type checking", () => {
  assert.ok(validate({ type: "string" }, "x", policy).valid);
  assert.ok(!validate({ type: "string" }, 1, policy).valid);
  assert.ok(validate({ type: "integer" }, 5, policy).valid);
  assert.ok(!validate({ type: "integer" }, 5.5, policy).valid);
  assert.ok(validate({ type: "boolean" }, true, policy).valid);
  assert.ok(validate({ type: "array" }, [], policy).valid);
  assert.ok(validate({ type: "object" }, {}, policy).valid);
});

test("required + additionalProperties", () => {
  const s = { type: "object", required: ["a"], additionalProperties: false, properties: { a: { type: "string" } } };
  assert.ok(validate(s, { a: "x" }, policy).valid);
  assert.ok(codes(validate(s, {}, policy)).includes(SCHEMA_ERROR_CODES.REQUIRED));
  assert.ok(codes(validate(s, { a: "x", b: 1 }, policy)).includes(SCHEMA_ERROR_CODES.ADDITIONAL));
});

test("const, enum, pattern, minLength, minimum, minItems", () => {
  assert.ok(codes(validate({ const: 1 }, 2, policy)).includes(SCHEMA_ERROR_CODES.CONST));
  assert.ok(codes(validate({ enum: ["a", "b"] }, "c", policy)).includes(SCHEMA_ERROR_CODES.ENUM));
  assert.ok(codes(validate({ type: "string", pattern: "^x$" }, "y", policy)).includes(SCHEMA_ERROR_CODES.PATTERN));
  assert.ok(codes(validate({ type: "string", minLength: 2 }, "a", policy)).includes(SCHEMA_ERROR_CODES.MIN_LENGTH));
  assert.ok(codes(validate({ type: "integer", minimum: 1 }, 0, policy)).includes(SCHEMA_ERROR_CODES.MINIMUM));
  assert.ok(codes(validate({ type: "array", minItems: 1 }, [], policy)).includes(SCHEMA_ERROR_CODES.MIN_ITEMS));
});

test("enumFrom resolves against the policy", () => {
  const s = { type: "string", enumFrom: "channels" };
  assert.ok(validate(s, "jine", policy).valid);
  assert.ok(codes(validate(s, "telepathy", policy)).includes(SCHEMA_ERROR_CODES.ENUM_FROM));
  // Object-keyed policy sections resolve to their keys.
  assert.ok(validate({ type: "string", enumFrom: "sourceLayers" }, "C1", policy).valid);
  assert.ok(!validate({ type: "string", enumFrom: "sourceLayers" }, "C9", policy).valid);
});

test("number type accepts int + float and enforces minimum; integer still rejects floats", () => {
  const num = { type: "number", minimum: 0 };
  assert.ok(validate(num, 0, policy).valid);
  assert.ok(validate(num, 0.3, policy).valid);
  assert.ok(validate(num, 1, policy).valid);
  assert.ok(codes(validate(num, -0.1, policy)).includes(SCHEMA_ERROR_CODES.MINIMUM));
  assert.ok(codes(validate(num, "0.3", policy)).includes(SCHEMA_ERROR_CODES.TYPE));
  assert.ok(codes(validate(num, NaN, policy)).includes(SCHEMA_ERROR_CODES.TYPE));
  // integer must still reject a float — number support must not loosen integer.
  const int = { type: "integer", minimum: 0 };
  assert.ok(validate(int, 3, policy).valid);
  assert.ok(codes(validate(int, 0.3, policy)).includes(SCHEMA_ERROR_CODES.TYPE));
});

test("nested $ref + items", () => {
  const s = {
    type: "object", required: ["list"], properties: {
      list: { type: "array", items: { $ref: "#/$defs/row" } },
    },
    $defs: { row: { type: "object", required: ["n"], properties: { n: { type: "integer", minimum: 0 } } } },
  };
  assert.ok(validate(s, { list: [{ n: 0 }, { n: 3 }] }, policy).valid);
  assert.ok(!validate(s, { list: [{ n: -1 }] }, policy).valid);
});

test("all four committed schemas load and self-validate structurally", () => {
  const s = loadSchemas();
  for (const name of ["registry", "event", "public", "retrieval"]) {
    assert.equal(s[name].$schemaDialect, "rain-push-corpus/mini-schema/1", `${name} dialect`);
    assert.ok(s[name].type === "object", `${name} root is object`);
  }
});
