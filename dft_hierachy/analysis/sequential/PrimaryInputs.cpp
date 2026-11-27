#include "PrimaryInputs.h"
#include <map>

namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> value) {
    if (!value) throw value.error();
    return std::move(value.value());
}
void checkpoint(Cancel cancel) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, "Primary input resolution cancelled"};
}
}
hier::Result<std::vector<PrimaryInputBit>> resolvePrimaryInputs(
    hier::Design &design, const std::vector<PrimaryInputRequest> &inputs, const std::set<std::string> &tops,
    std::chrono::steady_clock::time_point deadline, hier::Cancel cancel, InputPurpose purpose) try {
    const std::string label = purpose == InputPurpose::ClockRoot ? "Clock root" : "Input value";
    if (inputs.size() > 64) return Error{ErrorCode::BadRequest, "At most 64 primary input bits"};
    std::set<std::pair<std::string, uint64_t>> bits;
    std::map<std::string, std::vector<PortInfo>> ports;
    std::vector<PrimaryInputBit> result;
    for (const auto &input : inputs) {
        checkpoint(cancel);
        if (std::chrono::steady_clock::now() >= deadline)
            return Error{ErrorCode::Unsupported, label + " resolution exceeded analysis deadline"};
        const auto resolved = take(design.resolvePath(input.path, cancel));
        if (resolved.completeness.status != "complete")
            return Error{ErrorCode::Unsupported, label + " resolution is incomplete"};
        if (resolved.result.empty()) return Error{ErrorCode::NotFound, label + " was not found"};
        std::vector<PrimaryInputBit> matches;
        for (const auto &ref : resolved.result) {
            const auto object = take(design.object(ref, cancel));
            if (object.kind != "port" || !tops.contains(object.inst)) continue;
            auto found = ports.find(object.inst);
            if (found == ports.end()) found = ports.emplace(object.inst, take(design.ports(object.inst, cancel))).first;
            for (const auto &port : found->second) {
                checkpoint(cancel);
                if (port.ref != ref) continue;
                if (port.kind != PortKind::Port || port.direction != Direction::In || input.bit >= port.width)
                    return Error{ErrorCode::BadRequest, label + " requires an in-range top input port bit"};
                matches.push_back({{{ref, {input.bit, 1}}, "inside"}, object.pathText});
            }
        }
        // The public path may also name the port's internal signal. Only the
        // unique top input port is authoritative, never an inferred wire alias.
        if (matches.size() != 1) return Error{ErrorCode::BadRequest, label + " must identify one top input port"};
        if (!bits.emplace(matches.front().point.slice.ref, input.bit).second)
            return Error{ErrorCode::BadRequest, purpose == InputPurpose::ClockRoot ?
                         "Duplicate clock root bit" : "Duplicate input value bit"};
        result.push_back(std::move(matches.front()));
    }
    return result;
} catch (const hier::Error &error) { return error; }
}
