"""Large calendar waits through every timing consumer and strict output schema."""
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
BINARY = sys.argv[1]
OUT = Path(tempfile.mkdtemp(prefix="hier-memory-calendar-wire-cli-"))
SAFE = 9007199254740991
SMALL_LIMIT = 1000000000000
# Six macros, two controller steps: 8 words * 2 operations * 1000ps + 7ps.
WAVE = 16007
OCCUPIED = 2 * WAVE
commands = []
equivalences = 0
negatives = 0
schemas = [json.loads(Path(sys.argv[2]).read_text())]
schemas += [json.loads(p.read_text()) for p in ROOT.rglob("*.schema.json")]
registry = Registry().with_resources((s["$id"], Resource.from_contents(s)) for s in schemas)
validators = {}
for schema in schemas:
    Draft202012Validator.check_schema(schema)
    algorithm = schema.get("oneOf", [{}])[0].get("properties", {}).get("algorithm")
    if algorithm:
        validators[algorithm["const"]] = Draft202012Validator(schema, registry=registry)


def file(name, value):
    path = OUT / name
    path.write_text(json.dumps(value, indent=2))
    return str(path)


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in ("snapshotId", "openedAt")}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def same(left, right):
    global equivalences
    assert clean(left) == clean(right)
    equivalences += 1


def call(args, complete=True):
    result = subprocess.run([BINARY, *args, "--require-complete"], capture_output=True, timeout=40)
    index = len(commands)
    (OUT / f"{index}.stdout").write_bytes(result.stdout)
    (OUT / f"{index}.stderr").write_bytes(result.stderr)
    expected = 0 if complete else 4
    commands.append(dict(argv=[BINARY, *args, "--require-complete"], exit=result.returncode,
                         expectedExit=expected))
    file("commands.json", commands)
    assert result.returncode == expected, (index, result.stdout, result.stderr)
    document = json.loads(result.stdout)
    validators[document["algorithm"]].validate(document)
    return document


library = json.loads((ROOT / "tests/memory-clock-library.json").read_text())
library["testProfiles"] = [dict(definitionName=m["definitionName"], operationsPerWord=2,
                                powerMicrowatts=10) for m in library["models"]]
base = ["--top", "domain_resolved", "--scope", "domain_resolved", "--recursive",
        str(ROOT / "tests/memory-clock-sources.sv"), str(ROOT / "tests/memory-test-domains.sv"),
        "--memory-library", file("library.json", library),
        "--plan-tests", "--schedule-tests", "--time-tests"]
template = dict(formatVersion=1, kind="memory-test-config",
                rules=[dict(path=["domain_resolved"], recursive=True, clockDomain="D", partition="")],
                scheduling=dict(resources=[dict(name="R", clockDomains=["D"], maxParallelControllers=4)]),
                timing=dict(clocks=[dict(clockDomain="D", periodPicoseconds=1000)],
                            policy=dict(waveOverheadPicoseconds=7)))
expectations = file("expectations.json", dict(formatVersion=1, kind="memory-clock-expectations",
    domains=[dict(clockDomain="D", sources=[
        dict(path="domain_resolved.clk", bit=0, edge="posedge"),
        dict(path="domain_resolved.clk", bit=1, edge="posedge"),
        dict(path="domain_resolved.clk", bit=0, edge="negedge")])]))
plain = file("plain.json", template)


def timing_documents(value):
    if isinstance(value, dict):
        if value.get("algorithm") == "rtl-memory-test-timing-v1":
            yield value
        for child in value.values():
            yield from timing_documents(child)
    elif isinstance(value, list):
        for child in value:
            yield from timing_documents(child)


def check_timing(document, wait, waves):
    timeline = document["timeline"]
    assert timeline["complete"] == (waves == 2)
    assert len(timeline["waves"]) == waves
    assert timeline["durationPicoseconds"] == (wait + waves * WAVE if waves else 0)
    assert timeline.get("availabilityWaitPicoseconds", 0) == (wait if waves else 0)
    for index, wave in enumerate(timeline["waves"]):
        assert wave["startPicoseconds"] == wait + index * WAVE
        assert wave["endPicoseconds"] == wait + (index + 1) * WAVE
        assert wave["durationPicoseconds"] == WAVE
        assert "resourceWait" not in wave and "dependencyWait" not in wave
        if wait and index == 0:
            assert wave["availabilityWait"] == dict(durationPicoseconds=wait,
                                                    intervals=[dict(resource=0, interval=0)])
        else:
            assert "availabilityWait" not in wave


def check_wire_boundaries(document):
    """Mutate the actual nested timing object, retaining the entire envelope."""
    global negatives
    validator = validators[document["algorithm"]]
    for value in [0, -1, SAFE + 1, True, "1", 1.5, None]:
        mutated = copy.deepcopy(document)
        timing = next(d for d in timing_documents(mutated) if d["timeline"].get("availabilityWaitPicoseconds"))
        timing["timeline"]["waves"][0]["availabilityWait"]["durationPicoseconds"] = value
        assert not validator.is_valid(mutated), (document["algorithm"], value)
        negatives += 1
    # Schema range checks alone do not enforce relationships between quantities.
    mutated = copy.deepcopy(document)
    timing = next(d for d in timing_documents(mutated) if d["timeline"].get("availabilityWaitPicoseconds"))
    timing["timeline"]["waves"][0]["availabilityWait"]["durationPicoseconds"] = SAFE
    validator.validate(mutated)
    for key, indexes in [("resourceWait", "resources"), ("dependencyWait", "dependencies")]:
        mutated = copy.deepcopy(document)
        timing = next(timing_documents(mutated))
        timing["timeline"]["waves"][0][key] = {"durationPicoseconds": SMALL_LIMIT, indexes: [0]}
        validator.validate(mutated)
        timing["timeline"]["waves"][0][key]["durationPicoseconds"] = SMALL_LIMIT + 1
        assert not validator.is_valid(mutated), key
        negatives += 1


def exercise(label, wait, waves=2, duration_limit=None, work_limit=None):
    config = copy.deepcopy(template)
    if wait:
        config["scheduling"]["resources"][0]["unavailableIntervals"] = [
            dict(startPicoseconds=0, endPicoseconds=wait)]
    if duration_limit is not None:
        config["timing"]["policy"]["maxDurationPicoseconds"] = duration_limit
    if work_limit is not None:
        config["timing"]["limits"] = dict(maxWork=work_limit)
    path = file(label + ".json", config)
    args = [*base, "--test-config", path]
    complete = waves == 2
    timing = call(args, complete)
    check_timing(timing, wait, waves)
    coverage = call([*args, "--test-coverage"], complete)
    usage = call([*args, "--test-resource-usage"], complete)
    assessment = call([*args, "--assess-tests", expectations], complete)
    same(coverage["source"], timing)
    same(usage["source"], timing)
    same(assessment["source"], coverage)
    assert usage["usage"]["rows"][0]["occupiedPicoseconds"] == waves * WAVE
    if complete:
        assert assessment["assessment"]["satisfiedInstances"] == 6
    comparison_args = [*base, "--compare-test-config", "plain", plain,
                       "--compare-test-config", "delayed", path]
    comparison = call(comparison_args, complete)
    usage_comparison = call([*comparison_args, "--compare-resource-usage"], complete)
    assessment_comparison = call([*comparison_args, "--compare-clock-expectations", "plain", expectations,
                                  "--compare-clock-expectations", "delayed", expectations], complete)
    same(comparison["configurations"][1]["report"], timing)
    same(usage_comparison["source"], comparison)
    same(assessment_comparison["source"], comparison)
    check_timing(comparison["configurations"][0]["report"], 0, 2)
    if complete:
        assert comparison["rows"][1]["delta"]["durationPicoseconds"] == wait
        assert comparison["rows"][1]["delta"].get("availabilityWaitPicoseconds", 0) == wait
        assert usage_comparison["rows"][0]["cells"][1]["delta"]["occupiedPicoseconds"] == 0
        assert assessment_comparison["rows"][1]["delta"] == dict(
            satisfiedInstances=0, blockedInstances=0, pendingInstances=0)
    else:
        assert "delta" not in comparison["rows"][1]
        assert "delta" not in usage_comparison["rows"][0]["cells"][1]
        assert "delta" not in assessment_comparison["rows"][1]
    documents = [timing, coverage, usage, assessment, comparison, usage_comparison, assessment_comparison]
    if wait and complete:
        for document in documents:
            check_wire_boundaries(document)
        reverse = call([*base, "--compare-test-config", "delayed", path,
                        "--compare-test-config", "plain", plain])
        assert reverse["rows"][0]["delta"]["availabilityWaitPicoseconds"] == 0
        assert reverse["rows"][1]["delta"]["availabilityWaitPicoseconds"] == -wait
        assert reverse["rows"][1]["delta"]["durationPicoseconds"] == -wait
        same(reverse["configurations"][0]["report"], timing)


try:
    exercise("plain", 0)
    exercise("old-maximum", SMALL_LIMIT)
    exercise("above-old-maximum", SMALL_LIMIT + 1)
    exercise("exact-safe-total", SAFE - OCCUPIED)
    exercise("partial-last-wave", SAFE - OCCUPIED, waves=1, duration_limit=SAFE - 1)
    exercise("partial-first-wave", SAFE - OCCUPIED, waves=0, duration_limit=SAFE - WAVE - 1)
    exercise("safe-end-no-room", SAFE, waves=0)
    exercise("work-no-half-wave", SMALL_LIMIT + 1, waves=0, work_limit=1)
    print(json.dumps(dict(calls=len(commands), schemaNegative=negatives, equivalences=equivalences,
                          modes=7, cases=8, output=str(OUT))))
except BaseException:
    print("Raw failure evidence:", OUT)
    raise
