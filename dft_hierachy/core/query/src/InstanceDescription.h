#pragma once
#include "QueryCancel.h"
#include "hier/db/DesignDb.h"
#include <string_view>

namespace hier::detail {
// Path-independent declaration fields. The name view borrows the DB frontend
// only during synchronous projection; public InstInfo still owns its strings.
struct InstanceSummary {
    uint32_t definition = 0;
    std::string_view definitionName;
    model::InstKind kind = model::InstKind::Module;
    uint32_t childCount = 0;
    bool hasParamOverrides = false;
};

inline InstanceSummary instanceSummary(const db::DesignDb &db, const db::Located &at,
                                        Cancel cancel) {
    InstanceSummary result;
    if (at.steps.empty()) {
        const auto &skeleton = *checked(db.skeleton(at.body, cancel));
        result.definition = skeleton.def;
        result.kind = skeleton.kind;
    } else {
        const auto &slot = *at.steps.back().slot;
        result.definition = slot.def;
        result.kind = slot.kind;
        result.hasParamOverrides = !slot.overriddenParams.empty();
    }
    result.definitionName = db.frontend().definitions()[result.definition].name;
    if (at.body != model::kNoBody)
        result.childCount = uint32_t(checked(db.skeleton(at.body, cancel))->slots.size());
    return result;
}

inline std::string instanceSegmentText(const std::string &name, const std::vector<int32_t> &index) {
    std::string text = name;
    for (int32_t i : index)
        text += "[" + std::to_string(i) + "]";
    return text;
}

inline void startInstancePath(const db::DesignDb &db, uint32_t top, model::InstInfo &info) {
    const auto &name = db.frontend().tops()[top].name;
    info.path = {name};
    info.pathText = model::escapeSegment(name);
}

// The path contribution of one step: outer generate scopes, then the slot.
inline void appendInstanceStep(const db::DesignDb &db, const db::Located::Step &step,
                               model::InstInfo &info, Cancel cancel) {
    const auto &scopes = checked(db.skeleton(step.parentBody, cancel))->scopes;
    std::vector<int32_t> chain;
    for (int32_t s = step.slot->scope; s >= 0; s = scopes[size_t(s)].parent) {
        checkpoint(cancel);
        chain.push_back(s);
    }
    for (auto it = chain.rbegin(); it != chain.rend(); ++it) {
        checkpoint(cancel);
        const auto &scope = scopes[size_t(*it)];
        info.path.push_back(instanceSegmentText(scope.name, scope.arrayIndex));
        info.pathText += "." + model::escapeSegment(scope.name, scope.arrayIndex);
    }
    info.path.push_back(instanceSegmentText(step.slot->name, step.slot->arrayIndex));
    info.pathText += "." + model::escapeSegment(step.slot->name, step.slot->arrayIndex);
}

inline void completeInstanceDescription(const db::DesignDb &db, const model::InstKey &key,
                                        const db::Located &at, model::InstInfo &info, Cancel cancel) {
    info.ref = model::instRef(key);
    info.name = info.path.back();
    const auto summary = instanceSummary(db, at, cancel);
    info.kind = summary.kind;
    info.childCount = summary.childCount;
    info.hasParamOverrides = summary.hasParamOverrides;
    info.def = model::defRef(summary.definition);
    info.defName = summary.definitionName;
}

inline model::InstInfo describeInstance(const db::DesignDb &db, const model::InstKey &key,
                                       const db::Located &at, Cancel cancel = {}) {
    checkpoint(cancel);
    model::InstInfo info;
    startInstancePath(db, at.top, info);
    for (const auto &step : at.steps)
        appendInstanceStep(db, step, info, cancel);
    completeInstanceDescription(db, key, at, info, cancel);
    return info;
}
} // namespace hier::detail
