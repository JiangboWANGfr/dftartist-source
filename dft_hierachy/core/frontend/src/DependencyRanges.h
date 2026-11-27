#pragma once
#include "hier/model/Connections.h"
#include <algorithm>
#include <functional>
#include <optional>
#include <unordered_set>

namespace hier::frontend::detail {
using Dependencies = std::vector<model::Dep>;

// The vector remains authoritative, including pre-existing duplicates and its
// allocation strategy. This scoped index borrows the vector object (not its
// elements); callers must not otherwise mutate or move it while the union lives.
class DependencyUnion {
  public:
    explicit DependencyUnion(Dependencies &dest) : dest_(dest) {}
    DependencyUnion(const DependencyUnion &) = delete;
    DependencyUnion &operator=(const DependencyUnion &) = delete;
    DependencyUnion(DependencyUnion &&) = delete;
    DependencyUnion &operator=(DependencyUnion &&) = delete;

    void append(const Dependencies &source) {
        if (&source == &dest_)
            return;
        for (const auto &dep : source) {
            // Avoid building a large index to append just one control access.
            if (!members_ && source.size() >= 8 && scans_ >= scanLimit) {
                Membership members(0, Hash{dest_}, Equal{dest_});
                for (size_t i = 0; i < dest_.size(); ++i)
                    members.insert(i);
                members_.emplace(std::move(members));
            }
            if (members_) {
                if (members_->find(dep) != members_->end())
                    continue;
                dest_.push_back(dep);
                try {
                    members_->insert(dest_.size() - 1);
                } catch (...) {
                    // The vector is still valid if allocation fails after its
                    // append. Drop the incomplete index before propagating.
                    members_.reset();
                    scans_ = 0;
                    throw;
                }
            } else {
                const auto at = std::find(dest_.begin(), dest_.end(), dep);
                const auto scanned = size_t(at - dest_.begin()) + (at != dest_.end());
                scans_ = std::min(scanLimit, scans_ + std::min(scanLimit, scanned));
                if (at == dest_.end())
                    dest_.push_back(dep);
            }
        }
    }

  private:
    struct Hash {
        using is_transparent = void;
        std::reference_wrapper<const Dependencies> dest;
        size_t operator()(const model::Dep &dep) const {
            size_t value = 0;
            const auto mix = [&value](size_t part) {
                value ^= part + 0x9e3779b9U + (value << 6) + (value >> 2);
            };
            for (const auto *field : {&dep.signal, &dep.role, &dep.precision, &dep.align})
                mix(std::hash<std::string>{}(*field));
            mix(std::hash<uint64_t>{}(dep.bits.lsb));
            mix(std::hash<uint64_t>{}(dep.bits.width));
            return value;
        }
        size_t operator()(size_t index) const { return (*this)(dest.get()[index]); }
    };
    struct Equal {
        using is_transparent = void;
        std::reference_wrapper<const Dependencies> dest;
        bool operator()(size_t a, size_t b) const { return dest.get()[a] == dest.get()[b]; }
        bool operator()(size_t a, const model::Dep &b) const { return dest.get()[a] == b; }
        bool operator()(const model::Dep &a, size_t b) const { return a == dest.get()[b]; }
    };
    using Membership = std::unordered_set<size_t, Hash, Equal>;
    static constexpr size_t scanLimit = 256;
    Dependencies &dest_;
    size_t scans_ = 0;
    std::optional<Membership> members_;
};
inline void appendDependencies(Dependencies &dest, const Dependencies &source) {
    DependencyUnion(dest).append(source);
}
inline bool uniformDependencies(const Dependencies &deps) {
    return std::all_of(deps.begin(), deps.end(), [](const auto &dep) {
        return dep.align == "all";
    });
}
// Both lists describe linear projections of their corresponding output ranges.
// An all relation keeps its source range; bitwise source coordinates advance.
inline bool dependenciesFollow(const Dependencies &first, const Dependencies &next,
                               uint64_t offset, uint64_t firstWidth = 1,
                               uint64_t nextWidth = 1) {
    if (first.size() != next.size())
        return false;
    for (size_t i = 0; i < first.size(); ++i) {
        const auto &a = first[i], &b = next[i];
        if (a.signal != b.signal || a.role != b.role || a.precision != b.precision ||
            a.align != b.align)
            return false;
        if (a.align == "all") {
            if (a.bits != b.bits)
                return false;
        } else if (a.align != "bitwise" || a.bits.width != firstWidth ||
                   b.bits.width != nextWidth || b.bits.lsb < a.bits.lsb ||
                   b.bits.lsb - a.bits.lsb != offset) {
            return false;
        }
    }
    return true;
}
inline void projectDependencies(Dependencies &deps, uint64_t offset, uint64_t width) {
    for (auto &dep : deps)
        if (dep.align == "bitwise") {
            dep.bits.lsb += offset;
            dep.bits.width = width;
        }
}
inline Dependencies sliceDependencies(const Dependencies &deps, uint64_t offset, uint64_t width) {
    auto result = deps;
    projectDependencies(result, offset, width);
    return result;
}
} // namespace hier::frontend::detail
