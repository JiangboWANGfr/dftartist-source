#pragma once
#include "hier/model/Connections.h"
#include "QueryCancel.h"
#include "hier/model/Ids.h"
#include <charconv>

namespace hier::detail {
struct ObjectKey {
    char kind;
    model::InstKey inst;
    size_t index;
};
inline std::optional<ObjectKey> parseObject(std::string_view ref) {
    if (ref.size() < 5 || ref[1] != ':' ||
        std::string_view("spxr").find(ref[0]) == std::string_view::npos)
        return {};
    auto colon = ref.find(':', 2);
    if (colon == std::string_view::npos)
        return {};
    auto inst = model::parseInstRef("i:" + std::string(ref.substr(2, colon - 2)));
    if (!inst)
        return {};
    auto n = ref.substr(colon + 1);
    size_t index = 0;
    auto [end, ec] = std::from_chars(n.data(), n.data() + n.size(), index);
    if (n.empty() || ec != std::errc{} || end != n.data() + n.size())
        return {};
    return ObjectKey{ref[0], *inst, index};
}
// A synchronous boundary projection owns its formatted occurrence key. It never
// borrows a fact or an output field, and every returned reference owns its bytes.
class ReferenceScope {
  public:
    explicit ReferenceScope(const model::InstKey &key) : base_(model::formatInstKey(key)) {}
    // Synchronous matching may borrow this text until the scope is destroyed.
    std::string_view keyText() const { return base_; }
    std::string qualify(std::string ref) const {
        if (ref.empty())
            return ref;
        if (ref.starts_with("i:"))
            return "i:" + base_ + (ref.size() > 2 ? "." + ref.substr(2) : "");
        const auto colon = ref.find(':', 2);
        if (colon == std::string::npos)
            return ref;
        const auto child = ref.substr(2, colon - 2);
        return ref.substr(0, 2) + base_ + (child.empty() ? "" : "." + child) + ref.substr(colon);
    }

    void qualify(model::Completeness &c, Cancel cancel = {}) const {
        checkpoint(cancel);
        for (auto &r : c.reasons) {
            checkpoint(cancel);
            r.at = qualify(std::move(r.at));
        }
    }
    void qualify(model::BindTarget &t, Cancel cancel = {}) const {
        checkpoint(cancel);
        t.signal = qualify(std::move(t.signal));
        t.process = qualify(std::move(t.process));
    }
    void qualify(model::PortInternal &p, Cancel cancel = {}) const {
        checkpoint(cancel);
        p.signal = qualify(std::move(p.signal));
        for (auto &s : p.segments)
            qualify(s.target, cancel);
    }
    void qualify(model::PinBinding &b, Cancel cancel = {}) const {
        checkpoint(cancel);
        b.inst = qualify(std::move(b.inst));
        b.pin = qualify(std::move(b.pin));
        for (auto &s : b.segments)
            qualify(s.target, cancel);
        for (auto &s : b.possibleWrites) {
            checkpoint(cancel);
            s.ref = qualify(std::move(s.ref));
        }
    }
    void qualify(model::Expr &e, Cancel cancel = {}) const {
        checkpoint(cancel);
        e.slice.ref = qualify(std::move(e.slice.ref));
        for (auto &a : e.args)
            qualify(a, cancel);
        for (auto &d : e.uses) {
            checkpoint(cancel);
            d.signal = qualify(std::move(d.signal));
        }
    }
    void qualify(model::ProcessInfo &p, Cancel cancel = {}) const {
        checkpoint(cancel);
        p.ref = qualify(std::move(p.ref));
        p.inst = qualify(std::move(p.inst));
        if (p.expr)
            qualify(*p.expr, cancel);
        for (auto &w : p.writes) {
            checkpoint(cancel);
            w.target.ref = qualify(std::move(w.target.ref));
            for (auto &d : w.deps) {
                checkpoint(cancel);
                d.signal = qualify(std::move(d.signal));
            }
        }
    }
    void qualify(model::RegisterInfo &r, Cancel cancel = {}) const {
        checkpoint(cancel);
        r.ref = qualify(std::move(r.ref));
        r.inst = qualify(std::move(r.inst));
        r.signal = qualify(std::move(r.signal));
        r.process = qualify(std::move(r.process));
        r.clock.signal = qualify(std::move(r.clock.signal));
        for (auto &a : r.async) {
            checkpoint(cancel);
            a.signal = qualify(std::move(a.signal));
        }
    }

  private:
    const std::string base_;
};
inline std::string qualify(std::string ref, const model::InstKey &key) {
    if (ref.empty())
        return ref;
    return ReferenceScope(key).qualify(std::move(ref));
}
inline void qualify(model::Completeness &c, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(c, cancel);
}
inline void qualify(model::BindTarget &t, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(t, cancel);
}
inline void qualify(model::PortInternal &p, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(p, cancel);
}
inline void qualify(model::PinBinding &b, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(b, cancel);
}
inline void qualify(model::Expr &e, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(e, cancel);
}
inline void qualify(model::ProcessInfo &p, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(p, cancel);
}
inline void qualify(model::RegisterInfo &r, const model::InstKey &k, Cancel cancel = {}) {
    checkpoint(cancel);
    ReferenceScope(k).qualify(r, cancel);
}
} // namespace hier::detail
