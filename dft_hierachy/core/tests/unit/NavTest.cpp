// M1 navigation and detail queries against tests/fixtures/nav/nav.sv.
// Every expectation here is written by hand from the SystemVerilog source, not copied
// from the tool's output.
#include <algorithm>
#include <random>
#include <string_view>

#include <catch2/catch_test_macros.hpp>

#include "hier/Design.h"
#include "hier/protocol/Json.h"

using namespace hier;
using namespace hier::model;

namespace {

std::unique_ptr<Design> openNav(bool perInstance = false) {
    OpenOptions o;
    o.files = {HIER_FIXTURES "/nav/nav.sv"};
    o.forcePerInstanceBodies = perInstance;
    auto d = Design::open(o);
    REQUIRE(d.ok());
    return std::move(d.value());
}

template<class T>
std::string json(const T& v) {
    protocol::JsonWriter w;
    protocol::write(w, v);
    return w.str();
}

template<class T>
std::string json(const Result<T>& r) {
    return r ? json(r.value()) : json(r.error());
}

std::vector<std::string> pathTexts(const std::vector<InstInfo>& items) {
    std::vector<std::string> out;
    for (auto& i : items)
        out.push_back(i.pathText);
    return out;
}

std::vector<InstInfo> allChildren(const Design& d, const std::string& ref) {
    PageRequest page;
    page.limit = 1000;
    auto r = d.children(ref, page);
    REQUIRE(r.ok());
    REQUIRE(r->next.empty());
    return r->items;
}

const PortInfo& port(const std::vector<PortInfo>& ports, std::string_view name) {
    auto it = std::find_if(ports.begin(), ports.end(), [&](auto& p) { return p.name == name; });
    REQUIRE(it != ports.end());
    return *it;
}

const ParamInfo& param(const std::vector<ParamInfo>& params, std::string_view name) {
    auto it = std::find_if(params.begin(), params.end(), [&](auto& p) { return p.name == name; });
    REQUIRE(it != params.end());
    return *it;
}

bool sameDims(const std::vector<Dim>& a, std::vector<Dim> b) {
    return std::equal(a.begin(), a.end(), b.begin(), b.end(), [](const Dim& x, const Dim& y) {
        return x.left == y.left && x.right == y.right && x.packed == y.packed;
    });
}

// Every instance reference in the design, depth-first.
void collectRefs(const Design& d, const std::string& ref, std::vector<std::string>& out) {
    out.push_back(ref);
    for (auto& c : allChildren(d, ref))
        collectRefs(d, c.ref, out);
}

std::vector<std::string> allRefs(const Design& d) {
    std::vector<std::string> out;
    for (auto& top : d.roots())
        collectRefs(d, top.ref, out);
    return out;
}

}  // namespace

TEST_CASE("tops are listed in name order with stable references") {
    auto d = openNav();
    auto roots = d->roots();
    REQUIRE(roots.size() == 2);
    CHECK(roots[0].ref == "i:0");
    CHECK(roots[0].pathText == "top_a");
    CHECK(roots[0].defName == "top_a");
    CHECK(roots[0].childCount == 2);
    CHECK(roots[1].ref == "i:1");
    CHECK(roots[1].pathText == "top_b");
    CHECK(roots[1].childCount == 7);
    CHECK(d->ancestors("i:0")->empty());
}

TEST_CASE("A04: ports report the declared range, direction, width and sign") {
    auto d = openNav();
    auto r = d->instance("i:0.1");
    REQUIRE(r.ok());
    REQUIRE(r->pathText == "top_a.r");
    auto ports = d->ports("i:0.1");
    REQUIRE(ports.ok());
    REQUIRE(ports->size() == 8);

    // Declaration order is kept.
    const char* order[] = {"up", "rev", "bit1", "packed2", "mem", "sgn", "q", "io"};
    for (size_t i = 0; i < 8; i++)
        CHECK((*ports)[i].name == order[i]);

    auto& up = port(*ports, "up");
    CHECK(up.direction == Direction::In);
    CHECK(up.width == 8);
    CHECK(sameDims(up.dims, {{15, 8, true}}));  // [15:8], not [7:0]

    auto& rev = port(*ports, "rev");
    CHECK(rev.width == 8);
    CHECK(sameDims(rev.dims, {{0, 7, true}}));  // ascending range kept as declared

    auto& bit1 = port(*ports, "bit1");
    CHECK(bit1.width == 1);
    CHECK(bit1.dims.empty());

    auto& packed2 = port(*ports, "packed2");
    CHECK(packed2.width == 8);
    CHECK(sameDims(packed2.dims, {{1, 0, true}, {3, 0, true}}));  // outermost first

    auto& mem = port(*ports, "mem");
    CHECK(mem.width == 32);
    CHECK(sameDims(mem.dims, {{0, 3, false}, {7, 0, true}}));  // unpacked, then packed

    auto& sgn = port(*ports, "sgn");
    CHECK(sgn.isSigned);
    CHECK_FALSE(up.isSigned);

    CHECK(port(*ports, "q").direction == Direction::Out);
    CHECK(port(*ports, "io").direction == Direction::InOut);
}

TEST_CASE("A07: parameters report elaborated values, and overrides per instance") {
    auto d = openNav();
    // top_b: g0 g1 same_as_default plain wide \inst.with.dots plain_name
    auto plain = d->params("i:1.3");
    auto same = d->params("i:1.2");
    auto wide = d->params("i:1.4");
    REQUIRE((plain.ok() && same.ok() && wide.ok()));

    REQUIRE(plain->size() == 4);
    auto& w = param(*plain, "W");
    CHECK(w.value == "4");
    CHECK(w.isPort);
    CHECK_FALSE(w.isLocal);
    CHECK_FALSE(w.isOverridden);
    auto& t = param(*plain, "T");
    CHECK(t.isType);
    CHECK(t.value == "logic");
    auto& w2 = param(*plain, "W2");
    CHECK(w2.value == "8");  // W * 2
    CHECK(w2.isLocal);
    auto& body = param(*plain, "BODY");
    CHECK(body.value == "7");
    CHECK_FALSE(body.isPort);

    // Same value, so the same body is shared, but only this one overrides W.
    CHECK(param(*same, "W").value == "4");
    CHECK(param(*same, "W").isOverridden);
    CHECK_FALSE(param(*same, "T").isOverridden);
    CHECK(d->instance("i:1.2")->hasParamOverrides);
    CHECK_FALSE(d->instance("i:1.3")->hasParamOverrides);

    CHECK(param(*wide, "W").value == "8");
    CHECK(param(*wide, "W2").value == "16");
    CHECK(param(*wide, "T").value == "int");
    CHECK(param(*wide, "T").isOverridden);

    // The specialised port width follows the parameter.
    CHECK(port(*d->ports("i:1.4"), "d").width == 8);
    CHECK(port(*d->ports("i:1.3"), "d").width == 4);
}

TEST_CASE("A07: generate scopes and instance arrays give ordered, distinct children") {
    auto d = openNav();
    // gen with FAST=0: the else branch of g_sel is selected, which has two instances.
    CHECK(pathTexts(allChildren(*d, "i:1.0")) ==
          std::vector<std::string>{
              "top_b.g0.u_first",
              "top_b.g0.g_sel.u",
              "top_b.g0.g_sel.extra",
              "top_b.g0.g_loop[0].v",
              "top_b.g0.g_loop[1].g_inner.u",  // nested block exists only in iteration 1
              "top_b.g0.g_loop[1].v",
              "top_b.g0.genblk3.anon",  // third generate construct, unnamed
              "top_b.g0.arr[1]",        // arr[3:1], ascending index
              "top_b.g0.arr[2]",
              "top_b.g0.arr[3]",
              "top_b.g0.grid[0][0]",  // grid[1:0][0:1]
              "top_b.g0.grid[0][1]",
              "top_b.g0.grid[1][0]",
              "top_b.g0.grid[1][1]",
          });
    // gen with FAST=1: the other branch, same block name, one instance. An unselected
    // branch takes no slot numbers.
    auto g1 = allChildren(*d, "i:1.1");
    REQUIRE(g1.size() == 13);
    CHECK(g1[1].pathText == "top_b.g1.g_sel.u");
    CHECK(g1[2].pathText == "top_b.g1.g_loop[0].v");

    // A generate scope is a path segment, not an instance: it never appears as an
    // ancestor, and the instance inside it is a direct child of the module instance.
    auto inner = d->instance("i:1.0.4");
    REQUIRE(inner.ok());
    CHECK(inner->path == std::vector<std::string>{"top_b", "g0", "g_loop[1]", "g_inner", "u"});
    CHECK(inner->name == "u");
    auto anc = d->ancestors("i:1.0.4");
    REQUIRE(anc.ok());
    CHECK(pathTexts(*anc) == std::vector<std::string>{"top_b", "top_b.g0"});

    // Same name `u` in different scopes of one body: different references.
    CHECK(d->instance("i:1.0.1")->name == "u");
    CHECK(d->instance("i:1.0.1")->ref != d->instance("i:1.0.4")->ref);
}

TEST_CASE("A08: an escaped identifier containing dots is one path segment") {
    auto d = openNav();
    auto esc = d->instance("i:1.5");
    REQUIRE(esc.ok());
    CHECK(esc->name == "inst.with.dots");
    CHECK(esc->path == std::vector<std::string>{"top_b", "inst.with.dots"});
    CHECK(esc->pathText == "top_b.\\inst.with.dots ");  // escaped form: backslash ... space
    CHECK(esc->defName == "esc.mod");
    auto anc = d->ancestors("i:1.5");
    REQUIRE(anc.ok());
    CHECK(pathTexts(*anc) == std::vector<std::string>{"top_b"});  // not split at the dots
    // The same module under an ordinary name.
    CHECK(d->instance("i:1.6")->pathText == "top_b.plain_name");
    CHECK(d->instance("i:1.6")->def == esc->def);
}

TEST_CASE("interfaces, blackboxes and primitives are distinguished") {
    auto d = openNav();
    auto kids = allChildren(*d, "i:0.0");  // top_a.m: bus iu bb g1
    REQUIRE(kids.size() == 4);
    CHECK(kids[0].kind == InstKind::Interface);
    CHECK(kids[0].defName == "bus_if");
    CHECK(kids[1].kind == InstKind::Module);
    CHECK(kids[2].kind == InstKind::Blackbox);
    CHECK(kids[2].defName == "missing_cell");
    CHECK(kids[3].kind == InstKind::Primitive);
    CHECK(kids[3].defName == "and");

    // An interface port is reported as such, not expanded.
    auto ports = d->ports(kids[1].ref);
    REQUIRE(ports.ok());
    auto& b = port(*ports, "b");
    CHECK(b.kind == PortKind::Interface);
    CHECK(b.interfaceDef == "bus_if");
    CHECK(b.modport == "rd");

    // A blackbox has no declaration: only the pin names used here, direction unknown.
    auto pins = d->ports(kids[2].ref);
    REQUIRE(pins.ok());
    REQUIRE(pins->size() == 3);
    CHECK((*pins)[0].name == "A");
    CHECK((*pins)[2].name == "Y");
    CHECK((*pins)[0].direction == Direction::Unknown);
    CHECK(d->params(kids[2].ref)->empty());
    CHECK(allChildren(*d, kids[2].ref).empty());
    // There is nothing below a blackbox.
    auto below = d->instance(kids[2].ref + ".0");
    REQUIRE_FALSE(below.ok());
    CHECK(below.error().code == ErrorCode::NotFound);
}

TEST_CASE("definitions are listed in a fixed order") {
    auto d = openNav();
    auto defs = d->definitions();
    REQUIRE(defs.ok());
    std::vector<std::string> names;
    for (auto& def : defs->items)
        names.push_back(def.name);
    // One order for every kind: by name. The primitive `and` and the blackbox
    // `missing_cell` sort among the modules, not after them.
    CHECK(names == std::vector<std::string>{"and", "bus_if", "esc.mod", "gen", "if_user", "leaf",
                                            "misc", "missing_cell", "ranges", "top_a", "top_b"});
    CHECK(defs->items[0].kind == DefKind::Primitive);
    CHECK(defs->items[7].kind == DefKind::Blackbox);
    CHECK(defs->items[1].kind == DefKind::Interface);
    CHECK(defs->items[5].line == 20);  // module leaf
    // References are the position in that order.
    for (size_t i = 0; i < defs->items.size(); i++)
        CHECK(defs->items[i].ref == "d:" + std::to_string(i));
    CHECK(d->instance("i:1.3")->def == "d:5");    // top_b.plain is a leaf
    CHECK(d->instance("i:0.0.2")->def == "d:7");  // top_a.m.bb is missing_cell
    CHECK(d->instance("i:0.0.3")->def == "d:0");  // top_a.m.g1 is an and gate
}

TEST_CASE("paging returns every child exactly once, and cursors are bound to their query") {
    auto d = openNav();
    auto all = allChildren(*d, "i:1.0");
    REQUIRE(all.size() == 14);

    std::vector<std::string> paged;
    PageRequest page;
    page.limit = 5;
    int pages = 0;
    while (true) {
        auto r = d->children("i:1.0", page);
        REQUIRE(r.ok());
        for (auto& i : r->items)
            paged.push_back(i.ref);
        pages++;
        if (r->next.empty())
            break;
        page.cursor = r->next;
    }
    CHECK(pages == 3);
    std::vector<std::string> expected;
    for (auto& i : all)
        expected.push_back(i.ref);
    CHECK(paged == expected);

    // The page size may change mid-way without changing the order.
    PageRequest first;
    first.limit = 2;
    auto r1 = d->children("i:1.0", first);
    PageRequest rest;
    rest.limit = 100;
    rest.cursor = r1->next;
    auto r2 = d->children("i:1.0", rest);
    REQUIRE(r2.ok());
    CHECK(r2->items.size() == 12);
    CHECK(r2->items[0].ref == all[2].ref);

    // A cursor from one instance is rejected on another.
    PageRequest wrong;
    wrong.cursor = r1->next;
    auto bad = d->children("i:1.1", wrong);
    REQUIRE_FALSE(bad.ok());
    CHECK(bad.error().code == ErrorCode::BadRequest);

    PageRequest zero;
    zero.limit = 0;
    CHECK(d->children("i:1.0", zero).error().code == ErrorCode::BadRequest);
    PageRequest garbage;
    garbage.cursor = "children|i:1.0@notanumber";
    CHECK(d->children("i:1.0", garbage).error().code == ErrorCode::BadRequest);
}

TEST_CASE("bad and unknown references are reported, not guessed") {
    auto d = openNav();
    CHECK(d->instance("top_b.g0").error().code == ErrorCode::BadRequest);  // a path, not a ref
    CHECK(d->instance("i:").error().code == ErrorCode::BadRequest);
    CHECK(d->instance("i:1..0").error().code == ErrorCode::BadRequest);
    CHECK(d->instance("i:2").error().code == ErrorCode::NotFound);     // only two tops
    CHECK(d->instance("i:1.99").error().code == ErrorCode::NotFound);  // top_b has 7 children
    CHECK(d->ports("i:1.99").error().code == ErrorCode::NotFound);
    CHECK(d->children("i:1.99").error().code == ErrorCode::NotFound);
    CHECK(d->ancestors("i:1.99").error().code == ErrorCode::NotFound);
}

TEST_CASE("a design that fails to open reports an error") {
    OpenOptions o;
    o.files = {HIER_FIXTURES "/nav/does_not_exist.sv"};
    auto d = Design::open(o);
    REQUIRE_FALSE(d.ok());
    CHECK(d.error().code == ErrorCode::BadRequest);
}

TEST_CASE("shared bodies and per-instance bodies answer every query identically") {
    auto fast = openNav(false);
    auto slow = openNav(true);
    REQUIRE(fast->snapshot().frontend.sharedBodies);
    REQUIRE_FALSE(slow->snapshot().frontend.sharedBodies);
    // Sharing must actually be happening, or this test proves nothing.
    REQUIRE(fast->snapshot().bodyCount < slow->snapshot().bodyCount);

    auto refs = allRefs(*fast);
    REQUIRE(refs == allRefs(*slow));
    REQUIRE(refs.size() == 42);  // 2 tops + 2 + 4 + 7 + 14 + 13
    for (auto& ref : refs) {
        INFO(ref);
        CHECK(json(fast->instance(ref)) == json(slow->instance(ref)));
        CHECK(json(fast->ports(ref)) == json(slow->ports(ref)));
        CHECK(json(fast->params(ref)) == json(slow->params(ref)));
        CHECK(json(fast->ancestors(ref)) == json(slow->ancestors(ref)));
    }
}

TEST_CASE("results do not depend on the order queries are made in") {
    // The same set of queries, once in a fixed order on one design and once shuffled on
    // a freshly opened one. Nothing may depend on what was asked before.
    struct Query {
        int kind;
        std::string ref;
    };
    auto run = [](const Design& d, const Query& q) {
        switch (q.kind) {
            case 0: return json(d.instance(q.ref));
            case 1: return json(d.children(q.ref));
            case 2: return json(d.ports(q.ref));
            case 3: return json(d.params(q.ref));
            default: return json(d.ancestors(q.ref));
        }
    };

    auto a = openNav();
    std::vector<Query> queries;
    for (auto& ref : allRefs(*a))
        for (int kind = 0; kind < 5; kind++)
            queries.push_back({kind, ref});
    std::vector<std::string> inOrder;
    for (auto& q : queries)
        inOrder.push_back(run(*a, q));

    for (unsigned seed : {1u, 2u, 3u}) {
        auto b = openNav();
        std::vector<size_t> order(queries.size());
        for (size_t i = 0; i < order.size(); i++)
            order[i] = i;
        std::shuffle(order.begin(), order.end(), std::mt19937(seed));
        for (size_t i : order) {
            INFO("seed " << seed << " query " << queries[i].kind << " " << queries[i].ref);
            CHECK(run(*b, queries[i]) == inOrder[i]);
        }
    }
}
