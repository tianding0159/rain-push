// Zero-dependency structural validator for the "rain-push-corpus/mini-schema/1" dialect.
//
// We deliberately do NOT pull in a JSON-Schema library: the corpus-contracts CI job must
// run fully offline with no production engine deps, and the shapes we need are small. This
// validator supports exactly the keywords our four schemas use:
//   type (object|array|string|integer|boolean), required, additionalProperties,
//   properties, items, $defs + $ref (local "#/..."), enum, const, minLength, minimum,
//   minItems, pattern, and enumFrom (resolves the allowed set from the source-policy).
//
// enumFrom is the bridge to policy/source-policy.json: instead of duplicating the channel
// / layer / persona-surface lists inside every schema, a field says {"enumFrom":"channels"}
// and the validator asks the loaded policy for the current set. That keeps the policy the
// single source of truth for enums.
//
// validate() returns { valid, errors: [{ path, code, detail }] } — deterministic order,
// stable machine-readable codes. It never throws on data; it throws only on a malformed
// SCHEMA (programmer error), which callers surface distinctly.

export const SCHEMA_ERROR_CODES = Object.freeze({
  TYPE: "SCHEMA_TYPE",
  REQUIRED: "SCHEMA_REQUIRED",
  ADDITIONAL: "SCHEMA_ADDITIONAL_PROPERTY",
  ENUM: "SCHEMA_ENUM",
  ENUM_FROM: "SCHEMA_ENUM_FROM",
  CONST: "SCHEMA_CONST",
  MIN_LENGTH: "SCHEMA_MIN_LENGTH",
  MINIMUM: "SCHEMA_MINIMUM",
  MIN_ITEMS: "SCHEMA_MIN_ITEMS",
  PATTERN: "SCHEMA_PATTERN",
});

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function isInteger(v) {
  return typeof v === "number" && Number.isInteger(v);
}

// Resolve a local "#/$defs/foo" reference against the root schema. Throws on a bad ref
// (that is a schema-authoring bug, not a data problem).
function resolveRef(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    throw new Error(`mini-schema: unsupported $ref ${JSON.stringify(ref)}`);
  }
  const parts = ref.slice(2).split("/");
  let node = root;
  for (const p of parts) {
    node = node && node[p];
    if (node === undefined) throw new Error(`mini-schema: cannot resolve $ref ${ref}`);
  }
  return node;
}

// enumFrom → the concrete allowed list from the policy. sourceLayers / evidenceLevels /
// trustLevels / routeSeverities are object-keyed in the policy; the rest are arrays.
function enumSetFromPolicy(policy, name) {
  const v = policy[name];
  if (Array.isArray(v)) return v;
  if (isPlainObject(v)) return Object.keys(v);
  throw new Error(`mini-schema: enumFrom references unknown policy section ${JSON.stringify(name)}`);
}

function typeOk(schemaType, value) {
  switch (schemaType) {
    case "object": return isPlainObject(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return isInteger(value);
    case "boolean": return typeof value === "boolean";
    default:
      throw new Error(`mini-schema: unsupported type ${JSON.stringify(schemaType)}`);
  }
}

function validateNode(schema, value, ctx, path, errors) {
  const { root, policy } = ctx;

  if (schema.$ref) {
    return validateNode(resolveRef(root, schema.$ref), value, ctx, path, errors);
  }

  if (schema.type && !typeOk(schema.type, value)) {
    errors.push({ path, code: SCHEMA_ERROR_CODES.TYPE, detail: `expected ${schema.type}` });
    return; // further keyword checks assume the base type held
  }

  if ("const" in schema && value !== schema.const) {
    errors.push({ path, code: SCHEMA_ERROR_CODES.CONST, detail: `expected ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path, code: SCHEMA_ERROR_CODES.ENUM, detail: `not in ${JSON.stringify(schema.enum)}` });
  }
  if (schema.enumFrom) {
    const set = enumSetFromPolicy(policy, schema.enumFrom);
    if (!set.includes(value)) {
      errors.push({ path, code: SCHEMA_ERROR_CODES.ENUM_FROM, detail: `not a valid ${schema.enumFrom}` });
    }
  }

  if (schema.type === "string" && typeof value === "string") {
    if ("minLength" in schema && value.length < schema.minLength) {
      errors.push({ path, code: SCHEMA_ERROR_CODES.MIN_LENGTH, detail: `min ${schema.minLength}` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, code: SCHEMA_ERROR_CODES.PATTERN, detail: schema.pattern });
    }
  }

  if (schema.type === "integer" && isInteger(value) && "minimum" in schema && value < schema.minimum) {
    errors.push({ path, code: SCHEMA_ERROR_CODES.MINIMUM, detail: `min ${schema.minimum}` });
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if ("minItems" in schema && value.length < schema.minItems) {
      errors.push({ path, code: SCHEMA_ERROR_CODES.MIN_ITEMS, detail: `min ${schema.minItems}` });
    }
    if (schema.items) {
      value.forEach((item, i) => validateNode(schema.items, item, ctx, `${path}[${i}]`, errors));
    }
  }

  if (schema.type === "object" && isPlainObject(value)) {
    const props = schema.properties || {};
    for (const req of schema.required || []) {
      if (!(req in value)) {
        errors.push({ path: path ? `${path}.${req}` : req, code: SCHEMA_ERROR_CODES.REQUIRED, detail: "missing" });
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          errors.push({ path: path ? `${path}.${key}` : key, code: SCHEMA_ERROR_CODES.ADDITIONAL, detail: "unexpected property" });
        }
      }
    }
    // Validate declared properties in schema-declaration order for deterministic errors.
    for (const key of Object.keys(props)) {
      if (key in value) {
        validateNode(props[key], value[key], ctx, path ? `${path}.${key}` : key, errors);
      }
    }
  }
}

// Validate `data` against `schema` using `policy` to resolve enumFrom. Deterministic.
export function validate(schema, data, policy) {
  const errors = [];
  validateNode(schema, data, { root: schema, policy }, "", errors);
  return { valid: errors.length === 0, errors };
}
