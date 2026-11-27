#include "model.h"

namespace sdc {

const char* severityName(Severity s) {
    switch (s) {
        case Severity::Error:   return "error";
        case Severity::Warning: return "warning";
        case Severity::Info:    return "info";
    }
    return "info";
}

int LintReport::count(Severity s) const {
    int n = 0;
    for (const Finding& f : findings)
        if (f.severity == s) ++n;
    return n;
}

}  // namespace sdc
