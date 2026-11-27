"""Generate private C++ validators/default application from the sole wire schema."""

import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
source = (ROOT / "protocol/schema/hier.schema.json").read_bytes()
schema = json.loads(source)
defs = schema["$defs"]
functions = {}
bodies = []
allowed = {
    "$ref",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "const",
    "allOf",
    "if",
    "then",
    "else",
    "items",
    "enum",
    "maxItems",
    "minItems",
    "minimum",
    "maximum",
    "oneOf",
    "default",
    "description",
    "minLength",
    "anyOf",
    "pattern",
    "$comment",
    "maxLength",
    "dependentRequired",
    "uniqueItems",
    "not",
    "contains",
    "format",
}
q = json.dumps


def character_runs(expression):
    """Compile the schema's anchored ASCII concatenations; reject other regexes.

    Variable runs must be disjoint from every reachable following run, so the
    generated greedy scan has the same language without backtracking.
    """
    end = r"(?![\s\S])"
    if not expression.startswith("^") or not expression.endswith(end):
        raise ValueError("Pattern requires absolute start/end anchors")
    body = expression[1 : -len(end)]
    runs = []
    while body:
        token = re.match(
            r"(\[[0-9A-Za-z-]+\]|\\[.\\]|[A-Za-z0-9':-])(\{[1-9][0-9]*\}|[+*])?",
            body,
        )
        if not token:
            raise ValueError("Unsupported pattern syntax: " + expression)
        atom, repeat = token.groups()
        body = body[token.end() :]
        if atom.startswith("["):
            members = atom[1:-1]
            chars = set()
            i = 0
            while i < len(members):
                if i + 2 < len(members) and members[i + 1] == "-":
                    lo, hi = ord(members[i]), ord(members[i + 2])
                    if lo > hi or members[i] == "-" or members[i + 2] == "-":
                        raise ValueError("Unsupported character range")
                    chars.update(chr(c) for c in range(lo, hi + 1))
                    i += 3
                else:
                    if members[i] == "-":
                        raise ValueError("Unsupported literal hyphen in class")
                    chars.add(members[i])
                    i += 1
            chars = "".join(sorted(chars))
        else:
            chars = atom.removeprefix("\\")
        minimum = maximum = 1
        if repeat in ("*", "+"):
            minimum, maximum = int(repeat == "+"), None
        elif repeat:
            minimum = maximum = int(repeat[1:-1])
            if maximum > 4294967295:
                raise ValueError("Pattern repeat exceeds portable size_t")
        runs.append((chars, minimum, maximum))
    for i, (chars, _, maximum) in enumerate(runs):
        if maximum is not None:
            continue
        for following, minimum, _ in runs[i + 1 :]:
            if set(chars).intersection(following):
                raise ValueError("Pattern requires backtracking")
            if minimum:
                break
    return runs


def pattern_argument(expression):
    return (
        "{"
        + ", ".join(
            "{"
            + q(chars)
            + ", "
            + str(minimum)
            + ", "
            + (str(maximum) if maximum is not None else "std::string_view::npos")
            + "}"
            for chars, minimum, maximum in character_runs(expression)
        )
        + "}"
    )


def emit(s):
    key = json.dumps(s, sort_keys=True)
    if key in functions:
        return functions[key]
    name = "rule" + str(len(functions))
    functions[key] = name
    lines = ["    (void)v;"]

    def require(expr):
        lines.append(f"    if (!({expr})) return false;")

    if isinstance(s, bool):
        lines.append("    return " + str(s).lower() + ";")
    else:
        unknown = set(s) - allowed
        if unknown:
            raise ValueError(unknown)
        if "$ref" in s:
            require(f"{emit(defs[s['$ref'].split('/')[-1]])}(v)")
        if "type" in s:
            types = {
                "object": "JsonValue::Object",
                "array": "JsonValue::Array",
                "string": "std::string",
                "boolean": "bool",
                "null": "std::nullptr_t",
                "number": "JsonNumber",
            }
            t = s["type"]
            require(
                "integer(v).has_value()"
                if t == "integer"
                else f"std::holds_alternative<{types[t]}>(v.value)"
            )

        def literal(x):
            if isinstance(x, str):
                return f"equalString(v, {q(x)})"
            if isinstance(x, bool):
                return f"equalBool(v, {str(x).lower()})"
            if isinstance(x, int):
                return f"integer(v) == std::optional<int64_t>({x}LL)"
            if x is None:
                return "std::holds_alternative<std::nullptr_t>(v.value)"
            raise ValueError("Unsupported schema constant")

        if "const" in s:
            require(literal(s["const"]))
        if "enum" in s:
            require(" || ".join(literal(x) for x in s["enum"]))
        for key, op in [("minimum", ">="), ("maximum", "<=")]:
            if key in s:
                require(
                    f"!std::holds_alternative<JsonNumber>(v.value) || (integer(v) && *integer(v) {op} {s[key]}LL)"
                )
        strlines = []
        for key, op in [("minLength", ">="), ("maxLength", "<=")]:
            if key in s:
                strlines.append(
                    f"if (!(unicodeLength(*s) {op} {s[key]}u)) return false;"
                )
        if "pattern" in s:
            strlines.append(
                f"if (!pattern(*s, {pattern_argument(s['pattern'])})) return false;"
            )
        if "format" in s:
            if s["format"] != "date-time":
                raise ValueError("Unknown format")
            strlines.append("if (!utcCalendar(*s)) return false;")
        if strlines:
            lines.append(
                "    if (const auto s = std::get_if<std::string>(&v.value)) {\n        "
                + "\n        ".join(strlines)
                + "\n    }"
            )
        objlines = []
        for key in s.get("required", []):
            objlines.append(f"if (!o->contains({q(key)})) return false;")
        for key, sub in s.get("properties", {}).items():
            objlines.append(
                f"if (const auto it = o->find({q(key)}); it != o->end() && !{emit(sub)}(it->second)) return false;"
            )
        for key, deps in s.get("dependentRequired", {}).items():
            for dep in deps:
                objlines.append(
                    f"if (o->contains({q(key)}) && !o->contains({q(dep)})) return false;"
                )
        if s.get("additionalProperties") is False:
            known = (
                " && ".join(f"key != {q(k)}" for k in s.get("properties", {})) or "true"
            )
            objlines.append(
                f"for (const auto &[key, unused] : *o) if ({known}) return false;"
            )
        elif isinstance(s.get("additionalProperties"), dict):
            known = (
                " && ".join(f"key != {q(k)}" for k in s.get("properties", {})) or "true"
            )
            objlines.append(
                f"for (const auto &[key, item] : *o) if ({known}) {{ if (!{emit(s['additionalProperties'])}(item)) return false; }}"
            )
        if objlines:
            lines.append(
                "    if (const auto o = std::get_if<JsonValue::Object>(&v.value)) {\n        "
                + "\n        ".join(objlines)
                + "\n    }"
            )
        arraylines = []
        for key, op in [("minItems", ">="), ("maxItems", "<=")]:
            if key in s:
                arraylines.append(f"if (!(a->size() {op} {s[key]}u)) return false;")
        if "items" in s:
            arraylines.append(
                f"for (const auto &item : *a) if (!{emit(s['items'])}(item)) return false;"
            )
        if "contains" in s:
            arraylines.append(
                f"if (std::none_of(a->begin(), a->end(), {emit(s['contains'])})) return false;"
            )
        if s.get("uniqueItems"):
            arraylines.append("if (!unique(*a)) return false;")
        if arraylines:
            lines.append(
                "    if (const auto a = std::get_if<JsonValue::Array>(&v.value)) {\n        "
                + "\n        ".join(arraylines)
                + "\n    }"
            )
        for key, op in [("allOf", " && "), ("anyOf", " || ")]:
            if key in s:
                require(op.join(emit(sub) + "(v)" for sub in s[key]))
        if "oneOf" in s:
            require(
                "("
                + " + ".join("int(" + emit(sub) + "(v))" for sub in s["oneOf"])
                + ") == 1"
            )
        if "not" in s:
            require("!" + emit(s["not"]) + "(v)")
        if "if" in s:
            cond = emit(s["if"]) + "(v)"
            require(
                f"{cond} ? {emit(s.get('then', True))}(v) : {emit(s.get('else', True))}(v)"
            )
        lines.append("    return true;")
    bodies.append(f"bool {name}(const JsonValue &v) {{\n" + "\n".join(lines) + "\n}\n")
    return name


named = {name: emit(s) for name, s in defs.items()}


def merge(a, b):
    out = a | b
    if "properties" in a or "properties" in b:
        out["properties"] = dict(a.get("properties", {}))
        for k, v in b.get("properties", {}).items():
            out["properties"][k] = merge(out["properties"].get(k, {}), v)
    return out


def descriptor(s):
    local = {k: v for k, v in s.items() if k in ("type", "default")}
    if "properties" in s:
        local["properties"] = {k: descriptor(v) for k, v in s["properties"].items()}
    if "items" in s:
        local["items"] = descriptor(s["items"])
    return (
        merge(descriptor(defs[s["$ref"].split("/")[-1]]), local)
        if "$ref" in s
        else local
    )


norms = []


def normalize(d):
    name = "norm" + str(len(norms))
    norms.append("")
    lines = []
    if d.get("type") == "object":
        lines = [
            "    JsonValue::Object out;",
            "    const auto &object = std::get<JsonValue::Object>(v.value);",
            "    (void)object;",
        ]
        for k, sub in d.get("properties", {}).items():
            fn = normalize(sub)
            lines.append(
                f"    if (const auto it = object.find({q(k)}); it != object.end()) out.emplace({q(k)}, {fn}(it->second));"
            )
            if "default" in sub:
                default = sub["default"]
                if isinstance(default, str):
                    val = "JsonValue{std::string(" + q(default) + ")}"
                elif isinstance(default, bool):
                    val = "JsonValue{" + str(default).lower() + "}"
                elif isinstance(default, int):
                    val = "JsonValue{JsonNumber{" + q(str(default)) + "}}"
                elif default == {}:
                    val = "JsonValue{JsonValue::Object{}}"
                else:
                    raise ValueError("Unsupported default")
                lines.append(f"    else out.emplace({q(k)}, {fn}({val}));")
        lines.append("    return {std::move(out)};")
    elif d.get("type") == "array":
        fn = normalize(d["items"])
        lines = [
            "    JsonValue::Array out;",
            f"    for (const auto &item : std::get<JsonValue::Array>(v.value)) out.push_back({fn}(item));",
            "    return {std::move(out)};",
        ]
    else:
        lines = ["    return v;"]
    norms[int(name[4:])] = (
        f"JsonValue {name}(const JsonValue &v) {{\n" + "\n".join(lines) + "\n}\n"
    )
    return name


methods = []
for name, entry in schema["x-hier-methods"].items():
    norm = normalize(descriptor(entry["params"]))
    methods.append(
        "    {"
        + ", ".join(
            [
                q(name),
                q(entry["clientMethod"]),
                q(entry["params"]["$ref"].split("/")[-1]),
                q(entry["response"]["$ref"].split("/")[-1]),
                str(entry["allowsPartial"]).lower(),
                str(entry["cacheComplete"]).lower(),
                norm,
            ]
        )
        + "},"
    )
head = (
    "// Generated by protocol/schema/scripts/generate_cpp.py; DO NOT EDIT.\n// Schema SHA-256 "
    + hashlib.sha256(source).hexdigest()
    + "\n"
)
out = (
    head
    + '#include "WireSchema.h"\n#include "SchemaPrimitives.h"\n#include <algorithm>\n\nnamespace hier::protocol::session {\nnamespace {\nusing namespace schema;\n'
)
out += (
    "\n".join("bool " + name + "(const JsonValue &);" for name in functions.values())
    + "\n"
)
out += (
    "\n".join(
        "JsonValue norm" + str(i) + "(const JsonValue &);" for i in range(len(norms))
    )
    + "\n"
)
out += (
    "\n".join(bodies + norms)
    + "\nconst Method methods[] = {\n"
    + "\n".join(methods)
    + "\n};\n} // namespace\n"
)
out += "bool validateDefinition(std::string_view name, const JsonValue &v) {\n"
out += (
    "\n".join(
        f"    if (name == {q(name)}) return {fn}(v);" for name, fn in named.items()
    )
    + "\n    return false;\n}\n"
)
out += "const Method *findMethod(std::string_view name) {\n    for (const auto &method : methods) if (name == method.name) return &method;\n    return nullptr;\n}\n} // namespace hier::protocol::session\n"
target = ROOT / "core/protocol/src/WireSchema.generated.cpp"
if "--check" in sys.argv:
    if not target.exists() or target.read_text() != out:
        sys.exit("C++ schema generation differs")
else:
    target.write_text(out)
print(
    f"C++ schema: {len(named)} definitions, {len(methods)} methods, "
    + ("checked" if "--check" in sys.argv else "generated")
)
