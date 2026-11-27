#include "../common/CliOutput.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
namespace fs = std::filesystem;
unsigned checks = 0, calls = 0;
int status = 0;
bool throws = false, streamFails = false, race = false;
fs::path target;
std::vector<std::string> expected;
const std::string report = "{\"report\":true}\n";
void need(bool value, const char *message) { ++checks; if (!value) throw std::runtime_error(message); }
std::string read(const fs::path &path) { std::ifstream in(path, std::ios::binary); return std::string(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()); }
int backend(int argc, char **argv) {
    ++calls;
    need(argc == static_cast<int>(expected.size()), "forwarded argc");
    for (int i = 0; i < argc; ++i) need(argv[i] == expected[static_cast<size_t>(i)], "forwarded argument bytes/order");
    need(argv[argc] == nullptr, "argv sentinel");
    if (throws) throw std::runtime_error("backend threw");
    std::cout << report;
    if (race) { std::ofstream out(target); out << "other writer"; }
    if (streamFails) std::cout.setstate(std::ios::badbit);
    return status;
}
struct Result { int exit; std::string console; };
Result invoke(std::vector<std::string> arguments, bool versioned = true) {
    std::vector<char *> argv;
    for (auto &arg : arguments) argv.push_back(arg.data());
    argv.push_back(nullptr);
    struct Capture {
        std::ostringstream console;
        std::streambuf *original = std::cout.rdbuf(console.rdbuf());
        ~Capture() { std::cout.rdbuf(original); }
    } capture;
    const int exit = dft::cli::withReportOutput(static_cast<int>(arguments.size()), argv.data(), backend, versioned);
    need(std::cout.rdbuf() == capture.console.rdbuf() && std::cout.good(), "cout restored after export");
    return {exit, capture.console.str()};
}
std::vector<std::string> args(const fs::path &path) { return {"tool", "--output", path.string(), "--", "arg", "space and 中文", "--text", "--output"}; }
struct Directory {
    fs::path path = fs::temp_directory_path() / ("cli-output-unit-" + std::to_string(std::random_device{}()));
    Directory() { if (!fs::create_directory(path)) throw std::runtime_error("fixture directory exists"); }
    ~Directory() { std::error_code ec; fs::remove_all(path, ec); }
};
}

int main() {
    try {
        Directory directory;
        expected = {"tool", "arg", "space and 中文", "--text", "--output"};
        for (const int code : {0, 1, 4}) {
            status = code; target = directory.path / ("result-" + std::to_string(code));
            const auto result = invoke(args(target));
            need(result.exit == code && result.console.empty(), "report exit and empty console");
            need(read(target) == report, "exact report bytes");
        }
        for (const int code : {2, 3, 5, 130, 7}) {
            status = code; target = directory.path / ("error-" + std::to_string(code));
            const auto result = invoke(args(target));
            need(result.exit == code && result.console == report, "backend error bytes and exit retained");
            need(!fs::exists(target), "backend error not published");
        }
        status = 0;
        for (const bool versioned : {false, true}) {
            target = directory.path / (versioned ? "race-v1" : "race-seq"); race = true;
            const auto result = invoke(args(target), versioned); race = false;
            need(result.exit == 5 && result.console.find("output_failed") != std::string::npos, "publish collision rejects");
            need((result.console.find("formatVersion") != std::string::npos) == versioned, "original error envelope");
            need(read(target) == "other writer", "publish collision never replaces target");
        }
        for (const bool failStream : {false, true}) {
            target = directory.path / (failStream ? "stream-failed" : "exception");
            streamFails = failStream; throws = !failStream;
            const auto result = invoke(args(target)); throws = false; streamFails = false;
            need(result.exit == 5 && result.console.find("output_failed") != std::string::npos && !fs::exists(target), "write/exception no partial file");
        }
        const auto previousCalls = calls;
        for (const auto &path : {directory.path / "result-0", directory.path, directory.path / "absent" / "file", directory.path / "result-0" / "file"})
            need(invoke(args(path)).exit == 5, "existing or invalid parent rejected");
        const auto link = directory.path / "link";
        fs::create_symlink(directory.path / "missing", link);
        need(invoke(args(link)).exit == 5 && fs::is_symlink(link), "dangling symlink not replaced");
        const auto linked = directory.path / "linked";
        fs::create_symlink(directory.path / "result-0", linked);
        need(invoke(args(linked)).exit == 5 && read(directory.path / "result-0") == report, "existing input alias protected");
        for (auto arguments : {std::vector<std::string>{"tool", "--output"}, {"tool", "--output", "", "--", "arg"}, {"tool", "--output", ".", "--", "arg"}, {"tool", "--output", "file", "arg"}, {"tool", "--output", "file", "--", "--version"}, {"tool", "--output", "file", "--", "--help"}, {"tool", "--output", std::string(1, static_cast<char>(0xff)), "--", "arg"}})
            need(invoke(std::move(arguments)).exit == 2, "prefix/path syntax rejected");
        need(calls == previousCalls, "invalid output rejected before backend");
        expected = {"tool", "--text", "--output"};
        need(invoke(expected).console == report, "literal old parameter untouched");
        for (const auto &entry : fs::directory_iterator(directory.path))
            need(!entry.path().filename().string().starts_with(".dft-report-"), "temporary directory cleaned");
        std::cout << checks << " CLI output assertions passed\n";
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
