#include "Connectivity.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <array>

using namespace hier;
namespace {
model::OpenOptions options() {
    model::OpenOptions result;
    result.files = {HIER_PORT_WINDOW_FIXTURE};
    result.tops = {"segment_top"};
    return result;
}
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}

// A-owned malformed/repeated fact checks through the existing private query
// boundary. Real HDL supplies the unchanged topology and public object validator.
struct RepeatedBinding final : frontend::Frontend {
    std::unique_ptr<frontend::Frontend> source;
    bool missingWidth = false;
    std::stop_source *interrupt = nullptr;
    explicit RepeatedBinding(std::unique_ptr<frontend::Frontend> value) : source(std::move(value)) {}
    const model::FrontendInfo &info() const override { return source->info(); }
    const std::vector<model::TopInfo> &tops() const override { return source->tops(); }
    const std::vector<model::DefInfo> &definitions() const override { return source->definitions(); }
    size_t bodyCount() const override { return source->bodyCount(); }
    model::Diagnostics diagnostics(size_t limit) const override { return source->diagnostics(limit); }
    model::BodySkeleton skeleton(model::BodyId id) const override { return source->skeleton(id); }
    model::BodyConnections connections(model::BodyId id) const override {
        auto facts = source->connections(id);
        if (id != tops()[0].body)
            return facts;
        model::PinBinding first;
        first.inst = "i:0";
        first.pin = "p:0:0";
        first.width = 8;
        first.direction = "unknown";
        model::BindTarget constant;
        constant.kind = "const";
        constant.value = "8'b11111111";
        first.segments = {{{0, 8}, constant}};
        auto last = first;
        last.direction = "in";
        last.segments[0].target.value = "8'b10101010";
        if (missingWidth) {
            first.width.reset();
            first.unresolved = "unknown_pin_width";
        }
        facts.bindings = {first, last};
        if (interrupt)
            interrupt->request_stop();
        return facts;
    }
};
} // namespace

TEST_CASE("port slices retain constant order mapped internals and occurrence-qualified routes", "[a-m7]") {
    auto opened = Design::open(options());
    REQUIRE(opened);
    auto &design = **opened;
    REQUIRE(design.diagnostics().errorCount == 0);
    ConnectionRequest request;
    request.side = "outside";
    request.bits = model::BitRange{4, 2};
    auto constant = design.drivers("p:0.0.0:0", request);
    REQUIRE(constant);
    REQUIRE(constant->completeness.status == "complete");
    REQUIRE(constant->result.size() == 1);
    CHECK(constant->result[0].kind == "const");
    CHECK(constant->result[0].queried == model::BitRange{4, 2});
    CHECK(constant->result[0].value == "2'b10");
    for (uint64_t bit = 4; bit < 6; ++bit) {
        request.bits = model::BitRange{bit, 1};
        auto digit = design.drivers("p:0.0.0:0", request);
        REQUIRE(digit);
        REQUIRE(digit->result.size() == 1);
        CHECK(digit->result[0].value == (bit == 4 ? "1'b0" : "1'b1"));
    }
    request.side = "inside";
    request.bits = model::BitRange{2, 4};
    auto mapped = design.loads("p:0.0.0:0", request);
    REQUIRE(mapped);
    REQUIRE(mapped->result.size() == 2);
    CHECK(mapped->result[0].queried == model::BitRange{2, 2});
    CHECK(mapped->result[1].queried == model::BitRange{4, 2});
    CHECK(mapped->result[0].ref == "x:0.0.0:0");
    CHECK(mapped->result[1].ref == "x:0.0.0:0");
    request.side = "outside";
    request.reach = "hier";
    request.bits = model::BitRange{0, 4};
    auto shared = design.drivers("p:0.1.0:0", request);
    REQUIRE(shared);
    REQUIRE(shared->result.size() == 1);
    CHECK(shared->result[0].ref == "p:0:0");
    CHECK(shared->result[0].bits == model::BitRange{4, 4});
    REQUIRE(shared->result[0].via.size() == 1);
    CHECK(shared->result[0].via[0].via == "p:0.1:0");
}

TEST_CASE("all small port slices preserve cache sharing direction side and reach results", "[a-m7]") {
    std::vector<std::string> baseline;
    for (bool per : {false, true})
        for (size_t cache : {size_t{0}, size_t{1}, size_t{64 * 1024 * 1024}}) {
            auto config = options();
            config.forcePerInstanceBodies = per;
            config.connectionCacheBytes = cache;
            auto opened = Design::open(config);
            REQUIRE(opened);
            std::vector<std::string> replies;
            for (const auto &ref : {"p:0.0.0:0", "p:0.1.0:0", "p:0.0:0", "p:0.1:0", "p:0.2:0"})
                for (const auto &side : {"inside", "outside"})
                    for (const auto &reach : {"local", "hier"})
                        for (bool upstream : {false, true})
                            for (uint64_t lsb = 0; lsb < 8; ++lsb)
                                for (uint64_t width : {uint64_t{1}, 8 - lsb}) {
                                    ConnectionRequest request{{{lsb, width}}, reach, side};
                                    auto reply = upstream ? (*opened)->drivers(ref, request)
                                                          : (*opened)->loads(ref, request);
                                    REQUIRE(reply);
                                    replies.push_back(json(*reply));
                                }
            if (baseline.empty())
                baseline = replies;
            CHECK(replies == baseline);
            std::stop_source stop;
            stop.request_stop();
            auto cancelled = (*opened)->drivers("p:0.0.0:0", {{}, "hier", "outside"}, stop.get_token());
            REQUIRE_FALSE(cancelled);
            CHECK(cancelled.error().code == ErrorCode::Cancelled);
            auto invalid = (*opened)->drivers("p:0.0.0:0", {{{7, 2}}, "local", "outside"});
            REQUIRE_FALSE(invalid);
            CHECK(invalid.error().code == ErrorCode::BadRequest);
        }
}

TEST_CASE("borrowed outer segments preserve duplicate last-match and unknown-width precedence", "[a-m7]") {
    auto opened = Design::open(options());
    REQUIRE(opened);
    for (bool missing : {false, true}) {
        auto source = frontend::openDesign(options());
        REQUIRE(source);
        auto frontend = std::make_unique<RepeatedBinding>(std::move(source.value()));
        auto &control = *frontend;
        control.missingWidth = missing;
        db::DesignDb database(std::move(frontend), 0);
        ConnectionRequest request{{{2, 2}}, "local", "outside"};
        auto reply = detail::connections(**opened, database, "p:0.0:0", request, true, {});
        REQUIRE(reply);
        CHECK(reply->completeness.status == "partial");
        REQUIRE(reply->completeness.reasons.size() == 1);
        CHECK(reply->completeness.reasons[0].code == (missing ? "unknown_pin_width" : "blackbox"));
        if (missing)
            CHECK(reply->result.empty());
        else {
            REQUIRE(reply->result.size() == 1);
            CHECK(reply->result[0].value == "2'b10");
        }
        std::stop_source stop;
        control.interrupt = &stop;
        try {
            detail::connections(**opened, database, "p:0.0:0", request, true, stop.get_token());
            FAIL("expected cancelled extraction");
        } catch (const Error &error) {
            CHECK(error.code == ErrorCode::Cancelled);
        }
    }
}
