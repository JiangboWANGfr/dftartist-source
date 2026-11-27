#pragma once
#include "ConnectionRefs.h"
#include "hier/model/Model.h"
#include <span>
#include <unordered_map>

namespace hier::detail {
// Owning boundary projection, shared by public ports() and connection snapshots.
// All inputs are borrowed only for this synchronous call.
inline std::vector<model::PortInfo> occurrencePorts(const model::BodySkeleton &body,
                                                   const model::InstKey &key, Cancel cancel) {
    auto ports = body.ports;
    const ReferenceScope scope(key);
    for (size_t i = 0; i < ports.size(); ++i) {
        checkpoint(cancel);
        ports[i].ref = scope.qualify("p::" + std::to_string(i));
        scope.qualify(ports[i].internal, cancel);
    }
    return ports;
}
inline std::vector<model::PortInfo> occurrencePorts(const model::ChildSlot &slot,
                                                   const model::InstKey &key,
                                                   std::span<const model::PinBinding> bindings,
                                                   Cancel cancel) {
    const ReferenceScope scope(key);
    std::vector<model::PortInfo> ports;
    for (const auto &pin : slot.blackboxPins) {
        checkpoint(cancel);
        model::PortInfo port;
        port.name = pin;
        port.ref = scope.qualify("p::" + std::to_string(ports.size()));
        port.internal.reason = slot.kind == model::InstKind::Primitive ? "unsupported" : "blackbox";
        ports.push_back(std::move(port));
    }
    auto parent = key;
    parent.pop_back();
    const ReferenceScope parentScope(parent);
    auto apply = [](model::PortInfo &port, const model::PinBinding &binding) {
        if (binding.width)
            port.width = *binding.width;
        port.attrs = binding.attrs;
        // A later unknown/ref direction or absent width keeps the previous value.
        if (binding.direction == "in")
            port.direction = model::Direction::In;
        if (binding.direction == "out")
            port.direction = model::Direction::Out;
        if (binding.direction == "inout")
            port.direction = model::Direction::InOut;
    };
    // Small tables retain the allocation-free scan. This is a private lookup
    // choice, not a limit on supported pins or parent bindings.
    if (ports.size() <= 8 || bindings.size() <= 8) {
        for (auto &port : ports)
            for (const auto &binding : bindings) {
                checkpoint(cancel);
                if (parentScope.qualify(binding.pin) == port.ref)
                    apply(port, binding);
            }
    } else {
        // Only metadata: refs borrow the completed output vector. No more ports
        // are inserted or refs changed; release the table before returning it.
        std::unordered_map<std::string_view, size_t> byRef;
        byRef.reserve(ports.size());
        for (size_t i = 0; i < ports.size(); ++i) {
            checkpoint(cancel);
            byRef.emplace(ports[i].ref, i);
        }
        for (const auto &binding : bindings) {
            checkpoint(cancel);
            auto found = byRef.find(parentScope.qualify(binding.pin));
            if (found != byRef.end())
                apply(ports[found->second], binding);
        }
    }
    return ports;
}
} // namespace hier::detail
