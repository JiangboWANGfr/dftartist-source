#pragma once
#include "Check.h"
#include "hier/protocol/Json.h"
namespace dft::sequential {
using hier::protocol::JsonWriter;
using hier::protocol::write;
inline void writeLogicValue(JsonWriter &w, const dft::sequential::LogicValue &value, bool rooted) {
    w.beginObject().key("verdict").value(value.verdict);
    if (value.origin) { w.key("origin"); write(w, *value.origin); }
    if (value.sourceRef) w.key("sourceRef").value(*value.sourceRef);
    if (value.value) w.key("value").value(*value.value);
    w.key("inversions").value(value.inversions);
    if (rooted && value.gate) w.key("gate").value(*value.gate);
    w.endObject();
}
inline void writeLogicProof(JsonWriter &w,const LogicProof &proof,bool rooted,bool conditional) {
    const auto &value = proof.result;
    w.beginObject().key("result"); writeLogicValue(w, value, rooted);
    w.key("work").value(proof.work).key("reasons"); write(w, proof.reasons);
    w.key("steps").beginArray();
    for (const auto &step : proof.steps) {
        w.beginObject().key("point"); write(w, step.point);
        w.key("response"); write(w, step.response); w.endObject();
    }
    w.endArray().key("processes").beginArray();
    for (const auto &process : proof.processes) write(w, process);
    w.endArray();
    if (rooted || conditional) {
        w.key("gates").beginArray();
        for (const auto &gate : proof.gates) {
            w.beginObject().key("op").value(gate.op).key("process").value(gate.process);
            w.key("point"); write(w, gate.point);
            w.key("exprPath").beginArray();
            for (const auto part : gate.exprPath) w.value(part);
            w.endArray().key("bit").value(gate.bit).key("clock"); writeLogicValue(w, gate.clock, true);
            w.key("enable"); writeLogicValue(w, gate.enable, true); w.endObject();
        }
        w.endArray();
    }
    if (conditional) {
        w.key("appliedInputs").beginArray();
        for (const auto input : proof.appliedInputs) w.value(input);
        w.endArray();
    }
    w.endObject();
}
}
