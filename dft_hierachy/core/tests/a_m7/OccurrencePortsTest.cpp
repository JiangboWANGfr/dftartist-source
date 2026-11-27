#include "ConnectionSnapshot.h"
#include "hier/Design.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <random>

using namespace hier;
namespace {
template <class T> std::string json(const T &value) {
    protocol::JsonWriter writer;
    protocol::write(writer, value);
    return writer.str();
}
// Independent reference: the original per-port scan, including qualification and
// every repeated binding. It intentionally does not call the production apply.
auto linear(const model::ChildSlot &slot, const model::InstKey &key,
            const std::vector<model::PinBinding> &bindings) {
    std::vector<model::PortInfo> out;
    auto parent = key;
    parent.pop_back();
    for (size_t i = 0; i < slot.blackboxPins.size(); ++i) {
        model::PortInfo port;
        port.name = slot.blackboxPins[i];
        port.ref = "p:" + model::formatInstKey(key) + ":" + std::to_string(i);
        port.internal.reason = slot.kind == model::InstKind::Primitive ? "unsupported" : "blackbox";
        for (const auto &b : bindings)
            if (detail::qualify(b.pin, parent) == port.ref) {
                if (b.width) port.width = *b.width;
                port.attrs = b.attrs;
                if (b.direction == "in") port.direction = model::Direction::In;
                if (b.direction == "out") port.direction = model::Direction::Out;
                if (b.direction == "inout") port.direction = model::Direction::InOut;
            }
        out.push_back(std::move(port));
    }
    return out;
}
struct Library final : model::LibraryProvider {
    std::optional<model::CellInfo> cell(std::string_view name) const override {
        if (name != "absent_named" && name != "absent_ordered") return {};
        model::CellInfo cell;
        constexpr std::array directions{model::Direction::In,model::Direction::Out,
            model::Direction::InOut,model::Direction::Ref,model::Direction::Unknown};
        for (size_t i = 0; i < 64; ++i)
            cell.pins.push_back({"P" + std::to_string(i),directions[i % directions.size()],
                                 1 + i % 4,{{"pin",std::to_string(i)}}});
        return cell;
    }
};
} // namespace

TEST_CASE("occurrence pin joins preserve the full original scan across lookup thresholds", "[a-m7]") {
    std::mt19937 random(173);
    for (size_t pins : std::array<size_t,7>{0,1,8,9,17,63,129})
        for (size_t count : std::array<size_t,6>{0,1,8,9,64,257})
            for (auto kind : {model::InstKind::Blackbox,model::InstKind::Primitive}) {
                model::ChildSlot slot;
                slot.kind = kind;
                for (size_t i = 0; i < pins; ++i)
                    slot.blackboxPins.push_back(i % 3 ? "same.name[]" : "");
                std::vector<model::PinBinding> bindings;
                for (size_t i = 0; i < count; ++i) {
                    model::PinBinding b;
                    auto pin = random() % (pins + 1);
                    b.pin = "p:2:" + std::to_string(pin);
                    if (i % 7 == 0) b.pin = "p:3:" + std::to_string(pin);
                    if (i % 11 == 0) b.pin = "p:02:" + std::to_string(pin);
                    if (i % 13 == 0) b.pin = "p:2.0:" + std::to_string(pin);
                    if (i % 17 == 0) b.pin = "s:2:" + std::to_string(pin);
                    if (i % 19 == 0) b.pin = "malformed";
                    b.direction = std::array{"in","out","inout","ref","unknown"}[i % 5];
                    if (i % 3) b.width = i % 3 == 1 ? 0 : i + 1;
                    if (i % 4) b.attrs = {{"ordinal",std::to_string(i)}};
                    bindings.push_back(std::move(b));
                }
                const model::InstKey key{0,4,2};
                auto expected = json(linear(slot,key,bindings));
                auto before = json(bindings);
                CHECK(json(detail::occurrencePorts(slot,key,bindings,{})) == expected);
                CHECK(json(bindings) == before);
                std::reverse(bindings.begin(),bindings.end());
                CHECK(json(detail::occurrencePorts(slot,key,bindings,{})) == json(linear(slot,key,bindings)));
            }
}

TEST_CASE("wide occurrence projection owns its output and keeps ordered override semantics", "[a-m7]") {
    model::ChildSlot slot;
    slot.kind = model::InstKind::Blackbox;
    slot.blackboxPins.resize(32768,"A");
    std::vector<model::PinBinding> bindings;
    for (size_t i = 0; i < slot.blackboxPins.size(); ++i) {
        model::PinBinding b;
        b.pin = "p:2:" + std::to_string(i);
        b.direction = "inout";
        b.width = 8;
        b.attrs = {{"old","value"}};
        bindings.push_back(b);
        b.direction = "ref";
        b.width.reset();
        b.attrs.clear();
        bindings.push_back(std::move(b));
    }
    auto ports = detail::occurrencePorts(slot,{0,2},bindings,{});
    REQUIRE(ports.size() == 32768);
    bindings.clear();slot.blackboxPins.clear();
    for (size_t i = 0; i < ports.size(); ++i) {
        CHECK(ports[i].ref == "p:0.2:" + std::to_string(i));
        CHECK(ports[i].name == "A");
        CHECK(ports[i].width == 8);
        CHECK(ports[i].direction == model::Direction::InOut);
        CHECK(ports[i].attrs.empty());
    }
}

TEST_CASE("public and snapshot pin projection retain RTL library cache and occurrence facts", "[a-m7]") {
    for (bool per : {false,true})
        for (bool library : {false,true})
            for (size_t budget : {size_t{0},size_t{1},size_t{64*1024*1024}}) {
                model::OpenOptions options;
                options.files = {HIER_OCCURRENCE_PORTS_FIXTURE};
                options.tops = {"pin_top"};
                options.connectionCacheBytes = budget;
                options.forcePerInstanceBodies = per;
                if (library) options.library = std::make_shared<Library>();
                auto opened = Design::open(options);
                REQUIRE(opened);
                REQUIRE((*opened)->diagnostics().errorCount == 0);
                auto front = frontend::openDesign(options);
                REQUIRE(front);
                db::DesignDb db(std::move(front.value()),budget);
                detail::ConnectionSnapshot snapshot(db,{});
                std::vector<model::PortInfo> retained;
                for (const auto &parent : {"0.0","0.1"})
                    for (size_t child = 0; child < 2; ++child) {
                        auto ref = "i:" + std::string(parent) + "." + std::to_string(child);
                        auto ports = (*opened)->ports(ref);
                        REQUIRE(ports);REQUIRE(ports->size() == 64);
                        const auto &occurrence = snapshot.load(ref).occurrence;
                        auto projected = occurrence.ports();
                        for (size_t i = 0; i < projected.size(); ++i) {
                            projected[i].ref = occurrence.portRef(i);
                            detail::qualify(projected[i].internal, occurrence.key, {});
                        }
                        CHECK(json(*ports) == json(projected));
                        CHECK(json(*ports) == json((*opened)->ports(ref).value()));
                        for (size_t i = 0; i < 64; ++i) {
                            auto &p = (*ports)[i];
                            CHECK(p.name == (library || child == 0 ? "P" + std::to_string(i) : ""));
                            CHECK(p.ref == "p:" + ref.substr(2) + ":" + std::to_string(i));
                            CHECK(p.width == (library || i % 8 != 1 ? uint64_t(1+i%4) : uint64_t{0}));
                            auto direction = library && i%5 < 3 ? std::array{model::Direction::In,
                                model::Direction::Out,model::Direction::InOut}[i%5] : model::Direction::Unknown;
                            CHECK(p.direction == direction);
                            CHECK(p.internal.reason == "blackbox");
                            CHECK(p.attrs == (library ? decltype(p.attrs){{"pin",std::to_string(i)}} : decltype(p.attrs){}));
                        }
                        retained = *ports;
                        std::stop_source stop;stop.request_stop();
                        auto cancelled = (*opened)->ports(ref,stop.get_token());
                        REQUIRE_FALSE(cancelled);CHECK(cancelled.error().code == ErrorCode::Cancelled);
                        CHECK(json((*opened)->ports(ref).value()) == json(retained));
                    }
                opened.value().reset();
                CHECK(retained.front().name == (library ? "P0" : ""));
            }
}
