#pragma once

namespace dft::cli {
// Private CLI boundary. Main and argv are borrowed only for this synchronous call.
using Main = int (*)(int, char **);
int withReportOutput(int argc, char **argv, Main main, bool versionedErrors);
}
