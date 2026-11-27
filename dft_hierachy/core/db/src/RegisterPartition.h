#pragma once
#include "hier/db/ConnectionIndex.h"
#include <algorithm>
#include <memory>
#include <queue>
#include <span>
#include <tuple>

namespace hier::db::detail {
// Borrows immutable facts and one completed grouping for this index build only.
// Group positions retain their original first-match priority.
class RegisterPartition {
  public:
    static constexpr size_t linearLimit = 8;
    RegisterPartition(std::span<const model::RegisterInfo> facts, std::span<const size_t> positions)
        : facts_(facts), positions_(positions) {}
    RegisterPartition(const RegisterPartition &) = delete;
    RegisterPartition &operator=(const RegisterPartition &) = delete;

    template <class Emit, class Check>
    void visit(model::BitRange write, Emit &&emit, Check &&check) {
        const auto end = write.lsb + write.width;
        // Preserve the original unsigned-wrap behavior; it sorted the two write
        // endpoints but could not clip any register into the original write.
        if (positions_.size() <= linearLimit || end < write.lsb) {
            linear(write, emit, check);
            return;
        }
        check();
        if (!write.width)
            return;
        if (!table_)
            build(check);
        const auto &cuts = table_->cuts;
        auto next = std::upper_bound(cuts.begin(), cuts.end(), write.lsb,
            [&](auto a, auto b) { check(); return a < b; });
        auto begin = write.lsb;
        size_t position = size_t(next - cuts.begin());
        while (begin < end) {
            check();
            const auto stop = next != cuts.end() ? std::min(end, *next) : end;
            const auto reg = position > 0 && position < cuts.size()
                                 ? table_->first[position - 1] : noEntry;
            emit(model::BitRange{begin, stop - begin}, reg);
            begin = stop;
            if (next != cuts.end()) { ++next; ++position; }
        }
    }

  private:
    struct Table { std::vector<uint64_t> cuts; std::vector<size_t> first; };
    std::span<const model::RegisterInfo> facts_;
    std::span<const size_t> positions_;
    std::unique_ptr<Table> table_;
    static std::optional<model::BitRange> intersect(model::BitRange a, model::BitRange b) {
        const auto lo = std::max(a.lsb,b.lsb), hi = std::min(a.lsb+a.width,b.lsb+b.width);
        if (lo >= hi) return {};
        return model::BitRange{lo,hi-lo};
    }
    template <class Emit, class Check>
    void linear(model::BitRange write, Emit &emit, Check &check) const {
        std::vector<uint64_t> cuts{write.lsb,write.lsb+write.width};
        for (auto r : positions_) {
            check();
            if (auto x = intersect(write,facts_[r].bits)) {
                cuts.push_back(x->lsb);cuts.push_back(x->lsb+x->width);
            }
        }
        std::sort(cuts.begin(),cuts.end(),[&](auto a,auto b) { check();return a<b; });
        cuts.erase(std::unique(cuts.begin(),cuts.end(),[&](auto a,auto b) { check();return a==b; }),cuts.end());
        for (size_t i = 1; i < cuts.size(); ++i) {
            check();
            model::BitRange target{cuts[i-1],cuts[i]-cuts[i-1]};
            auto first = noEntry;
            for (auto r : positions_) {
                check();
                if (intersect(target,facts_[r].bits)) { first = r;break; }
            }
            emit(target,first);
        }
    }
    template <class Check> void build(Check &check) {
        auto complete = std::make_unique<Table>();
        struct Interval { uint64_t begin,end;size_t reg; };
        std::vector<Interval> starts;
        for (size_t position = 0; position < positions_.size(); ++position) {
            check();
            const auto r = positions_[position];
            const auto bits = facts_[r].bits;
            const auto end = bits.lsb+bits.width;
            // Such an interval never intersects any valid generated part in the
            // original max/min predicate. No boundary from it may enter the table.
            if (end <= bits.lsb) continue;
            starts.push_back({bits.lsb,end,position});
            complete->cuts.push_back(bits.lsb);complete->cuts.push_back(end);
        }
        std::sort(starts.begin(),starts.end(),[&](const auto &a,const auto &b) {
            check();return std::tie(a.begin,a.reg)<std::tie(b.begin,b.reg);
        });
        auto &cuts = complete->cuts;
        std::sort(cuts.begin(),cuts.end(),[&](auto a,auto b) { check();return a<b; });
        cuts.erase(std::unique(cuts.begin(),cuts.end(),[&](auto a,auto b) { check();return a==b; }),cuts.end());
        // Expired lower-priority intervals can remain until they reach the top.
        // The top is always the first original register still covering this part.
        using Active = std::pair<size_t,uint64_t>;
        std::priority_queue<Active,std::vector<Active>,std::greater<Active>> active;
        size_t next = 0;
        for (size_t i = 1; i < cuts.size(); ++i) {
            check();
            while (next < starts.size() && starts[next].begin < cuts[i]) {
                check();active.emplace(starts[next].reg,starts[next].end);++next;
            }
            while (!active.empty() && active.top().second <= cuts[i-1]) { check();active.pop(); }
            complete->first.push_back(active.empty() ? noEntry : positions_[active.top().first]);
        }
        check();
        table_.swap(complete); // Never retain a partially sorted or built table.
    }
};
} // namespace hier::db::detail
