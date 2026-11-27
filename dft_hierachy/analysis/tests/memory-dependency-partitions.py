"""Declared partition dependencies through the real CLI and every report consumer."""
import copy
import json
import random
import subprocess
import sys
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(tempfile.mkdtemp(prefix="hier-memory-dependency-partitions-cli-"))
WAVE = 16007  # 8 words * 2 operations * 1000ps, plus 7ps wave overhead.
commands = []
equivalences = negatives = references = 0
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


def call(args, code=0):
    argv = [sys.argv[1], *args]
    result = subprocess.run(argv, capture_output=True, timeout=40)
    index = len(commands)
    (OUT / f"{index}.stdout").write_bytes(result.stdout)
    (OUT / f"{index}.stderr").write_bytes(result.stderr)
    commands.append(dict(argv=argv, exit=result.returncode, expectedExit=code))
    file("commands.json", commands)
    assert result.returncode == code, (index, result.stdout, result.stderr)
    document = json.loads(result.stdout)
    validators[document.get("algorithm", "rtl-memory-test-timing-v1")].validate(document)
    return document


def edge(before="a", after="b", bp=None, ap=None, gap=0):
    return dict(before=before, after=after, beforePartitions=bp or [],
                afterPartitions=ap or [], minimumGapPicoseconds=gap)


base = ["--top", "schedule_top", "--scope", "schedule_top", "--recursive",
        str(ROOT / "tests/memory-test-schedule.sv"), "--memory-library",
        str(ROOT / "tests/memory-test-schedule-library.json"),
        "--plan-tests", "--schedule-tests", "--time-tests"]
assignments = [dict(instancePath="schedule_top." + name, clockDomain=name[0], partition="p" + name[1])
               for name in ["a0", "a1", "a2", "a3", "b0", "b1", "c0", "d0"]]
template = dict(formatVersion=1, kind="memory-test-config", assignments=assignments,
    planning=dict(policy=dict(maxMemoriesPerController=1)),
    scheduling=dict(policy=dict(maxParallelControllers=8, maxPowerMicrowatts=1000000)),
    timing=dict(clocks=[dict(clockDomain=d, periodPicoseconds=1000) for d in "abcd"],
                policy=dict(waveOverheadPicoseconds=7)))
expectations = file("expectations.json", dict(formatVersion=1, kind="memory-clock-expectations",
    domains=[dict(clockDomain=d, sources=[dict(path="schedule_top.clk", bit=0, edge="posedge")])
             for d in "abcd"]))


def invoke(label, config, complete=True, extra=()):
    return call([*base, "--test-config", file(label + ".json", config), *extra, "--require-complete"],
                0 if complete else 4)


def nodes(value, algorithm):
    if isinstance(value, dict):
        if value.get("algorithm") == algorithm:
            yield value
        for child in value.values():
            yield from nodes(child, algorithm)
    elif isinstance(value, list):
        for child in value:
            yield from nodes(child, algorithm)


def envelope_boundaries(document):
    global negatives
    for field in ["beforePartitions", "afterPartitions"]:
        for bad in [["p0", "p0"], [None], "p0", ["a\0b"], ["x" * 4097], list(map(str, range(1025)))]:
            changed = copy.deepcopy(document)
            schedule = next(nodes(changed, "rtl-memory-test-schedule-v1"))
            schedule["schedule"]["request"]["dependencies"][0][field] = bad
            assert not validators[document["algorithm"]].is_valid(changed), (field, bad)
            negatives += 1


def chain(label, config, duration, complete=True):
    # Every envelope must retain the exact authoritative source, including selectors.
    plain_config = copy.deepcopy(config)
    plain_config["scheduling"].pop("dependencies")
    plain = file(label + "-plain.json", plain_config)
    selected = file(label + ".json", config)
    args = [*base, "--test-config", selected]
    code = 0 if complete else 4
    timing = call([*args, "--require-complete"], code)
    assert timing["timeline"]["durationPicoseconds"] == duration
    coverage = call([*args, "--test-coverage", "--require-complete"], code)
    usage = call([*args, "--test-resource-usage", "--require-complete"], code)
    assessment = call([*args, "--assess-tests", expectations, "--require-complete"], code)
    same(coverage["source"], timing)
    same(usage["source"], timing)
    same(assessment["source"], coverage)
    compare = [*base, "--compare-test-config", "plain", plain, "--compare-test-config", "selected", selected]
    comparison = call([*compare, "--require-complete"], code)
    usage_comparison = call([*compare, "--compare-resource-usage", "--require-complete"], code)
    assessed = call([*compare, "--compare-clock-expectations", "plain", expectations,
                     "--compare-clock-expectations", "selected", expectations, "--require-complete"], code)
    same(comparison["configurations"][1]["report"], timing)
    same(usage_comparison["source"], comparison)
    same(assessed["source"], comparison)
    if complete:
        assert coverage["coverage"]["timedInstances"] == assessment["assessment"]["satisfiedInstances"] == 8
        for document in [timing, coverage, usage, assessment, comparison, usage_comparison, assessed]:
            # The first schedule in a comparison is deliberately the unfiltered reference.
            if document in [comparison, usage_comparison, assessed]:
                changed = copy.deepcopy(document)
                first = next(nodes(changed, "rtl-memory-test-schedule-v1"))
                first["schedule"]["request"]["dependencies"] = copy.deepcopy(timing["source"]["schedule"]["request"]["dependencies"])
                envelope_boundaries(changed)
            else:
                envelope_boundaries(document)
    else:
        assert "delta" not in comparison["rows"][1] and "delta" not in assessed["rows"][1]
        assert "delta" not in usage_comparison["rows"][0]["cells"][1]
    return timing, usage


def matches(controller, dependency, side):
    names = dependency[side + "Partitions"]
    return (controller["clockDomain"] == dependency[side]
            and (not names or controller["partition"] in names))


def reference(config):
    """Simple full scans over explicit eight-controller declarations; no product-derived oracle."""
    controllers = config["assignments"]
    edges = config["scheduling"]["dependencies"]
    states = ["pending"] * len(controllers)
    expected_waves, failures = [], {}
    while "pending" in states:
        selected, blocked = [], {}
        for ci, controller in enumerate(controllers):
            if states[ci] != "pending":
                continue
            if len(selected) == config["scheduling"]["policy"]["maxParallelControllers"]:
                break
            pending = False
            for di, dependency in enumerate(edges):
                if not matches(controller, dependency, "after"):
                    continue
                before = [i for i, c in enumerate(controllers) if matches(c, dependency, "before")]
                if not before or any(states[i] == "blocked" for i in before):
                    blocked[ci] = ("dependency_unavailable" if not before else "dependency_blocked", di)
                    break
                pending |= any(states[i] == "pending" for i in before)
            if ci not in blocked and not pending:
                selected.append(ci)
        assert selected or blocked, "DAG must make progress"
        for ci in selected:
            states[ci] = "complete"
        for ci, failure in blocked.items():
            states[ci] = "blocked"
            failures[ci] = failure
        if selected:
            expected_waves.append(selected)
    # Reconstruct readiness from all earlier published waves instead of maintaining edge state.
    timed, total, wait = [], 0, 0
    for wi, wave in enumerate(expected_waves):
        start = total
        for dependency in edges:
            if any(matches(controllers[i], dependency, "after") for i in wave):
                before_ends = [timed[j][1] for j in range(wi)
                               if any(matches(controllers[i], dependency, "before") for i in expected_waves[j])]
                start = max(start, max(before_ends, default=0) + dependency["minimumGapPicoseconds"])
        wait += start - total
        total = start + WAVE
        timed.append((start, total))
    return states, failures, expected_waves, timed, total, wait


try:
    multi = copy.deepcopy(template)
    multi["scheduling"]["dependencies"] = [edge(bp=["p0"], ap=["p0"], gap=1000),
                                               edge(bp=["p1"], ap=["p1"], gap=2000)]
    multi["scheduling"]["resources"] = [dict(name="all", maxParallelControllers=8, clockDomains=list("abcd"))]
    timed, usage = chain("multi", multi, 34014)
    assert usage["usage"]["rows"][0]["occupiedPicoseconds"] == 32014
    mixed = copy.deepcopy(multi)
    mixed["scheduling"]["resources"][0].update(recoveryPicoseconds=5000,
        unavailableIntervals=[dict(startPicoseconds=21007, endPicoseconds=30000)])
    timed, usage = chain("mixed", mixed, 46007)
    assert timed["timeline"].get("dependencyWaitPicoseconds", 0) == 0
    assert timed["timeline"]["resourceWaitPicoseconds"] == 5000
    assert timed["timeline"]["availabilityWaitPicoseconds"] == 8993
    assert usage["usage"]["rows"][0]["occupiedPicoseconds"] == 32014
    partial = copy.deepcopy(multi)
    partial["timing"]["limits"] = dict(maxWork=6)
    chain("partial", partial, WAVE, False)

    # Standalone file and config use the same parser and original selector ordering.
    no_resource = copy.deepcopy(multi)
    no_resource["scheduling"].pop("resources")
    expected = invoke("manual-reference", no_resource)
    manual = [*base, "--test-max-controller-memories", "1", "--schedule-max-parallel", "8",
              "--schedule-max-power", "1000000", "--time-wave-overhead", "7"]
    for assignment in assignments:
        manual += ["--test-instance", *assignment.values()]
    for domain in "abcd":
        manual += ["--test-clock", domain, "1000"]
    dependency_file = file("dependencies.json", dict(formatVersion=1, kind="memory-schedule-dependencies",
                            dependencies=no_resource["scheduling"]["dependencies"]))
    same(expected, call([*manual, "--schedule-dependencies", dependency_file, "--require-complete"]))
    default = copy.deepcopy(template)
    default["scheduling"]["dependencies"] = [edge(gap=1000)]
    empty = invoke("empty", default)
    default["scheduling"]["dependencies"][0].pop("beforePartitions")
    default["scheduling"]["dependencies"][0].pop("afterPartitions")
    same(empty, invoke("omitted", default))
    assert "Partitions" not in json.dumps(empty)

    rng = random.Random(223)
    for sample in range(48):
        config = copy.deepcopy(template)
        config["scheduling"]["policy"]["maxParallelControllers"] = rng.randrange(1, 9)
        edges, unique = [], set()
        for _ in range(rng.randrange(1, 12)):
            before, after = sorted(rng.sample(list("abcd"), 2))
            bp = rng.choice([[], [""], ["p0"], ["p1"], ["p0", "p1"], ["missing"]])
            ap = rng.choice([[], ["p0"], ["p1"], ["p0", "p1"], ["missing"]])
            key = before, after, tuple(bp), tuple(ap)
            if key not in unique:
                edges.append(edge(before, after, bp, ap, rng.choice([0, 1000, 20000, 60000])))
                unique.add(key)
        config["scheduling"]["dependencies"] = edges
        states, failures, waves, times, duration, wait = reference(config)
        document = invoke(f"reference-{sample}", config, "blocked" not in states)
        schedule, timeline = document["source"]["schedule"], document["timeline"]
        assert [c["status"] for c in schedule["controllers"]] == states
        assert [[e["controller"] for e in w["entries"]] for w in schedule["waves"]] == waves
        for ci, (reason, di) in failures.items():
            assert schedule["controllers"][ci]["reason"] == reason
            assert schedule["controllers"][ci]["dependency"] == di
        assert [(w["startPicoseconds"], w["endPicoseconds"]) for w in timeline["waves"]] == times
        assert timeline["durationPicoseconds"] == duration
        assert timeline.get("dependencyWaitPicoseconds", 0) == wait
        references += 1

    absent = base.copy()
    absent[absent.index(str(ROOT / "tests/memory-test-schedule.sv"))] = "/absent-dependency-partitions.sv"
    invalid = []
    for field in ["beforePartitions", "afterPartitions"]:
        for value in [None, "p0", [0], ["p0", "p0"], ["a\0b"], ["x" * 4097], list(map(str, range(1025)))]:
            item = edge()
            item[field] = value
            invalid.append([item])
    invalid += [[edge(bp=["p1", "p0"]), edge(bp=["p0", "p1"], gap=1)],
                [edge("a", "a", ["p0"], ["p1"])],
                [edge("a", "b", ["p0"], ["p0"]), edge("b", "a", ["p1"], ["p1"])]]
    # Both sides and all edges share a 4096-name budget; equality remains valid.
    boundary = [edge("a", "b", list(map(str, range(1024))), list(map(str, range(1024)))),
                edge("c", "d", list(map(str, range(1024))), list(map(str, range(1024))))]
    boundary_config = copy.deepcopy(template)
    boundary_config["scheduling"]["dependencies"] = boundary
    invoke("4096-selectors", boundary_config)
    invalid.append([*boundary, edge("a", "c", ["extra"])])
    for index, edges in enumerate(invalid):
        config = copy.deepcopy(template)
        config["scheduling"]["dependencies"] = edges
        error = call([*absent, "--test-config", file(f"invalid-config-{index}.json", config)], 2)
        assert "absent-dependency-partitions" not in error["error"]["message"]
        spec = dict(formatVersion=1, kind="memory-schedule-dependencies", dependencies=edges)
        error = call([*absent, "--schedule-dependencies", file(f"invalid-file-{index}.json", spec)], 2)
        assert "absent-dependency-partitions" not in error["error"]["message"]
    summary = dict(calls=len(commands), sourceEquivalences=equivalences, schemaNegatives=negatives,
                   referenceCases=references, seed=223, out=str(OUT))
    file("summary.json", summary)
    print(json.dumps(summary))
except BaseException:
    print(json.dumps(dict(out=str(OUT), calls=len(commands))), file=sys.stderr)
    raise
