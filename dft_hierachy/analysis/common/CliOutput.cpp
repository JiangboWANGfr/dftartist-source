#include "CliOutput.h"
#include "Utf8.h"
#include "hier/protocol/Json.h"
#include <array>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <random>
#include <string>
#include <vector>

namespace dft::cli {
namespace {
namespace fs = std::filesystem;
struct Failure { const char *code; const char *message; int exit; };
[[noreturn]] void failed(const char *message) { throw Failure{"output_failed", message, 5}; }
[[noreturn]] void bad(const char *message) { throw Failure{"invalid_arguments", message, 2}; }

int error(const Failure &failure, bool versioned) {
    hier::protocol::JsonWriter writer;
    writer.beginObject();
    if (versioned) writer.key("formatVersion").value(1);
    writer.key("error").beginObject().key("code").value(failure.code)
        .key("message").value(failure.message).endObject().endObject();
    std::cout << writer.str() << '\n';
    std::cout.flush();
    return failure.exit;
}

class TemporaryReport {
public:
    explicit TemporaryReport(const fs::path &parent) {
        std::random_device random;
        for (unsigned i = 0; i < 32; ++i) {
            const auto token = (static_cast<std::uint64_t>(random()) << 32) | random();
            auto candidate = parent / (".dft-report-" + std::to_string(token) + "-" + std::to_string(i));
            std::error_code ec;
            if (fs::create_directory(candidate, ec)) { directory_.swap(candidate); break; }
            if (ec && ec != std::errc::file_exists) failed("Could not create report staging directory");
        }
        if (directory_.empty()) failed("Could not create unique report staging directory");
        try {
            std::error_code ec;
            fs::permissions(directory_, fs::perms::owner_all, fs::perm_options::replace, ec);
            if (ec) failed("Could not protect report staging directory");
            file_ = directory_ / "report";
            stream.open(file_, std::ios::binary | std::ios::out);
            if (!stream) failed("Could not open report staging file");
        } catch (...) { cleanup(); throw; }
    }
    TemporaryReport(const TemporaryReport &) = delete;
    TemporaryReport &operator=(const TemporaryReport &) = delete;
    ~TemporaryReport() { cleanup(); }
    const fs::path &file() const { return file_; }
    std::ofstream stream;
private:
    void cleanup() noexcept {
        try {
            if (stream.is_open()) stream.close();
            std::error_code ec;
            if (!file_.empty()) fs::remove(file_, ec);
            if (!directory_.empty()) fs::remove(directory_, ec);
        } catch (...) { /* Destruction never replaces the original failure. */ }
    }
    fs::path directory_, file_;
};

class Redirect {
public:
    explicit Redirect(std::streambuf *destination) : previous_(std::cout.rdbuf()), state_(std::cout.rdstate()), exceptions_(std::cout.exceptions()) {
        std::cout.rdbuf(destination);
    }
    Redirect(const Redirect &) = delete;
    Redirect &operator=(const Redirect &) = delete;
    ~Redirect() {
        try {
            std::cout.exceptions(std::ios::goodbit);
            std::cout.rdbuf(previous_);
            std::cout.clear(state_);
            std::cout.exceptions(exceptions_);
        } catch (...) { /* The original stream buffer is restored even if its exception mask rejects its saved state. */ }
    }
private:
    std::streambuf *previous_; // Borrowed process stream buffer, restored before temporary file destruction.
    std::ios::iostate state_, exceptions_;
};

fs::path destination(const std::string &text) {
    if (text.empty() || !dft::detail::validUtf8(text) || text.find('\0') != std::string::npos)
        bad("Output needs a nonempty UTF-8 file path");
    std::u8string pathText;
    pathText.reserve(text.size());
    for (const auto byte : text) pathText.push_back(static_cast<char8_t>(static_cast<unsigned char>(byte)));
    const fs::path input(pathText);
    if (input.filename().empty() || input.filename() == "." || input.filename() == "..")
        bad("Output needs a file name");
    std::error_code ec;
    const auto parent = fs::canonical(input.has_parent_path() ? input.parent_path() : fs::path("."), ec);
    if (ec || !fs::is_directory(parent, ec) || ec) failed("Output parent must be an existing directory");
    const auto output = parent / input.filename();
    const auto status = fs::symlink_status(output, ec);
    if (ec && ec != std::errc::no_such_file_or_directory) failed("Could not inspect output destination");
    if (status.type() != fs::file_type::not_found) failed("Output destination already exists");
    return output;
}
}

int withReportOutput(int argc, char **argv, Main main, bool versionedErrors) {
    if (argc < 2 || std::string_view(argv[1]) != "--output") {
        const int result = main(argc, argv);
        if (result == 0 && argc == 2 && std::string_view(argv[1]) == "--help")
            std::cout << "  Export: --output FILE -- ORIGINAL_ARGS (new file only; preserves report exit code)\n";
        return result;
    }
    try {
        if (argc < 5 || std::string_view(argv[3]) != "--") bad("Use --output FILE -- ORIGINAL_ARGS as the command prefix");
        if (argc == 5 && (std::string_view(argv[4]) == "--help" || std::string_view(argv[4]) == "--version"))
            bad("Help and version are console commands, not report exports");
        const auto output = destination(argv[2]);
        TemporaryReport temporary(output.parent_path());
        std::vector<char *> arguments{argv[0]};
        for (int i = 4; i < argc; ++i) arguments.push_back(argv[i]);
        arguments.push_back(nullptr);
        int result;
        bool written;
        {
            Redirect redirect(temporary.stream.rdbuf());
            result = main(argc - 3, arguments.data());
            std::cout.flush();
            written = std::cout.good();
        }
        temporary.stream.flush();
        written = written && temporary.stream.good();
        temporary.stream.close();
        if (!written || temporary.stream.fail()) failed("Could not write report output");
        if (result == 0 || result == 1 || result == 4) {
            std::error_code ec;
            fs::create_hard_link(temporary.file(), output, ec);
            if (ec) failed("Could not publish report without replacing an existing file");
        } else {
            std::ifstream input(temporary.file(), std::ios::binary);
            if (!input) failed("Could not read backend error output");
            std::array<char, 4096> buffer{};
            while (input.read(buffer.data(), static_cast<std::streamsize>(buffer.size())) || input.gcount() != 0)
                std::cout.write(buffer.data(), input.gcount());
            std::cout.flush();
            if (!input.eof() || !std::cout) failed("Could not forward backend error output");
        }
        return result;
    } catch (const Failure &failure) {
        return error(failure, versionedErrors);
    } catch (const std::exception &) {
        return error({"output_failed", "Report export failed", 5}, versionedErrors);
    }
}
}
