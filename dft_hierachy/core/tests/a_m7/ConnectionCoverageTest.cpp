#include "hier/db/ConnectionIndex.h"
#include "Observe.h"
#include "RegisterPartition.h"
#include <algorithm>
#include <charconv>
#include <tuple>

namespace baseline {
using namespace hier;
using namespace hier::db;
using namespace model;
namespace {
struct Interrupted {};
void check(Cancel cancel) {
    if (cancel.stop_requested())
        throw Interrupted{};
}
void unite(std::vector<BitRange> &ranges, Cancel cancel) {
    std::sort(ranges.begin(), ranges.end(), [&](auto a, auto b) {
        check(cancel);
        return std::tie(a.lsb, a.width) < std::tie(b.lsb, b.width);
    });
    size_t count = 0;
    for (auto range : ranges) {
        check(cancel);
        if (!range.width)
            continue;
        if (count && range.lsb <= ranges[count - 1].lsb + ranges[count - 1].width) {
            auto &last = ranges[count - 1];
            last.width = std::max(last.lsb + last.width, range.lsb + range.width) - last.lsb;
        } else
            ranges[count++] = range;
    }
    ranges.resize(count);
}
auto refOrder(std::string_view ref) {
    // A body's local refs have at most one child-slot component. Own objects sort
    // before child objects; port, signal, process, register in model reference order.
    uint64_t child = 0, index = 0;
    int kind = 0;
    if (ref.size() >= 2) {
        const auto pos = std::string_view("ipsxr").find(ref[0]);
        kind = pos == std::string_view::npos ? 5 : int(pos);
        auto colon = ref.find(':', 2);
        auto c = ref.substr(2, colon == std::string_view::npos ? ref.size() - 2 : colon - 2);
        if (!c.empty()) {
            (void)std::from_chars(c.data(), c.data() + c.size(), child);
            ++child;
        }
        if (colon != std::string_view::npos) {
            auto n = ref.substr(colon + 1);
            (void)std::from_chars(n.data(), n.data() + n.size(), index);
        }
    }
    return std::tuple{child, kind, index};
}
bool flows(Direction dir, bool input) {
    return dir == (input ? Direction::In : Direction::Out) || dir == Direction::InOut ||
           dir == Direction::Ref || dir == Direction::Unknown;
}
bool flows(const std::string &dir, bool input) {
    return dir == (input ? "in" : "out") || dir == "inout" || dir == "ref" || dir == "unknown";
}
void buildCoverage(ConnectionList &list, size_t node, size_t lo, size_t hi, Cancel cancel) {
    observation::emit({observation::Kind::ConnectionIndexNode, node});
    check(cancel);
    auto &ranges = list.coverage[node];
    if (hi - lo == 1)
        ranges = list.entries[lo].ranges;
    else {
        const size_t mid = lo + (hi - lo) / 2;
        buildCoverage(list, node * 2, lo, mid, cancel);
        buildCoverage(list, node * 2 + 1, mid, hi, cancel);
        for (auto r : list.coverage[node * 2]) {
            check(cancel);
            ranges.push_back(r);
        }
        for (auto r : list.coverage[node * 2 + 1]) {
            check(cancel);
            ranges.push_back(r);
        }
        unite(ranges, cancel);
    }
}
struct Builder {
    Cancel cancel;
    ConnectionIndex index;
    std::map<std::pair<std::string, bool>, std::map<std::pair<std::string, std::string>,
                                                   std::vector<BitRange>>> reasons;
    void reason(const std::string &ref, bool up, const Reason &r, BitRange bits) {
        reasons[{ref, up}][{r.code, r.at}].push_back(bits);
    }
    void add(const std::string &ref, bool up, ConnectionEntry entry, BitRange bits,
             const Completeness *incomplete = nullptr) {
        if (ref.empty() || !bits.width)
            return;
        observation::emit({observation::Kind::ConnectionIndexEntry});
        check(cancel);
        if (incomplete)
            for (const auto &r : incomplete->reasons) {
                check(cancel);
                reason(ref, up, r, bits);
            }
        entry.ranges.push_back(bits);
        index.objects[{ref, up}].entries.push_back(std::move(entry));
    }
};
} // namespace

Result<std::shared_ptr<const ConnectionIndex>>
indexConnections(const BodyConnections &facts, const BodySkeleton &skeleton, Cancel cancel) {
    try {
        Builder b;
        b.cancel = cancel;
        // Register overlap lookup is grouped by the original process and target.
        struct RegisterGroup {
            std::vector<size_t> positions;
            std::unique_ptr<hier::db::detail::RegisterPartition> partition;
        };
        std::map<std::pair<std::string, std::string>, RegisterGroup> registers;
        for (size_t r = 0; r < facts.registers.size(); ++r) {
            check(cancel);
            const auto &reg = facts.registers[r];
            registers[{reg.process, reg.signal}].positions.push_back(r);
        }
        for (size_t p = 0; p < facts.processes.size(); ++p) {
            check(cancel);
            const auto &proc = facts.processes[p];
            for (size_t w = 0; w < proc.result.writes.size(); ++w) {
                check(cancel);
                const auto &write = proc.result.writes[w];
                auto &group = registers[{proc.result.ref, write.target.ref}];
                hier::db::detail::RegisterPartition small(facts.registers, group.positions);
                auto *partition = &small;
                if (group.positions.size() > hier::db::detail::RegisterPartition::linearLimit) {
                    if (!group.partition)
                        group.partition = std::make_unique<hier::db::detail::RegisterPartition>(
                            facts.registers, group.positions);
                    partition = group.partition.get();
                }
                partition->visit(write.target.bits, [&](BitRange target, size_t reg) {
                    ConnectionEntry entry;
                    entry.first = p;
                    entry.second = w;
                    entry.target = target;
                    entry.reg = reg;
                    entry.via = reg == noEntry ? proc.result.ref : facts.registers[reg].ref;
                    if (write.deps.empty())
                        b.add(write.target.ref, true, entry, entry.target, &proc.completeness);
                    for (size_t d = 0; d < write.deps.size(); ++d) {
                        check(cancel);
                        entry.third = d;
                        const auto &dep = write.deps[d];
                        BitRange source = dep.bits;
                        if (dep.align == "bitwise")
                            source = {dep.bits.lsb + entry.target.lsb - write.target.bits.lsb,
                                      entry.target.width};
                        b.add(write.target.ref, true, entry, entry.target, &proc.completeness);
                        b.add(dep.signal, false, entry, source, &proc.completeness);
                    }
                }, [&] { check(cancel); });
            }
        }
        for (size_t p = 0; p < facts.internals.size(); ++p) {
            check(cancel);
            const auto &port = facts.internals[p];
            const auto ref = "p::" + std::to_string(p);
            for (size_t s = 0; s < internalSegmentCount(port); ++s) {
                check(cancel);
                BindSegment direct;
                const auto &seg = internalSegment(port, s, direct);
                ConnectionEntry e;
                e.kind = ConnectionKind::Internal;
                e.first = p;
                e.second = s;
                e.via = ref;
                for (bool up : {false, true}) {
                    b.add(ref, up, e, seg.pinBits);
                    if (seg.target.kind == "signal" && flows(skeleton.ports.at(p).direction, up)) {
                        e.kind = ConnectionKind::OwnPort;
                        b.add(seg.target.signal, up, e, seg.target.bits);
                        e.kind = ConnectionKind::Internal;
                    }
                }
            }
        }
        for (size_t pin = 0; pin < facts.bindings.size(); ++pin) {
            check(cancel);
            const auto &binding = facts.bindings[pin];
            b.index.bindings.emplace(binding.pin, pin);
            b.index.cellPins[binding.inst].push_back(pin);
            for (const auto &target : binding.possibleWrites) {
                check(cancel);
                b.reason(target.ref, true, {"blackbox", binding.pin, ""}, target.bits);
            }
            for (size_t s = 0; s < binding.segments.size(); ++s) {
                check(cancel);
                const auto &seg = binding.segments[s];
                ConnectionEntry e;
                e.kind = ConnectionKind::Outside;
                e.first = pin;
                e.second = s;
                e.via = binding.pin;
                for (bool up : {false, true}) {
                    // Expressions already have Write/Dep entries for this pin.
                    if (seg.target.kind != "expr")
                        b.add(binding.pin, up, e, seg.pinBits);
                    if (seg.target.kind == "signal" && flows(binding.direction, !up)) {
                        if (binding.direction == "unknown")
                            b.reason(seg.target.signal, up, {"blackbox", binding.pin, ""}, seg.target.bits);
                        else {
                            e.kind = ConnectionKind::ChildPin;
                            b.add(seg.target.signal, up, e, seg.target.bits);
                            e.kind = ConnectionKind::Outside;
                        }
                    }
                }
            }
        }
        for (const auto &s : facts.signals) {
            check(cancel);
            const BitRange bits{0, s.width};
            if (s.externalRead)
                b.reason(s.ref, false, {"hier_ref", s.ref, ""}, bits);
            if (s.externalWrite)
                b.reason(s.ref, true, {"hier_ref", s.ref, ""}, bits);
        }
        // Whole-body publication failures affect even objects with no surviving facts.
        std::map<std::string, uint64_t> widths;
        for (const auto &s : facts.signals) {
            check(cancel);
            widths[s.ref] = s.width;
        }
        for (size_t p = 0; p < skeleton.ports.size(); ++p) {
            check(cancel);
            widths["p::" + std::to_string(p)] = skeleton.ports[p].width;
        }
        for (const auto &pin : facts.bindings) {
            check(cancel);
            widths[pin.pin] = pin.width.value_or(0);
        }
        for (const auto &[ref, width] : widths) {
            check(cancel);
            for (bool up : {false, true})
                for (const auto &r : facts.completeness.reasons) {
                    check(cancel);
                    b.reason(ref, up, r, {0, width});
                }
        }
        for (auto &[object, reasons] : b.reasons)
            for (auto &[identity, ranges] : reasons) {
                check(cancel);
                unite(ranges, cancel);
                if (ranges.empty())
                    continue;
                ConnectionEntry e;
                e.kind = ConnectionKind::Reason;
                e.via = identity.second;
                e.reason = {identity.first, identity.second, ""};
                e.ranges = std::move(ranges);
                b.index.objects[object].entries.push_back(std::move(e));
            }
        b.index.estimatedBytes = sizeof(ConnectionIndex);
        for (auto &[key, list] : b.index.objects) {
            std::sort(list.entries.begin(), list.entries.end(), [&](const auto &a, const auto &c) {
                check(cancel);
                return std::tuple{a.kind == ConnectionKind::Reason, a.reason.code, refOrder(a.via),
                                  a.first, a.second, a.third, a.target.lsb} <
                       std::tuple{c.kind == ConnectionKind::Reason, c.reason.code, refOrder(c.via),
                                  c.first, c.second, c.third, c.target.lsb};
            });
            list.coverage.resize(list.entries.size() * 4);
            if (!list.entries.empty())
                buildCoverage(list, 1, 0, list.entries.size(), cancel);
            // Include vector capacities, strings and map node/link overhead.
            b.index.estimatedBytes += sizeof(key) + key.first.capacity() + sizeof(ConnectionList) +
                                      4 * sizeof(void *) + list.entries.capacity() * sizeof(ConnectionEntry) +
                                      list.coverage.capacity() * sizeof(std::vector<BitRange>);
            for (const auto &e : list.entries) {
                check(cancel);
                b.index.estimatedBytes += e.via.capacity() + e.reason.code.capacity() +
                                          e.reason.at.capacity() + e.reason.detail.capacity() +
                                          e.ranges.capacity() * sizeof(BitRange);
            }
            for (const auto &ranges : list.coverage) {
                check(cancel);
                b.index.estimatedBytes += ranges.capacity() * sizeof(BitRange);
            }
        }
        for (const auto &[key, unused] : b.index.bindings) {
            check(cancel);
            (void)unused;
            b.index.estimatedBytes += sizeof(std::pair<const std::string, size_t>) +
                                      key.capacity() + 4 * sizeof(void *);
        }
        for (const auto &[key, pins] : b.index.cellPins) {
            check(cancel);
            b.index.estimatedBytes += sizeof(key) + key.capacity() + sizeof(pins) +
                                      pins.capacity() * sizeof(size_t) + 4 * sizeof(void *);
        }
        check(cancel);
        return std::shared_ptr<const ConnectionIndex>(
            std::make_shared<ConnectionIndex>(std::move(b.index)));
    } catch (const Interrupted &) {
        return Error{ErrorCode::Cancelled, "connection indexing cancelled"};
    }
}
} // namespace baseline

#include "ConnectionCoverage.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
using namespace hier;
namespace {
using Ranges=std::vector<model::BitRange>;
Ranges ordered(Ranges ranges) {
    std::sort(ranges.begin(),ranges.end(),[](auto a,auto b){return std::tie(a.lsb,a.width)<std::tie(b.lsb,b.width);});
    size_t count=0;
    for(auto range:ranges){if(!range.width)continue;if(count&&range.lsb<=ranges[count-1].lsb+ranges[count-1].width){auto &last=ranges[count-1];last.width=std::max(last.lsb+last.width,range.lsb+range.width)-last.lsb;}else ranges[count++]=range;}
    ranges.resize(count);return ranges;
}
uint64_t randomWord(uint64_t &state){state^=state<<13;state^=state>>7;state^=state<<17;return state;}
std::pair<model::BodyConnections,model::BodySkeleton> facts(size_t count,size_t shape) {
    model::BodyConnections data;model::BodySkeleton sk;
    const auto extent=uint64_t(count*4+64);
    for(size_t i=0;i<2;++i){model::SignalInfo signal;signal.ref="s::"+std::to_string(i);signal.width=extent;signal.externalRead=shape==2&&i==0;signal.externalWrite=shape==2&&i==1;data.signals.push_back(signal);}
    for(size_t i=0;i<count;++i){const uint64_t start=shape==0?0:shape==1?i*2:((i*7919)%count)*4;const uint64_t width=shape==0?32:shape==1?2:1;
        model::ProcessInfo proc;proc.ref="x::"+std::to_string(i);proc.inst="i:";proc.kind="assign";model::Write write;write.target={"s::0",{start,width}};model::Dep dep;dep.signal="s::1";dep.bits={start,width};dep.role=i%2?"data":"control";dep.precision="exact";dep.align="bitwise";write.deps.push_back(dep);if(i%5==0){dep.role="clock";dep.align="all";write.deps.push_back(dep);}proc.writes.push_back(write);
        model::Completeness incomplete;if(shape==2&&i%3==0){incomplete.status="partial";incomplete.reasons.push_back({"unsupported",proc.ref,"own"});}data.processes.push_back({proc,incomplete});
        if(i%7==0){model::RegisterInfo reg;reg.ref="r::"+std::to_string(data.registers.size());reg.signal="s::0";reg.process=proc.ref;reg.bits={start,1};data.registers.push_back(reg);}
    }
    for(size_t i=0;i<2;++i){model::PortInfo port;port.name=i?"y":"a";port.direction=i?model::Direction::Out:model::Direction::In;port.width=extent;sk.ports.push_back(port);model::PortInternal internal;internal.kind="direct";internal.signal="s::"+std::to_string(1-i);internal.bits={0,extent};data.internals.push_back(internal);}
    for(size_t i=0;i<8;++i){model::PinBinding binding;binding.inst="i:"+std::to_string(i/2);binding.pin="p:"+std::to_string(i/2)+":"+std::to_string(i%2);binding.width=extent;binding.direction=i%3==0?"unknown":i%3==1?"in":"out";model::BindTarget target;target.kind="signal";target.signal="s::"+std::to_string(i%2);target.bits={0,extent};binding.segments.push_back({{0,extent},target});if(i%3==0)binding.possibleWrites.push_back({"s::0",{0,extent}});data.bindings.push_back(binding);}
    if(shape==2){data.completeness.status="partial";data.completeness.reasons.push_back({"hier_ref","s::1","whole"});}data.estimatedBytes=1024;return {data,sk};
}
size_t coverageBytes(const db::ConnectionIndex &index){size_t total=0;for(const auto &[key,list]:index.objects){(void)key;for(const auto &ranges:list.coverage)total+=ranges.capacity()*sizeof(model::BitRange);}return total;}
void equalIndex(const db::ConnectionIndex &current,const db::ConnectionIndex &old) {
    REQUIRE(current.objects.size()==old.objects.size());CHECK(current.bindings==old.bindings);CHECK(current.cellPins==old.cellPins);
    for(const auto &[key,list]:old.objects){const auto it=current.objects.find(key);REQUIRE(it!=current.objects.end());const auto &value=it->second;REQUIRE(value.entries.size()==list.entries.size());CHECK(value.coverage==list.coverage);
        for(size_t i=0;i<list.entries.size();++i){const auto &a=value.entries[i];const auto &b=list.entries[i];CHECK(std::tie(a.kind,a.first,a.second,a.third,a.reg,a.target.lsb,a.target.width,a.via,a.reason.code,a.reason.at,a.reason.detail)==std::tie(b.kind,b.first,b.second,b.third,b.reg,b.target.lsb,b.target.width,b.via,b.reason.code,b.reason.at,b.reason.detail));CHECK(a.ranges==b.ranges);}
        for(size_t start:std::array<size_t,5>{0,list.entries.size()/2,list.entries.empty()?0:list.entries.size()-1,list.entries.size(),list.entries.size()+1})for(model::BitRange query:std::array<model::BitRange,5>{{{0,1},{1,1},{8,3},{61,1},{1000000,1}}}){
            size_t expected=db::noEntry;for(size_t i=start;i<list.entries.size();++i)if(std::any_of(list.entries[i].ranges.begin(),list.entries[i].ranges.end(),[&](auto r){return r.lsb<query.lsb+query.width&&query.lsb<r.lsb+r.width;})){expected=i;break;}
            const auto found=value.next(start,query);REQUIRE(found);CHECK(*found==expected);const auto prior=list.next(start,query);REQUIRE(prior);CHECK(*found==*prior);
        }
    }
    const auto currentCoverage=coverageBytes(current),oldCoverage=coverageBytes(old);REQUIRE(current.estimatedBytes>=currentCoverage);REQUIRE(old.estimatedBytes>=oldCoverage);
    CHECK(current.estimatedBytes-currentCoverage==old.estimatedBytes-oldCoverage);CHECK(currentCoverage<=oldCoverage);
}
} // namespace

TEST_CASE("connection coverage merge preserves old order union and unsigned boundaries", "[a-m7]") {
    uint64_t seed=0x517cc1b727220a95ULL;
    for(size_t sample=0;sample<3000;++sample){Ranges left,right;
        for(size_t i=0;i<sample%31;++i){auto next=[&]{return randomWord(seed);};auto start=next()%127;auto width=next()%32;if(sample%17==0)start=UINT64_MAX-next()%4;if(sample%19==0)width=UINT64_MAX-next()%4;(i%2?left:right).push_back({start,width});}
        if(sample%3!=0){left=ordered(left);right=ordered(right);}const auto originalLeft=left,originalRight=right;
        Ranges expected=left;expected.insert(expected.end(),right.begin(),right.end());expected=ordered(expected);Ranges actual;db::detail::mergeConnectionCoverage(actual,left,right,[]{});CHECK(actual==expected);CHECK(left==originalLeft);CHECK(right==originalRight);
        Ranges normalization=originalLeft;db::detail::normalizeConnectionCoverage(normalization,[]{});CHECK(normalization==ordered(originalLeft));
    }
    Ranges left{{0,1},{2,2},{8,1}},right{{1,1},{3,4},{9,1}},result;db::detail::mergeConnectionCoverage(result,left,right,[]{});CHECK(result==Ranges{{0,7},{8,2}});
}

TEST_CASE("connection index retains entries coverage seek accounting and owning storage", "[a-m7]") {
    std::shared_ptr<const db::ConnectionIndex> retained;
    for(size_t count:{size_t(0),size_t(1),size_t(8),size_t(31),size_t(256),size_t(2048)})for(size_t shape=0;shape<3;++shape){auto [data,sk]=facts(count,shape);auto old=baseline::indexConnections(data,sk,{});auto current=db::indexConnections(data,sk,{});REQUIRE(old);REQUIRE(current);equalIndex(**current,**old);retained=*current;}
    REQUIRE(retained);REQUIRE(retained->find("s::0",true));CHECK_FALSE(retained->find("s::0",true)->entries.empty());
    auto [data,sk]=facts(4096,0);auto old=baseline::indexConnections(data,sk,{});auto current=db::indexConnections(data,sk,{});REQUIRE(old);REQUIRE(current);equalIndex(**current,**old);CHECK(coverageBytes(**current)<coverageBytes(**old));CHECK((*current)->estimatedBytes<(*old)->estimatedBytes);
}

TEST_CASE("coverage cancellation never mutates borrowed children and retry rebuilds", "[a-m7]") {
    Ranges left,right;for(uint64_t i=0;i<1024;++i){left.push_back({i*4,1});right.push_back({i*4+2,1});}const auto savedLeft=left,savedRight=right;Ranges expected=left;expected.insert(expected.end(),right.begin(),right.end());expected=ordered(expected);
    for(size_t stopAt:{size_t(1),size_t(64),size_t(2048),size_t(2500),size_t(4000)}){std::optional<Ranges> published;size_t checks=0;try{Ranges next;db::detail::mergeConnectionCoverage(next,left,right,[&]{if(++checks==stopAt)throw Error{ErrorCode::Cancelled,"A merge cancelled"};});published=std::move(next);}catch(const Error &e){CHECK(e.code==ErrorCode::Cancelled);}CHECK_FALSE(published);CHECK(left==savedLeft);CHECK(right==savedRight);Ranges retry;db::detail::mergeConnectionCoverage(retry,left,right,[]{});CHECK(retry==expected);}
    auto [data,sk]=facts(31,2);std::stop_source stopped;stopped.request_stop();auto old=baseline::indexConnections(data,sk,stopped.get_token());auto current=db::indexConnections(data,sk,stopped.get_token());REQUIRE_FALSE(old);REQUIRE_FALSE(current);CHECK(old.error().code==current.error().code);CHECK(old.error().message==current.error().message);REQUIRE(db::indexConnections(data,sk,{}));
}
