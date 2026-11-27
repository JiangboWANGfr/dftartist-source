"""Record method-level availability separately from assertion failures.

No expected failure, skip, product mocks or reply caching. stdout is JSON evidence;
the exit code remains nonzero if any selected test fails.
"""
import json
import sys
import traceback
import unittest


class Evidence(unittest.TestResult):
    def __init__(self):
        super().__init__()
        self.methods = {}

    def startTest(self, test):
        super().startTest(test)
        self.methods[test.id()] = {"status": "passed", "events": []}

    def event(self, test, error):
        kind, value, _ = error
        detail = "".join(traceback.format_exception(*error))
        if "COMMAND_FAILURE:" in str(value) and any(
                marker in str(value).lower() for marker in ("unknown command", "unknown option")):
            category = "entry_not_implemented"
        elif kind is KeyError:
            category = "required_field_missing"
        elif issubclass(kind, AssertionError):
            category = "assertion_failure"
        else:
            category = "unexpected_exception"
        self.methods[test.id()]["status"] = "failed"
        self.methods[test.id()]["events"].append({"category": category, "detail": detail})

    def addFailure(self, test, error):
        super().addFailure(test, error)
        self.event(test, error)

    def addError(self, test, error):
        super().addError(test, error)
        self.event(test, error)

    def addSubTest(self, test, subtest, error):
        super().addSubTest(test, subtest, error)
        if error:
            self.event(test, error)


if __name__ == "__main__":
    suites = sys.argv[1:] or ["test_" + n for n in ("inputs", "expr", "step", "trace", "lookup", "source", "errors")]
    suite = unittest.defaultTestLoader.loadTestsFromNames(suites)
    result = Evidence()
    suite.run(result)
    print(json.dumps({"testsRun": result.testsRun, "skipped": len(result.skipped),
                      "methods": result.methods}, ensure_ascii=False, indent=2))
    sys.exit(0 if result.wasSuccessful() else 1)
