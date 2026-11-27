#include "spec.h"

#include <regex>
#include <set>
#include <stdexcept>

#include "json/JsonValue.h"  // header-only parser shared from hdl-core

namespace ctrlgen {

namespace {
using hdl::json::Value;

[[noreturn]] void fail(const std::string& why) { throw std::runtime_error("ctrlgen spec: " + why); }

bool isIdent(const std::string& s) {
    static const std::regex re("[A-Za-z_][A-Za-z0-9_$]*");
    return std::regex_match(s, re);
}

std::string reqStr(const Value& v, const std::string& k) {
    const Value* f = v.find(k);
    if (!f || f->type != Value::Type::Str || f->s.empty()) fail("missing string field '" + k + "'");
    return f->s;
}

PinSpec parsePin(const Value& v) {
    PinSpec p;
    p.portName = reqStr(v, "portName");
    if (!isIdent(p.portName)) fail("portName not an identifier: " + p.portName);
    const Value* modeField = v.find("mode");
    if (!modeField || modeField->type != Value::Type::Str || modeField->s.empty())
        fail(p.portName + ": mode must be control|observe");
    p.mode = modeField->s;
    if (p.mode != "control" && p.mode != "observe") fail(p.portName + ": mode must be control|observe");
    if (const Value* w = v.find("width")) {
        if (w->type != Value::Type::Int || w->i < 1) fail(p.portName + ": width must be int >= 1");
        p.width = static_cast<int>(w->i);
    }
    const Value* t = v.find("target");
    const Value* ts = v.find("targets");
    if (t && ts) fail(p.portName + ": target and targets are mutually exclusive");
    if (!t && !ts) fail(p.portName + ": needs target or targets");
    if (t) {
        if (t->type != Value::Type::Str || t->s.empty()) fail(p.portName + ": bad target");
        p.target = t->s;
    } else {
        if (ts->type != Value::Type::Array) fail(p.portName + ": targets must be array");
        for (const auto& e : ts->arr) {
            if (e.type != Value::Type::Str || e.s.empty()) fail(p.portName + ": bad targets entry");
            p.targets.push_back(e.s);
        }
        if (static_cast<int>(p.targets.size()) != p.width)
            fail(p.portName + ": targets length != width");
    }

    const Value* st = v.find("stitch");
    const Value* mn = v.find("muxName");
    if (p.mode == "observe") {
        if (st || mn) fail(p.portName + ": observe pin must not carry stitch/muxName");
        return p;
    }
    if (!st) fail(p.portName + ": control pin needs stitch");
    auto oneStitch = [&](const std::string& s) {
        if (s != "mux" && s != "replace" && s != "connect")
            fail(p.portName + ": stitch must be mux|replace|connect");
        return s;
    };
    if (st->type == Value::Type::Str) {
        p.stitch.assign(p.width, oneStitch(st->s));
    } else if (st->type == Value::Type::Array) {
        for (const auto& e : st->arr) {
            if (e.type != Value::Type::Str) fail(p.portName + ": stitch array entries must be strings");
            p.stitch.push_back(oneStitch(e.s));
        }
        if (static_cast<int>(p.stitch.size()) != p.width) fail(p.portName + ": stitch length != width");
    } else {
        fail(p.portName + ": stitch must be string or array");
    }

    p.muxName.assign(p.width, "");
    if (mn) {
        if (mn->type == Value::Type::Str) {
            if (p.width > 1) {
                bool hasMux = false;
                for (const auto& bit : p.stitch)
                    if (bit == "mux") { hasMux = true; break; }
                if (hasMux) fail(p.portName + ": bus mux needs per-bit muxName array");
            }
            p.muxName.assign(p.width, mn->s);
        } else if (mn->type == Value::Type::Array) {
            if (static_cast<int>(mn->arr.size()) != p.width) fail(p.portName + ": muxName length != width");
            for (int i = 0; i < p.width; ++i) {
                const auto& e = mn->arr[static_cast<size_t>(i)];
                if (e.type == Value::Type::Str) p.muxName[static_cast<size_t>(i)] = e.s;
                else if (e.type != Value::Type::Null) fail(p.portName + ": muxName entries must be string|null");
            }
        } else {
            fail(p.portName + ": muxName must be string or array");
        }
    }
    for (int i = 0; i < p.width; ++i) {
        const bool isMux = p.stitch[static_cast<size_t>(i)] == "mux";
        const std::string& m = p.muxName[static_cast<size_t>(i)];
        if (isMux && (m.empty() || !isIdent(m))) fail(p.portName + ": mux bit needs identifier muxName");
        if (!isMux && !m.empty()) fail(p.portName + ": non-mux bit must not carry muxName");
    }
    return p;
}
}  // namespace

CtrlIpSpec parseSpec(const std::string& jsonText) {
    Value root = hdl::json::parse(jsonText);
    CtrlIpSpec s;
    if (const Value* v = root.find("schemaVersion"); v && v->type == Value::Type::Int)
        s.schemaVersion = static_cast<int>(v->i);
    s.moduleBase = reqStr(root, "moduleBase");
    if (!isIdent(s.moduleBase)) fail("moduleBase not an identifier: " + s.moduleBase);
    if (const Value* v = root.find("dsIndex"); v && v->type == Value::Type::Int)
        s.dsIndex = static_cast<int>(v->i);
    if (const Value* v = root.find("dfxModeSource"); v && v->type == Value::Type::Str)
        s.dfxModeSource = v->s;
    if (const Value* g = root.find("gateCell")) {
        if (const Value* v = g->find("name"); v && v->type == Value::Type::Str) s.gateCell.name = v->s;
        if (const Value* v = g->find("out"); v && v->type == Value::Type::Str) s.gateCell.out = v->s;
        if (const Value* v = g->find("a"); v && v->type == Value::Type::Str) s.gateCell.a = v->s;
        if (const Value* v = g->find("b"); v && v->type == Value::Type::Str) s.gateCell.b = v->s;
    }
    std::set<std::string> names;
    std::set<std::string> muxNames;
    if (const Value* pins = root.find("pins")) {
        if (pins->type != Value::Type::Array) fail("pins must be an array");
        for (const auto& e : pins->arr) {
            PinSpec p = parsePin(e);
            if (!names.insert(p.portName).second) fail("duplicate portName: " + p.portName);
            for (const auto& m : p.muxName)
                if (!m.empty() && !muxNames.insert(m).second) fail("duplicate muxName: " + m);
            s.pins.push_back(std::move(p));
        }
    }
    return s;
}

}  // namespace ctrlgen
