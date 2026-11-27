#pragma once
#include "ConnectionRefs.h"
#include "hier/model/Model.h"
#include <algorithm>
#include <array>
#include <tuple>

namespace hier::detail {
struct ReferenceRow {
    std::string_view ref; // Borrows immutable facts / port declarations.
    size_t outer = 0, inner = 0, dependency = 0;
};

// Query-local lookup metadata. A first/small scan stays linear; only repeated
// distinct lookups of a large collection pay for sorting. Equal refs retain the
// original nested-loop order, including duplicate facts.
class ReferenceTable {
  public:
    template <class Each, class Visit>
    bool visit(std::string_view ref, Each each, Visit visit, Cancel cancel) {
        checkpoint(cancel);
        if (!built_ && large_ && first_ && *first_ != ref) {
            std::vector<ReferenceRow> complete;
            each([&](const ReferenceRow &row) {
                checkpoint(cancel);
                complete.push_back(row);
                return true;
            });
            std::sort(complete.begin(), complete.end(), [&](const auto &a, const auto &b) {
                checkpoint(cancel);
                return std::tie(a.ref, a.outer, a.inner, a.dependency) <
                       std::tie(b.ref, b.outer, b.inner, b.dependency);
            });
            checkpoint(cancel);
            rows_.swap(complete);
            built_ = true;
        }
        if (built_) {
            auto first = std::lower_bound(rows_.begin(), rows_.end(), ref,
                [](const auto &row, auto value) { return row.ref < value; });
            for (; first != rows_.end() && first->ref == ref; ++first) {
                checkpoint(cancel);
                if (!visit(*first))
                    return false;
            }
        } else {
            if (!first_)
                first_ = ref;
            size_t scanned = 0;
            const bool complete = each([&](const ReferenceRow &row) {
                checkpoint(cancel);
                if (scanned < 9)
                    ++scanned;
                large_ = large_ || scanned == 9;
                return row.ref != ref || visit(row);
            });
            if (!complete)
                return false;
        }
        checkpoint(cancel);
        return true;
    }

  private:
    std::optional<std::string> first_;
    bool large_ = false, built_ = false;
    std::vector<ReferenceRow> rows_;
};

enum class FactReference { Signal, Write, Read, Pin, PossibleWrite, Segment, Count };

// Match occurrence-qualified queries against an immutable body-relative table.
// Non-object strings retain the original qualification fallback; valid objects
// preserve literal local suffixes (including leading zeroes), not numeric aliases.
template <class Each, class Visit>
bool visitOccurrenceReference(ReferenceTable &table, const ReferenceScope &scope,
                              std::string_view ref, Each &&each, Visit &&visit, Cancel cancel) {
    checkpoint(cancel);
    // A pass-through local string cannot match a valid object target: the latter
    // contains a colon after byte 1 and would therefore be qualified itself.
    if (!parseObject(ref))
        return each([&](const auto &row) {
            return scope.qualify(std::string(row.ref)) != ref || visit(row);
        });
    auto tail = ref.substr(2);
    if (!tail.starts_with(scope.keyText()))
        return true;
    tail.remove_prefix(scope.keyText().size());
    std::string local(ref.substr(0, 2));
    if (tail.starts_with(':'))
        local += tail;
    else if (tail.starts_with('.'))
        local += tail.substr(1);
    else
        return true;
    return table.visit(local, each, visit, cancel);
}

// The owner must retain this exact immutable BodyConnections until destruction.
// No published fact or L2 cache entry is changed by these indexes.
class FactReferenceIndex {
  public:
    explicit FactReferenceIndex(const model::BodyConnections &facts) : facts_(facts) {}
    template <class Visit>
    bool visit(FactReference kind, const model::InstKey &key, std::string_view ref,
               Visit visit, Cancel cancel) {
        checkpoint(cancel);
        return this->visit(kind, ReferenceScope(key), ref, std::move(visit), cancel);
    }
    template <class Visit>
    bool visit(FactReference kind, const ReferenceScope &scope, std::string_view ref,
               Visit visit, Cancel cancel) {
        auto each = [&](auto emit) { return enumerate(kind, emit, cancel); };
        return visitOccurrenceReference(tables_[size_t(kind)], scope, ref, each, visit, cancel);
    }

  private:
    const model::BodyConnections &facts_;
    std::array<ReferenceTable, size_t(FactReference::Count)> tables_;
    template <class Emit> bool enumerate(FactReference kind, Emit emit, Cancel cancel) const {
        auto offer = [&](std::string_view ref, size_t a, size_t b = 0, size_t c = 0) {
            checkpoint(cancel);
            return emit(ReferenceRow{ref, a, b, c});
        };
        if (kind == FactReference::Signal) {
            for (size_t i = 0; i < facts_.signals.size(); ++i)
                if (!offer(facts_.signals[i].ref, i))
                    return false;
        } else if (kind == FactReference::Write || kind == FactReference::Read) {
            for (size_t p = 0; p < facts_.processes.size(); ++p) {
                checkpoint(cancel);
                const auto &writes = facts_.processes[p].result.writes;
                for (size_t w = 0; w < writes.size(); ++w) {
                    checkpoint(cancel);
                    if (kind == FactReference::Write) {
                        if (!offer(writes[w].target.ref, p, w))
                            return false;
                    } else {
                        for (size_t d = 0; d < writes[w].deps.size(); ++d)
                            if (!offer(writes[w].deps[d].signal, p, w, d))
                                return false;
                    }
                }
            }
        } else {
            for (size_t b = 0; b < facts_.bindings.size(); ++b) {
                checkpoint(cancel);
                const auto &binding = facts_.bindings[b];
                if (kind == FactReference::Pin) {
                    if (!offer(binding.pin, b))
                        return false;
                } else if (kind == FactReference::PossibleWrite) {
                    for (size_t t = 0; t < binding.possibleWrites.size(); ++t)
                        if (!offer(binding.possibleWrites[t].ref, b, t))
                            return false;
                } else if (kind == FactReference::Segment) {
                    for (size_t s = 0; s < binding.segments.size(); ++s)
                        if (!offer(binding.segments[s].target.signal, b, s))
                            return false;
                }
            }
        }
        return true;
    }
};

class PortReferenceIndex {
  public:
    explicit PortReferenceIndex(const std::vector<model::PortInfo> &ports) : ports_(ports) {}
    template <class Visit> bool visit(std::string_view ref, Visit visit, Cancel cancel) {
        auto each = [&](auto emit) {
            return enumerate(emit, cancel);
        };
        return table_.visit(ref, each, visit, cancel);
    }
    template <class Visit>
    bool visit(const model::InstKey &key, std::string_view ref, Visit visit, Cancel cancel) {
        checkpoint(cancel);
        return this->visit(ReferenceScope(key), ref, std::move(visit), cancel);
    }
    template <class Visit>
    bool visit(const ReferenceScope &scope, std::string_view ref, Visit visit, Cancel cancel) {
        auto each = [&](auto emit) { return enumerate(emit, cancel); };
        return visitOccurrenceReference(table_, scope, ref, each, visit, cancel);
    }

  private:
    // Borrowed immutable vector: canonical DB skeleton, or snapshot-owned
    // synthesized ports. Scoped lookups retain no occurrence-qualified query keys.
    const std::vector<model::PortInfo> &ports_;
    ReferenceTable table_;
    template <class Emit> bool enumerate(Emit emit, Cancel cancel) const {
        for (size_t p = 0; p < ports_.size(); ++p) {
            checkpoint(cancel);
            const auto &internal = ports_[p].internal;
            if (internal.kind == "direct") {
                if (!emit(ReferenceRow{internal.signal, p}))
                    return false;
            } else if (internal.kind == "mapped") {
                for (size_t s = 0; s < internal.segments.size(); ++s) {
                    checkpoint(cancel);
                    if (!emit(ReferenceRow{internal.segments[s].target.signal, p, s}))
                        return false;
                }
            }
        }
        return true;
    }
};
} // namespace hier::detail
