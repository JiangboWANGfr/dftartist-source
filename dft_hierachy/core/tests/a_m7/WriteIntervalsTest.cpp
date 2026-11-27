#include "WriteIntervals.h"
#include <catch2/catch_test_macros.hpp>
#include <limits>

using hier::frontend::detail::Dependencies;
using hier::frontend::detail::WriteIntervals;
using hier::model::Dep;
using DenseWrites = std::map<std::pair<std::string, uint64_t>, Dependencies>;

TEST_CASE("write intervals match the original per-bit union and overwrite semantics", "[a-m7]") {
    WriteIntervals actual;
    DenseWrites expected;
    uint64_t random = 159357;
    auto next = [&] {
        random = random * 6364136223846793005ULL + 1442695040888963407ULL;
        return random >> 32;
    };
    auto merge = [](Dependencies &dest, const Dependencies &source) {
        for (const auto &dep : source)
            if (std::none_of(dest.begin(), dest.end(), [&](const auto &old) { return dep == old; }))
                dest.push_back(dep);
    };
    for (size_t step = 0; step < 5000; ++step) {
        const auto ref = "s::" + std::to_string(next() % 3);
        const auto start = next() % 64;
        const auto width = next() % (65 - start);
        const auto operation = next() % 3;
        Dependencies deps;
        for (size_t i = 0, count = size_t(next() % 3); i < count; ++i)
            deps.push_back({"s::" + std::to_string(next() % 5),
                            {next() % 16, operation == 0 ? 1 + next() % 8 : 1},
                            next() % 2 ? "data" : "control", "exact",
                            operation == 0 ? "all" : "bitwise"});
        if (operation == 0) {
            actual.addUniform(ref, {start, width}, deps);
            for (uint64_t bit = start; bit < start + width; ++bit)
                merge(expected[{ref, bit}], deps);
        } else if (operation == 1) {
            hier::frontend::detail::appendDependencies(actual.bit(ref, start), deps);
            merge(expected[{ref, start}], deps);
        } else {
            actual.bit(ref, start) = deps;
            expected[{ref, start}] = deps;
        }
        DenseWrites expanded;
        bool disjoint = true;
        for (const auto &[key, span] : actual.entries()) {
            REQUIRE(span.end > key.second);
            REQUIRE(span.end <= 64);
            for (uint64_t bit = key.second; bit < span.end; ++bit)
                disjoint &= expanded.emplace(std::pair{key.first, bit}, span.deps).second;
        }
        CHECK(disjoint);
        CHECK(expanded == expected);
    }
}

TEST_CASE("uniform writes retain empty writes and scale by interval boundaries", "[a-m7]") {
    WriteIntervals writes;
    const uint64_t width = 1ULL << 50;
    writes.addUniform("s::0", {8, 0}, {});
    CHECK(writes.entries().empty());
    writes.addUniform("s::0", {8, width}, {});
    REQUIRE(writes.entries().size() == 1);
    CHECK(writes.entries().begin()->second.deps.empty());
    const Dependencies dependencies{{"s::1", {0, 32}, "data", "conservative", "all"}};
    for (size_t i = 0; i < 100; ++i)
        writes.addUniform("s::0", {8, width}, dependencies);
    REQUIRE(writes.entries().size() == 1);
    CHECK(writes.entries().begin()->second.deps == dependencies);
    CHECK(writes.entries().begin()->second.end == 8 + width);

    const auto middle = 8 + width / 2;
    writes.bit("s::0", middle) = {{"s::2", {3, 1}, "data", "exact", "bitwise"}};
    REQUIRE(writes.entries().size() == 3);
    writes.addUniform("s::0", {8, width}, dependencies);
    CHECK(writes.entries().size() == 3);
    CHECK(writes.entries().at({"s::0", middle}).deps.size() == 2);
    CHECK(writes.entries().at({"s::0", middle}).end == middle + 1);
    writes.clear();
    CHECK(writes.entries().empty());
}

TEST_CASE("write interval splitting preserves other objects and validates boundaries", "[a-m7]") {
    WriteIntervals writes;
    writes.addUniform("s::1", {2, 4}, {});
    writes.addUniform("s::0", {0, 1}, {});
    writes.addUniform("s::2", {8, 2}, {});
    writes.addUniform("s::1", {0, 8}, {});
    CHECK(writes.entries().size() == 5);
    CHECK(writes.entries().at({"s::1", 0}).end == 2);
    CHECK(writes.entries().at({"s::1", 2}).end == 6);
    CHECK(writes.entries().at({"s::1", 6}).end == 8);
    const auto maximum = std::numeric_limits<uint64_t>::max();
    writes.addUniform("s::3", {maximum - 2, 2}, {});
    CHECK(writes.entries().at({"s::3", maximum - 2}).end == maximum);
    CHECK_THROWS_AS(writes.bit("s::3", maximum), std::overflow_error);
    CHECK_THROWS_AS(writes.addUniform("s::3", {maximum, 1}, {}), std::overflow_error);
    CHECK_THROWS_AS(writes.addUniform("s::4", {0, 2},
                                    {{"s::0", {0, 1}, "data", "exact", "bitwise"}}),
                    std::logic_error);
    CHECK(writes.entries().size() == 6);
}

TEST_CASE("bulk writes match ordered per-bit replacement and access union", "[a-m7]") {
    WriteIntervals actual;
    DenseWrites expected;
    uint64_t random = 763931;
    auto next = [&] {
        random = random * 6364136223846793005ULL + 1442695040888963407ULL;
        return random >> 32;
    };
    const Dep all{"s::data", {2, 9}, "data", "conservative", "all"};
    const Dep bitwise{"s::data", {7, 1}, "data", "exact", "bitwise"};
    const Dep condition{"s::control", {0, 3}, "control", "exact", "all"};
    for (size_t step = 0; step < 4000; ++step) {
        const auto ref = "s::" + std::to_string(next() % 3);
        const auto start = next() % 32;
        const auto width = next() % 17;
        const bool replace = next() % 2;
        std::vector<Dependencies> data(size_t(next() % 20));
        for (size_t i = 0; i < data.size(); ++i) {
            const auto kind = next() % 5;
            if (kind == 1 || kind == 2)
                data[i] = {all};
            else if (kind == 3)
                data[i] = {bitwise};
            else if (kind == 4)
                data[i] = {all, all};
        }
        const Dependencies control = next() % 3 ? Dependencies{condition} : Dependencies{};
        if (replace)
            actual.assignBits(ref, {start, width}, data);
        else
            actual.addBits(ref, {start, width}, data, control);
        for (uint64_t i = 0; i < width; ++i) {
            auto &dest = expected[{ref, start + i}];
            const auto source = i < data.size() ? data[size_t(i)] : Dependencies{};
            if (replace)
                dest = source;
            else {
                for (const auto &dep : source)
                    if (std::find(dest.begin(), dest.end(), dep) == dest.end())
                        dest.push_back(dep);
                for (const auto &dep : control)
                    if (std::find(dest.begin(), dest.end(), dep) == dest.end())
                        dest.push_back(dep);
            }
        }
        DenseWrites expanded;
        for (const auto &[key, span] : actual.entries()) {
            REQUIRE(span.end > key.second);
            REQUIRE(span.end <= 48);
            for (uint64_t i = key.second; i < span.end; ++i)
                REQUIRE(expanded.emplace(std::pair{key.first, i}, span.deps).second);
        }
        CHECK(expanded == expected);
    }
}

TEST_CASE("bulk constant runs and missing tails keep interval sized storage", "[a-m7]") {
    WriteIntervals writes;
    const uint64_t width = 1ULL << 50;
    const Dependencies all{{"s::data", {0, 16}, "data", "conservative", "all"}};
    const Dependencies control{{"s::en", {0, 1}, "control", "exact", "all"}};
    std::vector<Dependencies> data(4096, all);
    writes.assignBits("s::0", {8, width}, data);
    REQUIRE(writes.entries().size() == 2);
    CHECK(writes.entries().at({"s::0", 8}).deps == all);
    CHECK(writes.entries().at({"s::0", 4104}).end == width + 8);
    CHECK(writes.entries().at({"s::0", 4104}).deps.empty());
    writes.addBits("s::0", {8, width}, {}, control);
    REQUIRE(writes.entries().size() == 2);
    CHECK(writes.entries().at({"s::0", 8}).deps.size() == 2);
    CHECK(writes.entries().at({"s::0", 4104}).deps == control);
    writes.assignBits("s::0", {10, width - 4}, {});
    REQUIRE(writes.entries().size() == 3);
    CHECK(writes.entries().at({"s::0", 10}).deps.empty());
    CHECK(writes.entries().at({"s::0", width + 6}).deps == control);
    writes.assignBits("s::0", {0, 0}, data);
    writes.addBits("s::0", {0, 0}, data, control);
    CHECK(writes.entries().size() == 3);
    const auto maximum = std::numeric_limits<uint64_t>::max();
    CHECK_THROWS_AS(writes.assignBits("s::0", {maximum, 1}, {}), std::overflow_error);
    CHECK_THROWS_AS(writes.addBits("s::0", {maximum, 1}, {}, control), std::overflow_error);
}

static DenseWrites expandMappedWrites(const WriteIntervals &writes) {
    DenseWrites expanded;
    for (const auto &[key, span] : writes.entries()) {
        REQUIRE(span.end > key.second);
        REQUIRE(span.end <= 48);
        for (uint64_t bit = key.second; bit < span.end; ++bit) {
            auto deps = span.deps;
            for (auto &dep : deps)
                if (dep.align == "bitwise") {
                    REQUIRE(dep.bits.width == span.end - key.second);
                    dep.bits.lsb += bit - key.second;
                    dep.bits.width = 1;
                }
            REQUIRE(expanded.emplace(std::pair{key.first, bit}, std::move(deps)).second);
        }
    }
    return expanded;
}

TEST_CASE("linear mapped intervals match the independent ordered bit model", "[a-m7]") {
    WriteIntervals actual;
    DenseWrites expected;
    uint64_t random = 35497;
    auto next = [&] {
        random = random * 6364136223846793005ULL + 1442695040888963407ULL;
        return random >> 32;
    };
    auto merge = [](Dependencies &dest, const Dependencies &source) {
        for (const auto &dep : source)
            if (std::none_of(dest.begin(), dest.end(), [&](const auto &old) { return old == dep; }))
                dest.push_back(dep);
    };
    const Dep condition{"s::enable", {0, 2}, "control", "exact", "all"};
    for (size_t step = 0; step < 3000; ++step) {
        const auto ref = "s::" + std::to_string(next() % 3);
        const auto start = next() % 32, width = next() % 17;
        const auto operation = next() % 4;
        const auto base = next() % 100, shape = next() % 4;
        std::vector<Dependencies> data(size_t(next() % 20));
        for (size_t i = 0; i < data.size(); ++i) {
            const auto offset = shape == 0 ? i : shape == 1 ? i % 4 : 0;
            data[i] = {{"s::a", {base + offset, 1}, "data", "exact", "bitwise"}, condition};
            if (shape == 2)
                data[i].push_back({"s::b", {base + i, 1}, "data", "exact", "bitwise"});
            if (shape == 3 && i % 3 == 0)
                data[i].clear();
            if (step % 5 == 0)
                data[i].push_back(condition);
        }
        const Dependencies control = step % 7 ? Dependencies{condition}
            : Dependencies{{"s::control-bit", {3, 1}, "control", "exact", "bitwise"}};
        if (operation == 0)
            actual.assignBits(ref, {start, width}, data);
        else if (operation == 1)
            actual.addBits(ref, {start, width}, data, control);
        else if (operation == 2)
            actual.addUniform(ref, {start, width}, {condition});
        else
            actual.bit(ref, start) = data.empty() ? Dependencies{} : data.front();
        const auto count = operation == 3 ? 1 : width;
        for (uint64_t i = 0; i < count; ++i) {
            auto &dest = expected[{ref, start + i}];
            const auto source = i < data.size() ? data[size_t(i)] : Dependencies{};
            if (operation == 0 || operation == 3)
                dest = source;
            else if (operation == 1) {
                merge(dest, source);
                merge(dest, control);
            } else {
                merge(dest, {condition});
            }
        }
        CHECK(expandMappedWrites(actual) == expected);
    }
}

TEST_CASE("linear writes split source coordinates and reject nonlinear runs", "[a-m7]") {
    WriteIntervals writes;
    std::vector<Dependencies> data(8192);
    for (size_t i = 0; i < data.size(); ++i)
        data[i] = {{"s::a", {20 + i, 1}, "data", "exact", "bitwise"}};
    writes.assignBits("s::0", {100, data.size()}, data);
    REQUIRE(writes.entries().size() == 1);
    CHECK(writes.entries().at({"s::0", 100}).deps[0].bits == hier::model::BitRange{20, 8192});
    auto &middle = writes.bit("s::0", 2000);
    CHECK(middle[0].bits == hier::model::BitRange{1920, 1});
    middle = {{"s::other", {4, 1}, "data", "exact", "bitwise"}};
    REQUIRE(writes.entries().size() == 3);
    writes.addUniform("s::0", {500, 4096}, {{"s::en", {0, 1}, "control", "exact", "all"}});
    REQUIRE(writes.entries().size() == 5);
    CHECK(writes.entries().at({"s::0", 500}).deps[0].bits == hier::model::BitRange{420, 1500});
    CHECK(writes.entries().at({"s::0", 4596}).deps[0].bits == hier::model::BitRange{4516, 3696});
    writes.assignBits("s::0", {700, 20}, std::span<const Dependencies>(data).subspan(30, 20));
    CHECK(writes.entries().at({"s::0", 700}).deps[0].bits == hier::model::BitRange{50, 20});
    CHECK(writes.entries().at({"s::0", 720}).deps[0].bits == hier::model::BitRange{640, 1280});

    writes.clear();
    writes.assignBits("s::sign", {0, 32}, std::vector<Dependencies>(32, data[0]));
    CHECK(writes.entries().size() == 32);
    writes.clear();
    const auto maximum = std::numeric_limits<uint64_t>::max();
    std::vector<Dependencies> edge{{{"s::a", {maximum - 1, 1}, "data", "exact", "bitwise"}},
                                   {{"s::a", {maximum, 1}, "data", "exact", "bitwise"}}};
    writes.assignBits("s::edge", {2, 2}, edge);
    REQUIRE(writes.entries().size() == 1);
    CHECK(writes.bit("s::edge", 3)[0].bits == hier::model::BitRange{maximum, 1});
    writes.clear();
    edge[0][0].bits.lsb = maximum;
    edge[1][0].bits.lsb = 0;
    writes.assignBits("s::wrap", {0, 2}, edge);
    CHECK(writes.entries().size() == 2);
}
