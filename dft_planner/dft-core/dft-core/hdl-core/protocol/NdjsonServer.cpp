#include "protocol/NdjsonServer.h"

#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

#include "json/JsonValue.h"
#include "json/JsonWriter.h"
#include "lint.h"          // sdc-core: the SDC checker
#include "clockgen.h"      // sdc-core: generated-clock resolution + add_clock command generation
#include "service/DesignDb.h"
#include "service/ScanBudget.h"
#include "service/DpShell.h"

using hdl::json::JsonWriter;
using namespace hdl::service;

namespace hdl::protocol {

namespace {

/// THE session's dp_shell — one per daemon, per design. The console's recordings (OCC points,
/// pin constraints, DFT signals) are the session's DFT plan, so the analyses the GUI runs
/// directly have to see them too: the console and the buttons are one session, and when they
/// were two the console's `add_pin_constraint` had no effect on the view the user was reading.
DpShell* sessionShell(DesignDb& db) {
    static DesignDb* shellDb = nullptr;
    static std::unique_ptr<DpShell> shell;
    if (!shell || shellDb != &db) { shell = std::make_unique<DpShell>(db); shellDb = &db; }
    return shell.get();
}

void writeMeta(JsonWriter& w, const Meta& m, bool withSubtree) {
    w.beginObject();
    w.key("id");
    w.value(m.id);
    w.key("instanceName");
    w.value(m.instanceName);
    w.key("kind");
    w.value(m.kind);
    w.key("definitionId");
    w.value(m.definitionId);
    w.key("isLeaf");
    w.value(m.isLeaf);
    if (withSubtree && m.subtreeSize) {
        w.key("subtreeSize");
        w.value(*m.subtreeSize);
    }
    w.endObject();
}

void writePorts(JsonWriter& w, const PortsResult& r) {
    w.beginObject();
    w.key("ports");
    w.beginArray();
    for (auto& p : r.ports) {
        w.beginObject();
        w.key("name");
        w.value(p.name);
        w.key("direction");
        w.value(p.direction);
        w.key("width");
        w.value(p.width);
        w.key("busLabel");
        w.value(p.busLabel);
        w.key("type");
        w.value(p.type);
        w.key("portKind");
        w.value(p.portKind);
        w.key("interfaceType");
        w.value(p.interfaceType);
        w.key("modport");
        w.value(p.modport);
        w.endObject();
    }
    w.endArray();
    w.key("portWidthOverrides");
    w.beginObject();
    for (auto& [name, width] : r.portWidthOverrides) {
        w.key(name);
        w.value(width);
    }
    w.endObject();
    w.endObject();
}

// Write the request's id (echoed in the response): int or null.
void writeId(JsonWriter& w, const hdl::json::Value* req) {
    const hdl::json::Value* id = req ? req->find("id") : nullptr;
    if (id && id->type == hdl::json::Value::Type::Int)
        w.value(static_cast<int>(id->i));
    else
        w.valueNull();
}

// Dispatch a method into the "result" object of the writer. Throws on errors.
void dispatch(JsonWriter& w, DesignDb& db, const std::string& method,
              const hdl::json::Value* params) {
    auto pstr = [&](const char* k) -> std::string {
        return params ? params->str(k) : std::string();
    };
    auto phas = [&](const char* k) -> bool { return params && params->find(k) != nullptr; };

    if (method == "ping") {
        auto [roots, defCount] = db.ping();
        w.beginObject();
        w.key("roots");
        w.beginArray();
        for (auto& r : roots) w.value(r);
        w.endArray();
        w.key("defCount");
        w.value(defCount);
        w.endObject();
    } else if (method == "get-diagnostics") {
        DiagnosticsResult dr = db.getDiagnostics();
        w.beginObject();
        w.key("errorCount");
        w.value(dr.errorCount);
        w.key("totalDiagnostics");
        w.value(dr.totalDiagnostics);
        w.key("truncated");
        w.value(dr.truncated);
        w.key("text");
        w.value(dr.text);
        w.key("missingFiles");
        w.beginArray();
        for (auto& f : dr.missingFiles) w.value(f);
        w.endArray();
        w.key("libraryFiles");
        w.beginArray();
        for (auto& f : dr.libraryFiles) w.value(f);
        w.endArray();
        w.key("missingLibDirs");
        w.beginArray();
        for (auto& f : dr.missingLibDirs) w.value(f);
        w.endArray();
        w.endObject();
    } else if (method == "expand-children") {
        ExpandResult r = db.expandChildren(pstr("nodeId"));
        w.beginObject();
        w.key("childInstanceIds");
        w.beginArray();
        for (auto& id : r.childInstanceIds) w.value(id);
        w.endArray();
        w.key("children");
        w.beginArray();
        for (auto& m : r.children) writeMeta(w, m, false);
        w.endArray();
        w.endObject();
    } else if (method == "get-ports") {
        PortsResult r = phas("nodeId") ? db.getPortsByNode(pstr("nodeId"))
                                       : db.getPortsByDef(pstr("defId"));
        writePorts(w, r);
    } else if (method == "get-parameters") {
        ParamsResult r = phas("nodeId") ? db.getParametersByNode(pstr("nodeId"))
                                        : db.getParametersByDef(pstr("defId"));
        w.beginObject();
        w.key("parameters");
        w.beginArray();
        for (auto& p : r.parameters) {
            w.beginObject();
            w.key("name");
            w.value(p.name);
            w.key("value");
            w.value(p.value);
            w.key("type");
            w.value(p.type);
            w.key("isLocal");
            w.value(p.isLocal);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    } else if (method == "get-source-location") {
        std::string kind = pstr("kind");
        std::string id = (kind == "definition") ? pstr("defId") : pstr("nodeId");
        SourceLoc loc = db.getSourceLocation(kind, id);
        w.beginObject();
        w.key("file");
        w.value(loc.file);
        w.key("line");
        w.value(loc.line);
        w.endObject();
    } else if (method == "get-netlist") {
        LocalNetlist nl = db.getNetlist(pstr("ownerInstanceId"));
        w.beginObject();
        w.key("ownerInstanceId");
        w.value(nl.ownerInstanceId);
        w.key("nets");
        w.beginArray();
        for (auto& n : nl.nets) {
            w.beginObject();
            w.key("name");
            w.value(n.name);
            w.key("width");
            w.value(n.width);
            w.key("busLabel");
            w.value(n.busLabel);
            w.key("netKind");
            w.value(n.netKind);
            w.endObject();
        }
        w.endArray();
        w.key("connections");
        w.beginArray();
        for (auto& c : nl.connections) {
            w.beginObject();
            w.key("instanceId");
            w.value(c.instanceId);
            w.key("port");
            w.value(c.port);
            w.key("direction");
            w.value(c.direction);
            w.key("net");
            w.value(c.net);
            w.key("tie");
            w.value(c.tie);
            w.endObject();
        }
        w.endArray();
        w.key("truncated");
        w.value(nl.truncated);
        w.endObject();
    } else if (method == "trace-fanin" || method == "trace-fanout") {
        TraceResult tr = db.trace(pstr("nodeId"), pstr("port"), method == "trace-fanin");
        w.beginObject();
        w.key("edges");
        w.beginArray();
        for (auto& e : tr.edges) {
            w.beginObject();
            w.key("fromNode");
            w.value(e.fromNode);
            w.key("fromPort");
            w.value(e.fromPort);
            w.key("toNode");
            w.value(e.toNode);
            w.key("toPort");
            w.value(e.toPort);
            w.key("netName");
            w.value(e.netName);
            w.key("bus");
            w.value(e.bus);
            w.endObject();
        }
        w.endArray();
        w.key("nodes");
        w.beginArray();
        for (auto& m : tr.nodes) writeMeta(w, m, false);
        w.endArray();
        w.key("truncated");
        w.value(tr.truncated);
        w.endObject();
    } else if (method == "trace-drivers" || method == "trace-loads") {
        DriversResult dr = method == "trace-drivers"
            ? db.traceDrivers(pstr("nodeId"), pstr("port"))
            : db.traceLoads(pstr("nodeId"), pstr("port"));
        w.beginObject();
        w.key("sources");
        w.beginArray();
        for (auto& s : dr.sources) {
            w.beginObject();
            w.key("kind");
            w.value(s.kind);
            w.key("id");
            w.value(s.id);
            w.key("label");
            w.value(s.label);
            w.key("detail");
            w.value(s.detail);
            w.key("shape");
            w.value(s.shape);
            w.key("drives");
            w.value(s.drives);
            w.key("reads");
            w.beginArray();
            for (auto& rd : s.reads) w.value(rd);
            w.endArray();
            w.key("net");
            w.value(s.net);
            w.key("file");
            w.value(s.file);
            w.key("line");
            w.value(s.line);
            w.key("bus");
            w.value(s.bus);
            w.endObject();
        }
        w.endArray();
        w.key("netName");
        w.value(dr.netName);
        w.key("bus");
        w.value(dr.bus);
        w.endObject();
    } else if (method == "trace-logic") {
        // Trace THROUGH a behavioral block (always/assign): its input signals' drivers.
        DriversResult dr = db.traceLogic(pstr("id"));
        w.beginObject();
        w.key("sources");
        w.beginArray();
        for (auto& s : dr.sources) {
            w.beginObject();
            w.key("kind");
            w.value(s.kind);
            w.key("id");
            w.value(s.id);
            w.key("label");
            w.value(s.label);
            w.key("detail");
            w.value(s.detail);
            w.key("shape");
            w.value(s.shape);
            w.key("drives");
            w.value(s.drives);
            w.key("reads");
            w.beginArray();
            for (auto& rd : s.reads) w.value(rd);
            w.endArray();
            w.key("net");
            w.value(s.net);
            w.key("file");
            w.value(s.file);
            w.key("line");
            w.value(s.line);
            w.key("bus");
            w.value(s.bus);
            w.endObject();
        }
        w.endArray();
        w.key("netName");
        w.value(dr.netName);
        w.key("bus");
        w.value(dr.bus);
        w.endObject();
    } else if (method == "dp-shell") {
        // dp_shell: evaluate a command line / script, or `source` a file. The shell instance is
        // per-daemon-session so OCC points and ctrl muxes accumulate across requests (that state
        // IS the user's DFT plan).
        DpShell* shell = sessionShell(db);
        const std::string file = pstr("file");
        DpResult r = file.empty() ? shell->eval(pstr("script")) : shell->sourceFile(file);
        w.beginObject();
        w.key("ok");
        w.value(r.ok);
        w.key("output");
        w.value(r.output);
        w.key("error");
        w.value(r.error);
        // Changes when the recorded plan changes — the GUI re-runs its clock/reset analysis on
        // this rather than trying to guess which commands matter.
        w.key("planRev");
        w.value(static_cast<int>(shell->planRev() & 0x7fffffffull));
        w.key("occPoints");
        w.beginArray();
        for (auto& o : shell->occPoints()) {
            w.beginObject();
            w.key("pin");
            w.value(o.pin);
            w.key("clock");
            w.value(o.clock);
            w.key("comment");
            w.value(o.comment);
            w.endObject();
        }
        w.endArray();
        w.key("ctrlMuxes");
        w.beginArray();
        for (auto& m : shell->ctrlMuxes()) {
            w.beginObject();
            w.key("target");
            w.value(m.target);
            w.key("overrideSource");
            w.value(m.overrideSource);
            w.key("select");
            w.value(m.select);
            w.endObject();
        }
        w.endArray();
        w.key("dftIps");
        w.beginArray();
        // Port states computed from the IP library (empty list until read_dfx_ip): the
        // schematic draws each planned IP with its INPUT CIRCUIT — every port labeled
        // s()-sac()/asc(), outputs computed from the real gates, X when undecidable.
        auto circuits = shell->ipCircuits();
        for (auto& x : shell->dftIps()) {
            w.beginObject();
            w.key("module");
            w.value(x.module);
            w.key("instance");
            w.value(x.instance);
            w.key("at");
            w.value(x.at);
            w.key("comment");
            w.value(x.comment);
            for (auto& c : circuits) {
                if (c.instance != x.instance) continue;
                w.key("ports");
                w.beginArray();
                for (auto& ps : c.ports) {
                    w.beginObject();
                    w.key("port");
                    w.value(ps.port);
                    w.key("dir");
                    w.value(ps.dir);
                    w.key("s");
                    w.value(ps.s);
                    w.key("sac");
                    w.value(ps.sac);
                    w.key("asc");
                    w.value(ps.asc);
                    if (!ps.stuck.empty()) {
                        w.key("stuck");
                        w.value(ps.stuck);
                    }
                    w.key("declared");
                    w.value(ps.declared);
                    w.endObject();
                }
                w.endArray();
                break;
            }
            w.endObject();
        }
        w.endArray();
        w.key("pinConstraints");
        w.beginArray();
        for (auto& pc : shell->pinConstraints()) {
            w.beginObject();
            w.key("pin");
            w.value(pc.pin);
            w.key("value");
            w.value(std::string(1, pc.value));
            w.endObject();
        }
        w.endArray();
        w.key("occTcl");
        w.value(shell->renderOccTcl());
        w.endObject();
    } else if (method == "mbist-plan") {
        // The MemoryBIST partition: controller / step / memory with power, cycles, runtime.
        // Only libDir is needed — placement and budgets are optional refinements.
        const auto pnum2 = [&](const char* k, double dflt) {
            const hdl::json::Value* v = params ? params->find(k) : nullptr;
            if (!v) return dflt;
            if (v->type == hdl::json::Value::Type::Int) return static_cast<double>(v->i);
            if (v->type == hdl::json::Value::Type::Double) return v->d;
            return dflt;
        };
        DesignDb::MbistPlanOptions o;
        o.libDir = pstr("libDir");
        o.defFile = pstr("defFile");
        o.clusterSizeRatio = pnum2("clusterSizeRatio", -1);
        o.defaultPeriodNs = pnum2("defaultPeriodNs", 10);
        o.maxPowerPerStepMw = pnum2("maxPowerPerStepMw", 500);
        o.maxMemoriesPerStep = static_cast<int>(pnum2("maxMemoriesPerStep", 0));
        o.maxStepsPerController = static_cast<int>(pnum2("maxStepsPerController", 0));
        o.maxTestTimePerControllerMs = pnum2("maxTestTimePerControllerMs", 500);
        if (const hdl::json::Value* cp = params ? params->find("clockPeriods") : nullptr)
            if (cp->type == hdl::json::Value::Type::Array)
                for (const auto& e : cp->arr) {
                    const hdl::json::Value* nm = e.find("clock");
                    const hdl::json::Value* pv = e.find("periodNs");
                    if (!nm || !pv) continue;
                    const double per = pv->type == hdl::json::Value::Type::Int
                        ? static_cast<double>(pv->i) : pv->d;
                    o.clockPeriods.emplace_back(nm->s, per);
                }
        DesignDb::MbistPlan pl = db.mbistPlan(o);
        w.beginObject();
        w.key("memories");
        w.beginArray();
        for (const auto& m : pl.memories) {
            w.beginObject();
            w.key("path"); w.value(m.path);
            w.key("module"); w.value(m.module);
            w.key("type"); w.value(m.type);
            w.key("algorithm"); w.value(m.algorithm);
            w.key("operationSet"); w.value(m.operationSet);
            w.key("clockPin"); w.value(m.clockPin);
            w.key("clockNet"); w.value(m.clockNet);
            w.key("clockDomain"); w.value(m.clockDomain);
            w.key("periodNs"); w.value(m.periodNs);
            w.key("words"); w.value(static_cast<double>(m.words));
            w.key("width"); w.value(m.width);
            w.key("powerMw"); w.value(m.powerMw);
            w.key("cycles"); w.value(static_cast<double>(m.cycles));
            w.key("controller"); w.value(m.controller);
            w.key("step"); w.value(m.step);
            w.key("interfaceId"); w.value(m.interfaceId);
            w.key("placed"); w.value(m.placed);
            w.key("x"); w.value(m.x);
            w.key("y"); w.value(m.y);
            w.key("dataOutStage"); w.value(m.dataOutStage);
            w.key("bitGrouping"); w.value(m.bitGrouping);
            w.key("rowAddrBits"); w.value(m.rowAddrBits);
            w.key("colAddrBits"); w.value(m.colAddrBits);
            w.key("bankAddrBits"); w.value(m.bankAddrBits);
            w.key("powerDomain"); w.value(m.powerDomain);
            w.key("physicalCluster"); w.value(m.physicalCluster);
            w.key("partitioningGroup"); w.value(m.partitioningGroup);
            w.endObject();
        }
        w.endArray();
        w.key("steps");
        w.beginArray();
        for (const auto& s : pl.steps) {
            w.beginObject();
            w.key("controller"); w.value(s.controller);
            w.key("index"); w.value(s.index);
            w.key("members"); w.beginArray();
            for (int m : s.members) w.value(m);
            w.endArray();
            w.key("powerMw"); w.value(s.powerMw);
            w.key("cycles"); w.value(static_cast<double>(s.cycles));
            w.key("runtimeNs"); w.value(s.runtimeNs);
            w.key("comparator"); w.value(s.comparator);
            w.key("ruleId"); w.value(s.ruleId);
            w.key("ruleWhy"); w.value(s.ruleWhy);
            w.endObject();
        }
        w.endArray();
        w.key("controllers");
        w.beginArray();
        for (const auto& c : pl.controllers) {
            w.beginObject();
            w.key("name"); w.value(c.name);
            w.key("clockDomain"); w.value(c.clockDomain);
            w.key("periodNs"); w.value(c.periodNs);
            w.key("type"); w.value(c.type);
            w.key("steps"); w.beginArray();
            for (int s : c.steps) w.value(s);
            w.endArray();
            w.key("memories"); w.beginArray();
            for (int m : c.memories) w.value(m);
            w.endArray();
            w.key("powerMw"); w.value(c.powerMw);
            w.key("cycles"); w.value(static_cast<double>(c.cycles));
            w.key("runtimeNs"); w.value(c.runtimeNs);
            w.key("flops"); w.value(c.flops);
            w.key("physicalCluster"); w.value(c.physicalCluster);
            w.key("powerDomain"); w.value(c.powerDomain);
            w.key("partitioningGroup"); w.value(c.partitioningGroup);
            w.key("ruleId"); w.value(c.ruleId);
            w.key("ruleWhy"); w.value(c.ruleWhy);
            w.key("userDefined"); w.value(c.userDefined);
            w.key("violations"); w.beginArray();
            for (const auto& v : c.violations) w.value(v);
            w.endArray();
            w.endObject();
        }
        w.endArray();
        w.key("rules"); w.beginArray();
        for (const auto& r : pl.rules) {
            w.beginObject();
            w.key("id"); w.value(r.id);
            w.key("title"); w.value(r.title);
            w.key("splits"); w.value(r.splits);
            w.key("applies"); w.value(r.applies);
            w.endObject();
        }
        w.endArray();
        w.key("notes"); w.beginArray();
        for (const auto& n : pl.notes) w.value(n);
        w.endArray();
        w.key("errors"); w.beginArray();
        for (const auto& e : pl.errors) w.value(e);
        w.endArray();
        w.key("totalRuntimeNs"); w.value(pl.totalRuntimeNs);
        w.key("peakPowerMw"); w.value(pl.peakPowerMw);
        w.endObject();
    } else if (method == "memory-map") {
        // membistlib (*.tcd_memory) templates matched against the design's blackbox
        // instances — the MemoryBIST planning input ("设计中有哪些 memory").
        DesignDb::MemoryMapResult mm = db.memoryMap(pstr("libDir"), pstr("defFile"));
        const auto pnum = [&](const char* k, double dflt) {
            const hdl::json::Value* v = params ? params->find(k) : nullptr;
            if (!v) return dflt;
            if (v->type == hdl::json::Value::Type::Int) return static_cast<double>(v->i);
            if (v->type == hdl::json::Value::Type::Double) return v->d;
            return dflt;
        };
        const double ratio = pnum("clusterSizeRatio", mm.defFile.empty() ? -1 : 20);
        if (ratio >= 0)
            DesignDb::groupMemories(mm, ratio, static_cast<int>(pnum("maxPerController", 0)));
        w.beginObject();
        w.key("templates");
        w.beginArray();
        for (auto& t : mm.templates) {
            w.beginObject();
            w.key("name");
            w.value(t.name);
            w.key("file");
            w.value(t.file);
            w.key("type");
            w.value(t.type);
            w.key("algorithm");
            w.value(t.algorithm);
            w.key("words");
            w.value(t.words);
            w.key("logicalPorts");
            w.value(t.ports);
            w.key("pins");
            w.beginArray();
            for (auto& pp : t.pins) {
                w.beginObject();
                w.key("name");
                w.value(pp.name);
                w.key("function");
                w.value(pp.function);
                w.key("direction");
                w.value(pp.direction);
                w.key("polarity");
                w.value(pp.polarity);
                w.endObject();
            }
            w.endArray();
            // The library's Verilog model, when found: file + the module's OWN port list.
            w.key("verilogModel");
            w.value(t.verilogModel);
            w.key("hdlPorts");
            w.beginArray();
            for (auto& hp : t.hdlPorts) {
                w.beginObject();
                w.key("name");
                w.value(hp.name);
                w.key("direction");
                w.value(hp.direction);
                w.key("width");
                w.value(static_cast<double>(hp.width));
                w.endObject();
            }
            w.endArray();
            w.endObject();
        }
        w.endArray();
        w.key("instances");
        w.beginArray();
        for (auto& i : mm.instances) {
            w.beginObject();
            w.key("path");
            w.value(i.path);
            w.key("module");
            w.value(i.module);
            w.key("matched");
            w.value(i.matched);
            // DEF placement + the controller group it was clustered into (-1 = none).
            w.key("placed");
            w.value(i.placed);
            w.key("x");
            w.value(i.x);
            w.key("y");
            w.value(i.y);
            w.key("orient");
            w.value(i.orient);
            w.key("group");
            w.value(i.group);
            w.endObject();
        }
        w.endArray();
        w.key("defFile");
        w.value(mm.defFile);
        w.key("placedCount");
        w.value(mm.placedCount);
        w.key("die");
        w.beginObject();
        w.key("x0"); w.value(mm.dieX0);
        w.key("y0"); w.value(mm.dieY0);
        w.key("x1"); w.value(mm.dieX1);
        w.key("y1"); w.value(mm.dieY1);
        w.key("diagonal"); w.value(mm.dieDiagonal);
        w.endObject();
        w.key("groups");
        w.beginArray();
        for (auto& g : mm.groups) {
            w.beginObject();
            w.key("members");
            w.beginArray();
            for (int m : g.members) w.value(m);
            w.endArray();
            w.key("cx"); w.value(g.cx);
            w.key("cy"); w.value(g.cy);
            w.key("x0"); w.value(g.x0);
            w.key("y0"); w.value(g.y0);
            w.key("x1"); w.value(g.x1);
            w.key("y1"); w.value(g.y1);
            w.endObject();
        }
        w.endArray();
        w.key("errors");
        w.beginArray();
        for (auto& e : mm.errors) w.value(e);
        w.endArray();
        w.endObject();
    } else if (method == "dfx-ip-cone") {
        // The internal circuit of one PLANNED DFX IP (add_dft_ip + read_dfx_ip): cells with
        // real pins, the module's port bindings, and every net's per-phase value. The
        // schematic expands the planned IP box with this — "trace INTO the IP".
        DpShell* shell = sessionShell(db);
        DpShell::IpCone c = shell->ipCone(pstr("instance"));
        w.beginObject();
        w.key("instance");
        w.value(c.instance);
        w.key("module");
        w.value(c.module);
        w.key("truncated");
        w.value(c.truncated);
        const auto pins = [&](const std::vector<DpShell::IpConePin>& ps) {
            w.beginArray();
            for (auto& x : ps) {
                w.beginObject();
                w.key("port");
                w.value(x.port);
                w.key("dir");
                w.value(x.dir);
                w.key("net");
                w.value(x.net);
                w.key("tie");
                w.value(x.tie);
                w.endObject();
            }
            w.endArray();
        };
        w.key("ports");
        pins(c.ports);
        w.key("cells");
        w.beginArray();
        for (auto& cell : c.cells) {
            w.beginObject();
            w.key("name");
            w.value(cell.name);
            w.key("module");
            w.value(cell.module);
            w.key("label");
            w.value(cell.label);
            w.key("pins");
            pins(cell.pins);
            w.endObject();
        }
        w.endArray();
        w.key("nets");
        w.beginArray();
        for (auto& n : c.nets) {
            w.beginObject();
            w.key("name");
            w.value(n.name);
            w.key("s");
            w.value(n.s);
            w.key("sac");
            w.value(n.sac);
            w.key("asc");
            w.value(n.asc);
            w.key("declared");
            w.value(n.declared);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    } else if (method == "find-objects") {
        // Glob search over the elaborated design (tree search box + dp_shell get_* commands).
        FindResult fr = db.findObjects(pstr("pattern"), pstr("kinds"), 500);
        w.beginObject();
        w.key("objects");
        w.beginArray();
        for (auto& o : fr.objects) {
            w.beginObject();
            w.key("kind");
            w.value(o.kind);
            w.key("id");
            w.value(o.id);
            w.key("name");
            w.value(o.name);
            w.key("design");
            w.value(o.design);
            w.key("parent");
            w.value(o.parent);
            w.key("dir");
            w.value(o.dir);
            w.endObject();
        }
        w.endArray();
        w.key("scanned");
        w.value(fr.scanned);
        w.key("truncated");
        w.value(fr.truncated);
        w.endObject();
    } else if (method == "wrapper-cells") {
        // Pre-insertion wrapper-cell estimate for a core boundary — what sizes the EXTEST EDT.
        WrapperOptions wo;
        if (params) {
            auto num = [&](const char* k, int& dst) {
                if (const hdl::json::Value* v = params->find(k))
                    if (v->type == hdl::json::Value::Type::Int) dst = static_cast<int>(v->i);
            };
            auto flag = [&](const char* k, bool& dst) {
                if (const hdl::json::Value* v = params->find(k)) {
                    if (v->type == hdl::json::Value::Type::Bool) dst = v->b;
                    else if (v->type == hdl::json::Value::Type::Int) dst = v->i != 0;
                }
            };
            num("inputFanoutFlopThreshold", wo.inputFanoutFlopThreshold);
            num("outputFaninFlopThreshold", wo.outputFaninFlopThreshold);
            num("feedbackFlopThreshold", wo.feedbackFlopThreshold);
            num("levelsThreshold", wo.levelsThreshold);
            flag("registerUndrivenOutput", wo.registerUndrivenOutput);
            flag("registerPortsReachingBlackboxes", wo.registerPortsReachingBlackboxes);
            flag("logEveryPort", wo.logEveryPort);
            flag("inferClockPorts", wo.inferClockPorts);
            flag("skipFeedthroughPorts", wo.skipFeedthroughPorts);
            auto globs = [&](const char* k, std::vector<std::string>& dst) {
                if (const hdl::json::Value* a = params->find(k);
                    a && a->type == hdl::json::Value::Type::Array)
                    for (auto& e : a->arr)
                        if (e.type == hdl::json::Value::Type::Str && !e.s.empty())
                            dst.push_back(e.s);
            };
            globs("excludePorts", wo.excludePorts);
            globs("clockPorts", wo.clockPorts);
            globs("forceDedicatedPorts", wo.forceDedicatedPorts);
            globs("forceSharedPorts", wo.forceSharedPorts);
        }
        const bool wantRows = !phas("summary") || pstr("summary") != "1";
        // Keep the run's own transcript so a caller can show WHAT the analysis did, not just
        // what it concluded. Capped: a 4000-port block with logEveryPort on would otherwise
        // put megabytes of progress lines on the wire.
        std::vector<std::string> wlog;
        wo.log = [&](const std::string& line) {
            if (wlog.size() < 4000) wlog.push_back(line);
            else if (wlog.size() == 4000) wlog.push_back("… log truncated at 4000 lines");
        };
        WrapperEstimate we = db.wrapperCells(pstr("core"), wo);
        w.beginObject();
        w.key("core");
        w.value(we.core);
        w.key("inputBits");
        w.value(we.inputBits);
        w.key("outputBits");
        w.value(we.outputBits);
        w.key("sharedIn");
        w.value(we.sharedIn);
        w.key("sharedOut");
        w.value(we.sharedOut);
        w.key("dedicatedIn");
        w.value(we.dedicatedIn);
        w.key("dedicatedOut");
        w.value(we.dedicatedOut);
        w.key("noneIn");
        w.value(we.noneIn);
        w.key("noneOut");
        w.value(we.noneOut);
        w.key("wrapperIn");
        w.value(we.wrapperIn());
        w.key("wrapperOut");
        w.value(we.wrapperOut());
        w.key("wrapperCells");
        w.value(we.wrapperCells());
        w.key("addedScanCells");
        w.value(we.addedScanCells());
        w.key("coneNodes");
        w.value(static_cast<int>(we.coneNodes));
        w.key("analysisMs");
        w.value(static_cast<int>(we.analysisMs));
        w.key("cells");
        w.beginArray();
        if (wantRows)
            for (auto& c : we.cells) {
                w.beginObject();
                w.key("name");
                w.value(c.name);
                w.key("port");
                w.value(c.port);
                w.key("bit");
                w.value(c.bit);
                w.key("dir");
                w.value(c.dir);
                w.key("decision");
                w.value(c.decision);
                w.key("flops");
                w.value(c.flops);
                w.key("flopsFeedback");
                w.value(c.flopsFeedback);
                w.key("cell");
                w.value(c.cell);
                w.key("clock");
                w.value(c.clock);
                w.key("reason");
                w.value(c.reason);
                w.key("levels");
                w.value(c.levels);
                w.key("candidates");
                w.beginArray();
                for (auto& cd : c.candidates) {
                    w.beginObject();
                    w.key("label");
                    w.value(cd.label);
                    w.key("instance");
                    w.value(cd.instance);
                    w.endObject();
                }
                w.endArray();
                w.endObject();
            }
        w.endArray();
        w.key("log");
        w.beginArray();
        for (auto& l : wlog) w.value(l);
        w.endArray();
        w.endObject();
    } else if (method == "wrapper-cone") {
        // The traced cone behind ONE port bit — the same walk as wrapper-cells with its route
        // kept, so the picture is of the decision the table shows and not of a second analysis.
        WrapperOptions wo;
        if (params) {
            auto num = [&](const char* k, int& dst) {
                if (const hdl::json::Value* v = params->find(k))
                    if (v->type == hdl::json::Value::Type::Int) dst = static_cast<int>(v->i);
            };
            auto flag = [&](const char* k, bool& dst) {
                if (const hdl::json::Value* v = params->find(k)) {
                    if (v->type == hdl::json::Value::Type::Bool) dst = v->b;
                    else if (v->type == hdl::json::Value::Type::Int) dst = v->i != 0;
                }
            };
            auto globs = [&](const char* k, std::vector<std::string>& dst) {
                if (const hdl::json::Value* a2 = params->find(k);
                    a2 && a2->type == hdl::json::Value::Type::Array)
                    for (auto& e : a2->arr)
                        if (e.type == hdl::json::Value::Type::Str && !e.s.empty())
                            dst.push_back(e.s);
            };
            num("inputFanoutFlopThreshold", wo.inputFanoutFlopThreshold);
            num("outputFaninFlopThreshold", wo.outputFaninFlopThreshold);
            num("feedbackFlopThreshold", wo.feedbackFlopThreshold);
            num("levelsThreshold", wo.levelsThreshold);
            flag("registerUndrivenOutput", wo.registerUndrivenOutput);
            flag("registerPortsReachingBlackboxes", wo.registerPortsReachingBlackboxes);
            flag("inferClockPorts", wo.inferClockPorts);
            flag("skipFeedthroughPorts", wo.skipFeedthroughPorts);
            globs("excludePorts", wo.excludePorts);
            globs("clockPorts", wo.clockPorts);
            globs("forceDedicatedPorts", wo.forceDedicatedPorts);
            globs("forceSharedPorts", wo.forceSharedPorts);
        }
        int bit = 0;
        if (params)
            if (const hdl::json::Value* v = params->find("bit");
                v && v->type == hdl::json::Value::Type::Int)
                bit = static_cast<int>(v->i);
        WrapperCone wc = db.wrapperCone(pstr("core"), pstr("port"), bit, wo);
        w.beginObject();
        w.key("core");
        w.value(wc.core);
        w.key("port");
        w.value(wc.port);
        w.key("name");
        w.value(wc.name);
        w.key("bit");
        w.value(wc.bit);
        w.key("dir");
        w.value(wc.dir);
        w.key("decision");
        w.value(wc.decision);
        w.key("reason");
        w.value(wc.reason);
        w.key("cell");
        w.value(wc.cell);
        w.key("truncated");
        w.value(wc.truncated);
        w.key("nodes");
        w.beginArray();
        for (auto& n : wc.nodes) {
            w.beginObject();
            w.key("id");
            w.value(n.id);
            w.key("kind");
            w.value(n.kind);
            w.key("elem");
            w.value(n.elem);
            w.key("detail");
            w.value(n.detail);
            w.key("label");
            w.value(n.label);
            w.key("instance");
            w.value(n.instance);
            w.key("scope");
            w.value(n.scope);
            w.key("clock");
            w.value(n.clock);
            w.key("level");
            w.value(n.level);
            w.endObject();
        }
        w.endArray();
        w.key("edges");
        w.beginArray();
        for (auto& e : wc.edges) {
            w.beginObject();
            w.key("from");
            w.value(e.from);
            w.key("to");
            w.value(e.to);
            w.endObject();
        }
        w.endArray();
        w.endObject();
    } else if (method == "scan-budget") {
        // The SpecGen canvas sizes an EDT node from the live design through this: it sends a
        // one-controller plan and gets back the four numbers plus the reasons behind them.
        ScanBudgetOptions bo =
            params ? scanBudgetOptionsFromJson(*params) : ScanBudgetOptions{};
        std::vector<std::string> blog;
        bo.log = [&](const std::string& line) {
            if (blog.size() < 4000) blog.push_back(line);
            else if (blog.size() == 4000) blog.push_back("… log truncated at 4000 lines");
        };
        ScanBudgetResult br = computeScanBudget(db, bo);
        w.beginObject();
        w.key("core");
        w.value(br.core);
        w.key("coreRegisterBits");
        w.value(static_cast<int>(br.coreRegisterBits));
        w.key("occBits");
        w.value(static_cast<int>(br.occBits));
        w.key("hyperBits");
        w.value(static_cast<int>(br.hyperBits));
        w.key("nonscanBits");
        w.value(static_cast<int>(br.nonscanBits));
        w.key("wrapperIn");
        w.value(br.wrapperIn);
        w.key("wrapperOut");
        w.value(br.wrapperOut);
        w.key("unassignedBits");
        w.value(static_cast<int>(br.unassignedBits));
        w.key("edtSpec");
        w.value(br.edtSpec);
        w.key("scanTcl");
        w.value(br.scanTcl);
        w.key("errors");
        w.beginArray();
        for (auto& e : br.errors) w.value(e);
        w.endArray();
        w.key("notes");
        w.beginArray();
        for (auto& n : br.notes) w.value(n);
        w.endArray();
        w.key("edts");
        w.beginArray();
        for (auto& b : br.edts) {
            w.beginObject();
            w.key("name");
            w.value(b.name);
            w.key("external");
            w.value(b.external);
            w.key("cells");
            w.value(static_cast<int>(b.cells()));
            w.key("cellsCore");
            w.value(static_cast<int>(b.cellsCore));
            w.key("cellsOcc");
            w.value(static_cast<int>(b.cellsOcc));
            w.key("cellsHyper");
            w.value(static_cast<int>(b.cellsHyper));
            w.key("cellsWrapper");
            w.value(static_cast<int>(b.cellsWrapper));
            w.key("channels");
            w.value(b.channels);
            w.key("chainCount");
            w.value(b.chainCount);
            w.key("achievedLength");
            w.value(b.achievedLength);
            w.key("longestMin");
            w.value(b.longestMin);
            w.key("longestMax");
            w.value(b.longestMax);
            w.key("compression");
            w.value(static_cast<int>(b.compression));
            w.key("warnings");
            w.beginArray();
            for (auto& x : b.warnings) w.value(x);
            w.endArray();
            w.key("eabAdvice");
            w.beginArray();
            for (auto& x : b.eabAdvice) w.value(x);
            w.endArray();
            w.key("occChainRatio");
            w.value(static_cast<int>(b.occChainRatio * 100));
            w.endObject();
        }
        w.endArray();
        w.key("log");
        w.beginArray();
        for (auto& l : blog) w.value(l);
        w.endArray();
        w.endObject();
    } else if (method == "trace-net" || method == "trace-net-loads") {
        // trace-net: behavioral drivers of an internal net (net taps trace backward).
        // trace-net-loads: ALL its loads — child-instance pins, readers, boundary exit — so a
        // net's forward trace continues past a logic node instead of dead-ending.
        DriversResult dr = method == "trace-net"
            ? db.traceNet(pstr("nodeId"), pstr("net"))
            : db.traceNetLoads(pstr("nodeId"), pstr("net"));
        w.beginObject();
        w.key("sources");
        w.beginArray();
        for (auto& s : dr.sources) {
            w.beginObject();
            w.key("kind");
            w.value(s.kind);
            w.key("id");
            w.value(s.id);
            w.key("label");
            w.value(s.label);
            w.key("detail");
            w.value(s.detail);
            w.key("shape");
            w.value(s.shape);
            w.key("drives");
            w.value(s.drives);
            w.key("reads");
            w.beginArray();
            for (auto& rd : s.reads) w.value(rd);
            w.endArray();
            w.key("net");
            w.value(s.net);
            w.key("file");
            w.value(s.file);
            w.key("line");
            w.value(s.line);
            w.key("bus");
            w.value(s.bus);
            w.endObject();
        }
        w.endArray();
        w.key("netName");
        w.value(dr.netName);
        w.key("bus");
        w.value(dr.bus);
        w.endObject();
    } else if (method == "clock-reset-tree") {
        // DFT clock/reset structure: every flop's clock + async-reset path to its source, with
        // the X/Z/010 value calculus from the SDC (param sdcFile may be "").
        // Optional SCAN-MODE dimension: occPoints = ["top/u/gck", …] (user-declared, never
        // inferred) and forces = [{"pin":"scan_enable","value":1}, …].
        ScanModeInput scan;
        if (params) {
            if (const hdl::json::Value* op = params->find("occPoints");
                op && op->type == hdl::json::Value::Type::Array)
                for (auto& e : op->arr)
                    if (e.type == hdl::json::Value::Type::Str && !e.s.empty())
                        scan.occPoints.push_back(e.s);
            if (const hdl::json::Value* fo = params->find("scanForces");
                fo && fo->type == hdl::json::Value::Type::Array)
                for (auto& e : fo->arr) {
                    const std::string pin = e.str("pin");
                    if (pin.empty()) continue;
                    const hdl::json::Value* v = e.find("value");
                    scan.forces.emplace_back(pin, !(v && v->type == hdl::json::Value::Type::Int && v->i == 0));
                }
        }
        // Hierarchical on-demand query: `scope` limits the analysis to one subtree and
        // `summary` returns the per-child roll-up instead of every group's full path.
        CrQuery q;
        q.scope = pstr("scope");
        // User pin constraints (dp_shell add_pin_constraint, 0/1 only) applied to the
        // FUNCTIONAL value calculus: pinConstraints = [{"pin":"top/rst_n","value":"0"}, …].
        if (params)
            if (const hdl::json::Value* pcs = params->find("pinConstraints");
                pcs && pcs->type == hdl::json::Value::Type::Array)
                for (auto& e : pcs->arr) {
                    const std::string pin = e.str("pin");
                    const std::string val = e.str("value");
                    if (pin.empty() || (val != "0" && val != "1")) continue;
                    q.pinConstraints.emplace_back(pin, val == "1" ? 1 : 0);
                }
        if (params)
            if (const hdl::json::Value* sm = params->find("summary"))
                q.summary = (sm->type == hdl::json::Value::Type::Bool && sm->b) ||
                            (sm->type == hdl::json::Value::Type::Int && sm->i != 0);
        // Anything the request did NOT state comes from the session's dp_shell. That is what
        // makes `add_pin_constraint reset_n 1` in the console change the values this view draws,
        // instead of the console and the view holding two different ideas of the same plan. A
        // request that states its own list still wins — an explicit ask is never overridden.
        {
            DpShell* sh = sessionShell(db);
            if (q.pinConstraints.empty())
                for (const auto& [pin, v] : sh->drcPinConstraints()) q.pinConstraints.emplace_back(pin, v);
            if (scan.occPoints.empty()) scan.occPoints = sh->drcOccPoints();
            if (scan.forces.empty())
                for (const auto& [n, v] : sh->drcForces()) scan.forces.emplace_back(n, v);
            // Planned muxes make their targets controllable in test — that is what the plan is
            // FOR, so the analysis answers "will this fix it" rather than only "is it broken".
            if (q.plannedMuxes.empty())
                for (const auto& [t, v] : sh->drcPlannedMuxes())
                    q.plannedMuxes.push_back({t, v});
        }
        ClockResetTreeResult cr = db.clockResetTree(pstr("sdcFile"), pstr("dftLibSetting"), scan, q);
        // THREE-PHASE values (param phases:true): the reset state the schematic labels as
        // s()-sac()/asc(). Two more walks with each phase's set_phase_constraint overlay; the
        // items enumerate in the same order, so they align by index.
        std::vector<std::string> sacVals, ascVals;
        bool phases = false;
        if (params)
            if (const hdl::json::Value* pv = params->find("phases"))
                phases = (pv->type == hdl::json::Value::Type::Bool && pv->b) ||
                         (pv->type == hdl::json::Value::Type::Int && pv->i != 0);
        if (phases) {
            DpShell* sh = sessionShell(db);
            const auto phase = [&](const char* ph) {
                CrQuery pq = sh->drcPhaseQuery(ph);
                pq.scope = q.scope;
                pq.summary = q.summary;
                ClockResetTreeResult r =
                    db.clockResetTree(pstr("sdcFile"), pstr("dftLibSetting"), scan, pq);
                std::vector<std::string> vals;
                vals.reserve(r.items.size());
                for (auto& it : r.items) vals.push_back(it.value);
                return vals;
            };
            sacVals = phase("sac");
            ascVals = phase("asc");
        }
        w.beginObject();
        w.key("items");
        w.beginArray();
        std::size_t idx = 0;
        for (auto& i : cr.items) {
            const std::size_t curIdx = idx++;
            w.beginObject();
            w.key("kind");
            w.value(i.kind);
            w.key("owner");
            w.value(i.ownerInstanceId);
            w.key("net");
            w.value(i.net);
            w.key("edge");
            w.value(i.edge);
            w.key("path");
            w.beginArray();
            for (auto& p : i.path) w.value(p);
            w.endArray();
            w.key("elems");
            w.beginArray();
            for (auto& e : i.elems) w.value(e);
            w.endArray();
            w.key("terminus");
            w.value(i.terminus);
            w.key("detail");
            w.value(i.detail);
            w.key("terminusFile");
            w.value(i.terminusFile);
            w.key("terminusLine");
            w.value(i.terminusLine);
            w.key("clockName");
            w.value(i.clockName);
            w.key("rootValue");
            w.value(i.rootValue);
            w.key("value");
            w.value(i.value);
            w.key("inactive");
            w.value(i.inactive);
            w.key("set");
            w.value(i.set);
            w.key("ok");
            w.value(i.ok);
            // Passes only BECAUSE of a planned mux — the plan is not the netlist, and the UI has
            // to be able to say which one it is showing.
            w.key("plannedFix");
            w.value(i.plannedFix);
            w.key("plannedMuxTarget");
            w.value(i.plannedMuxTarget);
            // Odd inversion count between the flop and the source. A value forced AT THE SOURCE
            // arrives flipped — which decides whether a planned mux holds this reset inactive or
            // holds it asserted, so the planner needs it, not just the analysis.
            w.key("inverted");
            w.value(i.inverted);
            if (curIdx < sacVals.size()) {
                w.key("sacValue");
                w.value(sacVals[curIdx]);
            }
            if (curIdx < ascVals.size()) {
                w.key("ascValue");
                w.value(ascVals[curIdx]);
            }
            w.key("flopCount");
            w.value(i.flopCount);
            w.key("file");
            w.value(i.file);
            w.key("line");
            w.value(i.line);
            // scan-mode dimension (all defaults when no ScanModeInput was supplied)
            w.key("scanChecked");
            w.value(i.scanChecked);
            w.key("scanValue");
            w.value(i.scanValue);
            w.key("scanTerminus");
            w.value(i.scanTerminus);
            w.key("scanDetail");
            w.value(i.scanDetail);
            w.key("scanOcc");
            w.value(i.scanOcc);
            w.key("scanOccPoint");
            w.value(i.scanOccPoint);
            w.endObject();
        }
        w.endArray();
        w.key("clocks");
        w.beginArray();
        for (auto& c : cr.clocks) {
            w.beginObject();
            w.key("name");
            w.value(c.name);
            w.key("targets");
            w.beginArray();
            for (auto& t : c.targets) w.value(t);
            w.endArray();
            w.key("period");
            w.value(c.period);
            w.key("generated");
            w.value(c.generated);
            w.key("masterClock");
            w.value(c.masterClock);
            w.key("masterInferred");
            w.value(c.masterInferred);
            w.key("frequencyMhz");
            w.value(c.frequencyMhz);
            w.key("file");
            w.value(c.file);
            w.key("line");
            w.value(c.line);
            w.endObject();
        }
        w.endArray();
        w.key("sdcErrors");
        w.beginArray();
        for (auto& e : cr.sdcErrors) w.value(e);
        w.endArray();
        w.key("scopes");
        w.beginArray();
        for (auto& s : cr.scopes) {
            w.beginObject();
            w.key("instanceId");
            w.value(s.instanceId);
            w.key("groups");
            w.value(s.groups);
            w.key("flopBits");
            w.value(static_cast<double>(s.flopBits));
            w.key("violations");
            w.value(s.violations);
            w.key("hasChildren");
            w.value(s.hasChildren);
            w.endObject();
        }
        w.endArray();
        w.key("totalGroups");
        w.value(cr.totalGroups);
        w.key("totalFlopBits");
        w.value(static_cast<double>(cr.totalFlopBits));
        w.endObject();
    } else if (method == "sdc-lint") {
        // Check an SDC file. `dialects` is a comma list (generic,dc,genus); omitted = all three.
        // `design` (default true) enumerates the elaborated hierarchy so get_ports/get_pins
        // patterns can be resolved for real — that is the difference between "this parses" and
        // "this will do something on THIS netlist".
        sdc::LintOptions opt;
        const std::string dial = pstr("dialects");
        if (!dial.empty()) {
            unsigned m = 0;
            std::string t;
            for (size_t i = 0; i <= dial.size(); ++i) {
                if (i == dial.size() || dial[i] == ',') {
                    if (t == "generic" || t == "sdc") m |= sdc::kGeneric;
                    else if (t == "dc" || t == "pt" || t == "synopsys") m |= sdc::kDcPt;
                    else if (t == "genus" || t == "cadence") m |= sdc::kGenus;
                    else if (t == "all") m |= sdc::kAll;
                    t.clear();
                } else {
                    t += dial[i];
                }
            }
            if (m) opt.dialects = m;
        }
        bool wantDesign = true;
        if (params)
            if (const hdl::json::Value* d = params->find("design"))
                wantDesign = !((d->type == hdl::json::Value::Type::Bool && !d->b) ||
                               (d->type == hdl::json::Value::Type::Int && d->i == 0));

        sdc::DesignObjects objs;
        bool partial = false;
        if (wantDesign) {
            SdcObjectSet s = db.sdcObjects();
            // A truncated inventory would make real objects look missing, so drop to
            // syntax-only rather than emit confident-but-wrong "matches nothing" errors.
            if (s.truncated) partial = true;
            else {
                objs.ports = std::move(s.ports);
                objs.inputs = std::move(s.inputs);
                objs.outputs = std::move(s.outputs);
                objs.pins = std::move(s.pins);
                objs.nets = std::move(s.nets);
                objs.cells = std::move(s.cells);
            }
        }
        opt.designAware = wantDesign && !partial;

        const std::string file = pstr("sdcFile");
        const std::string text = pstr("sdcText");
        const sdc::LintReport rep =
            text.empty() ? sdc::lintFile(file, opt, objs)
                         : sdc::lintText(text, file.empty() ? "(editor)" : file, opt, objs);
        // Same parse pass sdc-lint already ran, so no re-parsing: master-clock inference,
        // generated-clock period resolution, and Tessent add_clock/clock-mapping command
        // generation (gen_dft.pl's parse_sdc_to_yaml, ported onto the design-validated clock
        // list rather than re-parsing the SDC with a second tokenizer).
        const sdc::ClockGenResult gen = sdc::generateClocks(rep.clocks);
        w.beginObject();
        w.key("findings");
        w.beginArray();
        for (const sdc::Finding& f : rep.findings) {
            w.beginObject();
            w.key("rule");     w.value(f.rule);
            w.key("severity"); w.value(sdc::severityName(f.severity));
            w.key("file");     w.value(f.file);
            w.key("line");     w.value(f.line);
            w.key("column");   w.value(f.column);
            w.key("command");  w.value(f.command);
            w.key("message");  w.value(f.message);
            w.key("hint");     w.value(f.hint);
            w.endObject();
        }
        w.endArray();
        w.key("summary");
        w.beginObject();
        w.key("commands");        w.value(rep.summary.commands);
        w.key("clocks");          w.value(rep.summary.clocks);
        w.key("generatedClocks"); w.value(rep.summary.generatedClocks);
        w.key("exceptions");      w.value(rep.summary.exceptions);
        w.key("ioDelays");        w.value(rep.summary.ioDelays);
        w.key("designAware");     w.value(rep.summary.designAware);
        w.key("tclAvailable");    w.value(rep.summary.tclAvailable);
        w.key("designTruncated"); w.value(partial);
        w.key("errors");          w.value(rep.count(sdc::Severity::Error));
        w.key("warnings");        w.value(rep.count(sdc::Severity::Warning));
        w.endObject();
        w.key("resolvedClocks");
        w.beginArray();
        for (const sdc::GeneratedClock& g : gen.clocks) {
            w.beginObject();
            w.key("name");               w.value(g.name);
            w.key("generated");          w.value(g.generated);
            w.key("period");             w.value(g.period);
            w.key("frequencyMhz");       w.value(g.frequencyMhz);
            w.key("masterClock");        w.value(g.masterClock);
            w.key("masterInferred");     w.value(g.masterInferred);
            w.key("targets");
            w.beginArray();
            for (const std::string& t : g.targets) w.value(t);
            w.endArray();
            w.key("tessentClockMappingCmd"); w.value(g.tessentClockMappingCmd);
            w.key("file");                w.value(g.file);
            w.key("line");                w.value(g.line);
            w.endObject();
        }
        w.endArray();
        w.key("addClockCmds");
        w.beginArray();
        for (const sdc::AddClockCmd& ac : gen.addClockCmds) {
            w.beginObject();
            w.key("clockName");  w.value(ac.clockName);
            w.key("objectExpr"); w.value(ac.objectExpr);
            w.key("label");      w.value(ac.label);
            w.key("text");       w.value(ac.text);
            w.key("commented");  w.value(ac.commented);
            w.key("reason");     w.value(ac.reason);
            w.endObject();
        }
        w.endArray();
        w.key("tessentMappingCmds");
        w.beginArray();
        for (const std::string& s : gen.tessentMappingCmds) w.value(s);
        w.endArray();
        w.key("clockgenWarnings");
        w.beginArray();
        for (const std::string& s : gen.warnings) w.value(s);
        w.endArray();
        w.endObject();
    } else if (method == "decompose-logic") {
        // P2: RTL primitives (gates/mux/DFF) of a behavioral block.
        DecomposeResult dc = db.decomposeLogic(pstr("id"));
        w.beginObject();
        w.key("cells");
        w.beginArray();
        for (auto& c : dc.cells) {
            w.beginObject();
            w.key("id");
            w.value(c.id);
            w.key("kind");
            w.value(c.kind);
            w.key("label");
            w.value(c.label);
            w.key("outName");
            w.value(c.outName);
            w.key("width");
            w.value(c.width);
            w.key("line");
            w.value(c.line);
            w.key("inputs");
            w.beginArray();
            for (auto& p : c.inputs) {
                w.beginObject();
                w.key("name");
                w.value(p.name);
                w.key("ref");
                w.value(p.ref);
                w.endObject();
            }
            w.endArray();
            w.endObject();
        }
        w.endArray();
        w.key("inputs");
        w.beginArray();
        for (auto& s : dc.inputs) w.value(s);
        w.endArray();
        w.key("outputs");
        w.beginArray();
        for (auto& s : dc.outputs) w.value(s);
        w.endArray();
        w.key("file");
        w.value(dc.file);
        w.key("line");
        w.value(dc.line);
        w.key("blockKind");
        w.value(dc.blockKind);
        w.key("truncated");
        w.value(dc.truncated);
        w.endObject();
    } else if (method == "trace-into") {
        TraceIntoResult tr = db.traceInto(pstr("nodeId"), pstr("port"));
        w.beginObject();
        w.key("edges");
        w.beginArray();
        for (auto& e : tr.edges) {
            w.beginObject();
            w.key("fromNode");
            w.value(e.fromNode);
            w.key("fromPort");
            w.value(e.fromPort);
            w.key("toNode");
            w.value(e.toNode);
            w.key("toPort");
            w.value(e.toPort);
            w.key("netName");
            w.value(e.netName);
            w.key("bus");
            w.value(e.bus);
            w.endObject();
        }
        w.endArray();
        w.key("nodes");
        w.beginArray();
        for (auto& m : tr.nodes) writeMeta(w, m, false);
        w.endArray();
        w.key("sources");
        w.beginArray();
        for (auto& s : tr.sources) {
            w.beginObject();
            w.key("kind");
            w.value(s.kind);
            w.key("id");
            w.value(s.id);
            w.key("label");
            w.value(s.label);
            w.key("detail");
            w.value(s.detail);
            w.key("shape");
            w.value(s.shape);
            w.key("drives");
            w.value(s.drives);
            w.key("reads");
            w.beginArray();
            for (auto& rd : s.reads) w.value(rd);
            w.endArray();
            w.key("net");
            w.value(s.net);
            w.key("file");
            w.value(s.file);
            w.key("line");
            w.value(s.line);
            w.key("bus");
            w.value(s.bus);
            w.endObject();
        }
        w.endArray();
        w.key("netName");
        w.value(tr.netName);
        w.key("bus");
        w.value(tr.bus);
        w.key("truncated");
        w.value(tr.truncated);
        w.endObject();
    } else if (method == "get-sequential") {
        const std::vector<SeqElement>& seq = db.getSequential();
        auto writeEvents = [&](const char* key, const std::vector<SeqEvent>& evs) {
            w.key(key);
            w.beginArray();
            for (auto& e : evs) {
                w.beginObject();
                w.key("net");
                w.value(e.net);
                w.key("edge");
                w.value(e.edge);
                w.endObject();
            }
            w.endArray();
        };
        w.beginObject();
        w.key("sequential");
        w.beginArray();
        for (auto& s : seq) {
            w.beginObject();
            w.key("ownerInstanceId");
            w.value(s.ownerInstanceId);
            w.key("file");
            w.value(s.file);
            w.key("line");
            w.value(s.line);
            writeEvents("clocks", s.clocks);
            writeEvents("asyncResets", s.asyncResets);
            w.endObject();
        }
        w.endArray();
        w.key("count");
        w.value(static_cast<int>(seq.size()));
        w.endObject();
    } else if (method == "get-register-count") {
        RegCountResult rc = db.getRegisterCounts();
        w.beginObject();
        w.key("counts");
        w.beginArray();
        for (auto& c : rc.counts) {
            w.beginObject();
            w.key("instanceId");
            w.value(c.instanceId);
            w.key("own");
            w.value(c.own);
            w.key("subtree");
            w.value(c.subtree);
            w.key("memoryBits");
            w.value(c.memoryBits);
            w.endObject();
        }
        w.endArray();
        w.key("total");
        w.value(rc.total);
        w.endObject();
    } else if (method == "trace-source") {
        NetSourceResult ns = db.traceNetToSource(pstr("instanceId"), pstr("netName"));
        w.beginObject();
        w.key("terminus");
        w.value(ns.terminus);
        w.key("detail");
        w.value(ns.detail);
        w.key("path");
        w.beginArray();
        for (auto& s : ns.path) w.value(s);
        w.endArray();
        w.endObject();
    } else {
        throw std::out_of_range("unknown method " + method);
    }
}

}  // namespace

std::string runQuery(DesignDb& db, const std::string& method,
                     const std::vector<std::pair<std::string, std::string>>& params) {
    hdl::json::Value pv;
    pv.type = hdl::json::Value::Type::Object;
    for (auto& [k, v] : params) {
        hdl::json::Value sv;
        sv.type = hdl::json::Value::Type::Str;
        sv.s = v;
        pv.obj.emplace_back(k, sv);
    }
    JsonWriter w;
    dispatch(w, db, method, &pv);
    return w.str();
}

std::string candidateTopsJson(DesignDb& db) {
    ReadyInfo info = db.ready();
    JsonWriter w;
    w.beginArray();
    for (auto& m : info.candidateTops) writeMeta(w, m, true);
    w.endArray();
    return w.str();
}

std::string readyEventLine(DesignDb& db) {
    ReadyInfo info = db.ready();
    JsonWriter w;
    w.beginObject();
    w.key("id");
    w.valueNull();
    w.key("event");
    w.value("ready");
    w.key("candidateTops");
    w.beginArray();
    for (auto& m : info.candidateTops) writeMeta(w, m, true);
    w.endArray();
    w.key("defCount");
    w.value(info.defCount);
    w.endObject();
    return w.str();
}

std::string handleRequest(DesignDb& db, const std::string& line) {
    hdl::json::Value req;
    bool parsed = true;
    try {
        req = hdl::json::parse(line);
    } catch (const std::exception& e) {
        parsed = false;
        JsonWriter w;
        w.beginObject();
        w.key("id");
        w.valueNull();
        w.key("error");
        w.beginObject();
        w.key("code");
        w.value("bad-json");
        w.key("message");
        w.value(std::string(e.what()));
        w.endObject();
        w.endObject();
        return w.str();
    }
    (void)parsed;

    std::string method = req.str("method");
    const hdl::json::Value* params = req.find("params");

    JsonWriter w;
    w.beginObject();
    w.key("id");
    writeId(w, &req);
    try {
        w.key("result");
        dispatch(w, db, method, params);
    } catch (const std::logic_error& e) {
        // reset: rebuild as error (the writer already has id+result-start, so build fresh)
        JsonWriter ew;
        ew.beginObject();
        ew.key("id");
        writeId(ew, &req);
        ew.key("error");
        ew.beginObject();
        ew.key("code");
        ew.value("not-implemented");
        ew.key("message");
        ew.value(std::string(e.what()));
        ew.endObject();
        ew.endObject();
        return ew.str();
    } catch (const std::exception& e) {
        JsonWriter ew;
        ew.beginObject();
        ew.key("id");
        writeId(ew, &req);
        ew.key("error");
        ew.beginObject();
        ew.key("code");
        ew.value("error");
        ew.key("message");
        ew.value(std::string(e.what()));
        ew.endObject();
        ew.endObject();
        return ew.str();
    }
    w.endObject();
    return w.str();
}

int runStdioServer(DesignDb& db) {
    std::ios::sync_with_stdio(false);
    std::cout << readyEventLine(db) << "\n" << std::flush;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::cout << handleRequest(db, line) << "\n" << std::flush;
    }
    return 0;
}

}  // namespace hdl::protocol
