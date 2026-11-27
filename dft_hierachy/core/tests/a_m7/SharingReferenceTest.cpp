#include "SharingReference.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <algorithm>
#include <cerrno>
#include <fcntl.h>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <unistd.h>

using namespace hier;
using app::SharingReference;
using Catch::Matchers::ContainsSubstring;

namespace {
struct Source {
    std::string path;
    explicit Source(std::string_view contents) {
        auto pattern = (std::filesystem::temp_directory_path() / "hier-sharing-XXXXXX").string();
        const int fd = ::mkstemp(pattern.data());
        if (fd < 0)
            throw std::runtime_error("cannot create test input");
        ::close(fd);
        path = std::move(pattern);
        try {
            write(contents);
        } catch (...) {
            std::remove(path.c_str());
            throw;
        }
    }
    ~Source() { std::remove(path.c_str()); }
    void write(std::string_view contents) {
        std::ofstream stream(path, std::ios::binary | std::ios::trunc);
        stream << contents;
        if (!stream)
            throw std::runtime_error("cannot write test input");
    }
    std::unique_ptr<Design> open(bool separate = false) const {
        model::OpenOptions options;
        options.files = {path};
        options.forcePerInstanceBodies = separate;
        auto result = Design::open(options);
        if (!result || result.value()->diagnostics(1).errorCount)
            throw std::runtime_error("test design did not compile");
        return std::move(result.value());
    }
};
SharingReference::File temporary() { return {std::tmpfile(), &std::fclose}; }
std::string output(std::FILE *file) {
    std::rewind(file);
    std::string value;
    char buffer[1024];
    while (const auto count = std::fread(buffer, 1, sizeof(buffer), file))
        value.append(buffer, count);
    return value;
}
} // namespace

TEST_CASE("sharing reference outlives the first design and resumes recursive pages", "[a-m7]") {
    Source source("module leaf; endmodule\nmodule branch; leaf child(); endmodule\n"
                  "module top; branch u[1200:0](); endmodule\n");
    SharingReference reference(temporary());
    {
        const auto shared = source.open();
        reference.capture(*shared);
        CHECK(reference.bodyCount() == 3);
    }
    const auto separate = source.open(true);
    CHECK(reference.sameInputs(*separate));
    CHECK(reference.sameRoots(separate->roots()));
    auto log = temporary();
    const auto result = reference.compare(*separate, log.get());
    CHECK(result.compared == 2403);
    CHECK(result.different == 0);
    CHECK(result.failedQueries == 0);
    CHECK(output(log.get()).empty());
}

TEST_CASE("sharing reference compares exact fields and never drops failed process queries", "[a-m7]") {
    struct Case {
        std::string a, b, field;
        size_t compared, different, failed;
    };
    const std::vector<Case> cases = {
        {"module t(input wire a,output wire y); wire left; assign y=a; endmodule",
         "module t(input wire a,output wire y); wire right; assign y=a; endmodule",
         "signals", 1, 1, 0},
        {"module t#(parameter P=1); endmodule", "module t#(parameter P=2); endmodule",
         "parameters", 1, 1, 0},
        {"module t(input wire a); endmodule", "module t(input wire [1:0] a); endmodule",
         "ports", 1, 1, 0},
        {"module t; endmodule", "module leaf; endmodule module t; leaf u(); endmodule",
         "instance", 1, 1, 0},
        {"module a; endmodule module b; endmodule module t; a u(); b v(); endmodule",
         "module a; endmodule module b; endmodule module t; b u(); a v(); endmodule",
         "children", 1, 1, 0},
        {"module t(input wire a,output wire y,z); assign y=a; assign z=~a; endmodule",
         "module t(input wire a,output wire y,z); assign y=a; endmodule",
         "processes", 1, 1, 1},
        {"module leaf(input wire a,output wire y); assign y=a; endmodule "
         "module t(input wire a,b,output wire y); leaf u(.a(a),.y(y)); endmodule",
         "module leaf(input wire a,output wire y); assign y=a; endmodule "
         "module t(input wire a,b,output wire y); leaf u(.a(b),.y(y)); endmodule",
         "bindings", 2, 1, 0},
        {"module t(input wire clk,a,output logic q); always_ff @(posedge clk) q<=a; endmodule",
         "module t(input wire clk,a,output logic q); always_comb q=a; endmodule",
         "registers", 1, 3, 0}};
    for (const auto &test : cases) {
        DYNAMIC_SECTION(test.field) {
            Source a(test.a), b(test.b);
            SharingReference reference(temporary());
            {
                const auto shared = a.open();
                reference.capture(*shared);
            }
            const auto separate = b.open(true);
            if (test.field == "children")
                REQUIRE(reference.sameRoots(separate->roots()));
            auto log = temporary();
            const auto result = reference.compare(*separate, log.get());
            CHECK(result.compared == test.compared);
            CHECK(result.different == test.different);
            CHECK(result.failedQueries == test.failed);
            const auto messages = output(log.get());
            CHECK_THAT(messages, ContainsSubstring("DIFFERENT " + test.field));
            if (test.failed)
                CHECK_THAT(messages, ContainsSubstring("QUERY FAILED process facts"));
        }
    }
}

TEST_CASE("sharing reference retains every difference after the diagnostic display cap", "[a-m7]") {
    std::string a = "module t(input wire a,output wire [29:0] y);\n", b = a;
    for (size_t i = 0; i < 30; ++i) {
        a += "assign y[" + std::to_string(i) + "]=a;\n";
        b += "assign y[" + std::to_string(i) + "]=~a;\n";
    }
    Source left(a + "endmodule"), right(b + "endmodule");
    SharingReference reference(temporary());
    {
        const auto shared = left.open();
        reference.capture(*shared);
    }
    const auto separate = right.open(true);
    auto log = temporary();
    const auto result = reference.compare(*separate, log.get());
    CHECK(result.compared == 1);
    CHECK(result.different == 30);
    CHECK(result.failedQueries == 0);
    const auto messages = output(log.get());
    CHECK(std::count(messages.begin(), messages.end(), '\n') == 20);
}

TEST_CASE("sharing reference detects captured input changes without promising completeness", "[a-m7]") {
    Source source("module t; endmodule");
    SharingReference reference(temporary());
    {
        const auto shared = source.open();
        reference.capture(*shared);
    }
    source.write("module t; /* changed bytes, same facts */ endmodule");
    const auto changed = source.open(true);
    CHECK_FALSE(reference.sameInputs(*changed));
    CHECK(reference.sameRoots(changed->roots()));
    auto log = temporary();
    CHECK(reference.compare(*changed, log.get()).different == 0);
}

TEST_CASE("sharing reference fails closed on unavailable or truncated storage", "[a-m7]") {
    Source source("module t; endmodule");
    const auto shared = source.open();
    CHECK_THROWS_WITH(SharingReference(SharingReference::File(nullptr, &std::fclose)),
                      ContainsSubstring("comparison reference create"));
    SharingReference readOnly(SharingReference::File(std::fopen(source.path.c_str(), "rb"),
                                                     &std::fclose));
    CHECK_THROWS_WITH(readOnly.capture(*shared), ContainsSubstring("comparison reference write"));

    auto file = temporary();
    auto *borrowed = file.get();
    SharingReference reference(std::move(file));
    reference.capture(*shared);
    REQUIRE(::ftruncate(::fileno(borrowed), 0) == 0);
    auto log = temporary();
    CHECK_THROWS_WITH(reference.compare(*shared, log.get()), ContainsSubstring("comparison reference read"));
    CHECK(output(log.get()).empty());
    CHECK_THROWS_WITH(reference.compare(*shared, nullptr), ContainsSubstring("diagnostics stream"));
}

TEST_CASE("sharing reference releases its temporary descriptor on exceptional exit", "[a-m7]") {
    int descriptor = -1;
    try {
        auto file = temporary();
        REQUIRE(file);
        descriptor = ::fileno(file.get());
        SharingReference reference(std::move(file));
        throw std::runtime_error("abort comparison");
    } catch (const std::runtime_error &) {
        const int result = ::fcntl(descriptor, F_GETFD);
        const int error = errno;
        CHECK(result == -1);
        CHECK(error == EBADF);
    }
}

namespace {
std::string largeSignals(size_t changed = 4000, bool longer = false) {
    std::string source = "module t;\n";
    for (size_t i = 0; i < 4000; ++i)
        source += "logic signal_" + std::to_string(i) + "_" + std::string(64, 'a') +
                  (i == changed ? longer ? "zz" : "z" : "a") + ";\n";
    return source + "endmodule\n";
}
} // namespace

TEST_CASE("sharing reference compares long records and all differing positions and lengths", "[a-m7]") {
    Source source(largeSignals());
    SharingReference reference(temporary());
    {
        const auto shared = source.open();
        PageRequest all;
        all.limit = 1000000000;
        const auto signals = shared->signals("i:0", all);
        REQUIRE(signals);
        protocol::JsonWriter writer;
        protocol::write(writer, signals.value());
        REQUIRE(writer.str().size() > 4 * 64 * 1024);
        reference.capture(*shared);
    }
    for (const size_t changed : {size_t(4000), size_t(0), size_t(2000), size_t(3999)}) {
        DYNAMIC_SECTION(changed) {
            source.write(largeSignals(changed));
            const auto separate = source.open(true);
            auto log = temporary();
            const auto result = reference.compare(*separate, log.get());
            CHECK(result.compared == 1);
            CHECK(result.different == (changed == 4000 ? 0 : 1));
            CHECK(result.failedQueries == 0);
            CHECK(output(log.get()) == (changed == 4000 ? "" : "DIFFERENT signals of i:0 (t)\n"));
        }
    }
    source.write(largeSignals(2000, true));
    const auto separate = source.open(true);
    auto log = temporary();
    const auto result = reference.compare(*separate, log.get());
    CHECK(result.different == 1);
    CHECK(result.failedQueries == 0);
    CHECK(output(log.get()) == "DIFFERENT signals of i:0 (t)\n");
}

TEST_CASE("sharing reference still detects truncation after an early long-record mismatch", "[a-m7]") {
    Source source(largeSignals());
    const auto design = source.open();
    auto file = temporary();
    auto *borrowed = file.get();
    SharingReference reference(std::move(file));
    reference.capture(*design);
    const auto original = output(borrowed);
    const auto firstName = original.find("signal_0_");
    REQUIRE(firstName != std::string::npos);
    REQUIRE(firstName + 2 * 64 * 1024 < original.size());
    REQUIRE(std::fseek(borrowed, long(firstName), SEEK_SET) == 0);
    REQUIRE(std::fputc('X', borrowed) != EOF);
    REQUIRE(std::fflush(borrowed) == 0);
    REQUIRE(::ftruncate(::fileno(borrowed), off_t(firstName + 64 * 1024 + 17)) == 0);
    auto log = temporary();
    CHECK_THROWS_WITH(reference.compare(*design, log.get()), ContainsSubstring("comparison reference read"));
    CHECK(output(log.get()).empty());
}
