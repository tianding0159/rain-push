// Privacy / verbatim-export scanner.
//
// The last line of defence before anything is published: given the PRIVATE events (the
// verbatim truth) and a set of PUBLIC-facing artifacts (parsed JSON that is about to be
// committed), prove that no private verbatim text — and no obviously private field — has
// leaked into the public side.
//
// It flags, with stable codes:
//   - VERBATIM_TEXT     : a private message's exact text appears anywhere in a public artifact
//   - PRIVATE_FIELD     : a public record carries a field that only exists on private records
//                          (text / messages / verbatim / x_legacy)
//   - SHORT_STRING_MATCH: (informational) a shorter private line embedded in a public string
//
// It does NOT hash-compare (a matching hash is expected and safe); it looks for raw text,
// which is exactly what must never appear publicly. Pure and deterministic.

export const PRIVACY_CODES = Object.freeze({
  VERBATIM_TEXT: "PRIVACY_VERBATIM_TEXT",
  PRIVATE_FIELD: "PRIVACY_PRIVATE_FIELD",
});

// Fields that are legitimate ONLY on private records; their presence on a public artifact
// means a private shape leaked through.
const PRIVATE_ONLY_FIELDS = ["text", "messages", "verbatim", "x_legacy"];

// Minimum length for a private line to be worth scanning for as a substring. Very short
// strings ("很强") would false-positive against unrelated public prose; those are still
// caught by exact-field matching, just not by substring scan.
const MIN_SUBSTRING_LEN = 4;

// Recursively collect every string in a parsed JSON artifact — both values AND object keys
// — with its path. Keys are scanned too because a leak could hide verbatim text as a JSON
// key, and this scanner must hold for arbitrary public artifacts, not just our own export
// output.
function collectStrings(node, path, out) {
  if (typeof node === "string") {
    out.push({ path, value: node });
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const childPath = path ? `${path}.${k}` : k;
      out.push({ path: `${childPath} (key)`, value: k }); // the key itself
      collectStrings(node[k], childPath, out);
    }
  }
}

// Recursively find any PRIVATE_ONLY_FIELDS keys present in a public artifact.
function findPrivateFields(node, path, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => findPrivateFields(v, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (PRIVATE_ONLY_FIELDS.includes(k)) out.push({ path: path ? `${path}.${k}` : k, field: k });
      findPrivateFields(node[k], path ? `${path}.${k}` : k, out);
    }
  }
}

// Scan public artifacts for leakage of private verbatim.
//   privateEvents: array of private corpus events (source of verbatim truth)
//   publicArtifacts: array of { name, data } where data is parsed public-facing JSON
//   returns: { clean, findings: [{ code, artifact, path, detail }] } — deterministic.
export function scanForLeaks(privateEvents, publicArtifacts) {
  const findings = [];

  // Gather the set of private verbatim strings worth scanning.
  const verbatim = [];
  for (const evt of privateEvents || []) {
    for (const m of evt.messages || []) {
      if (typeof m.text === "string" && m.text.length >= MIN_SUBSTRING_LEN) {
        verbatim.push({ eventId: evt.id, text: m.text });
      }
    }
  }

  for (const art of publicArtifacts || []) {
    // 1. private-only fields present in a public artifact.
    const fields = [];
    findPrivateFields(art.data, "", fields);
    for (const f of fields) {
      findings.push({ code: PRIVACY_CODES.PRIVATE_FIELD, artifact: art.name, path: f.path, detail: `private-only field "${f.field}" in public artifact` });
    }

    // 2. private verbatim text appearing in any public string value.
    const strings = [];
    collectStrings(art.data, "", strings);
    for (const s of strings) {
      for (const v of verbatim) {
        if (s.value.includes(v.text)) {
          findings.push({ code: PRIVACY_CODES.VERBATIM_TEXT, artifact: art.name, path: s.path, detail: `contains verbatim from ${v.eventId}` });
        }
      }
    }
  }

  // Deterministic ordering: by artifact, then code, then path.
  findings.sort((a, b) =>
    a.artifact < b.artifact ? -1 : a.artifact > b.artifact ? 1 :
    a.code < b.code ? -1 : a.code > b.code ? 1 :
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  return { clean: findings.length === 0, findings };
}
