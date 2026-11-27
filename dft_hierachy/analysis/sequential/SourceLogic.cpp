#include "SourceLogic.h"
#include "ConstantValue.h"
#include <algorithm>
#include <limits>
#include <map>
#include <tuple>

namespace dft::sequential::detail {
namespace {
using namespace hier;
using namespace hier::model;
template<class T> T take(Result<T> value) {
    if (!value) throw value.error();
    return std::move(value.value());
}
using Key = std::tuple<std::string, uint64_t, uint64_t, std::optional<std::string>>;
Key key(const TracePoint &p) { return {p.slice.ref, p.slice.bits.lsb, p.slice.bits.width, p.side}; }
bool contains(BitRange range, uint64_t bit) {
    return range.width && bit >= range.lsb && bit - range.lsb < range.width;
}
LogicValue constant(char value) {
    LogicValue result; result.verdict = "constant"; result.value = std::string(1, value); return result;
}
LogicValue inverted(LogicValue value) {
    if (value.value) {
        const auto bit = value.value->front();
        value.value = std::string(1, bit == '0' ? '1' : bit == '1' ? '0' : 'x');
    } else ++value.inversions;
    return value;
}
bool is(const LogicValue &v, char bit) { return v.value && *v.value == std::string(1, bit); }
bool same(const LogicValue &a, const LogicValue &b) {
    // A mux with identical branches preserves Z too. Do not apply two-state
    // identities such as a^a=0 to a four-state primary input.
    return a.verdict == b.verdict && a.value == b.value && a.sourceRef == b.sourceRef &&
        a.inversions == b.inversions && a.gate == b.gate && a.origin.has_value() == b.origin.has_value() &&
        (!a.origin || key(*a.origin) == key(*b.origin));
}

class Walk {
    Design &design_;
    const Request &request_;
    const std::set<std::string> &tops_;
    const std::vector<ClockRoot> &roots_;
    const std::vector<InputValue> &inputs_;
    uint64_t &work_;
    std::chrono::steady_clock::time_point deadline_;
    Cancel cancel_;
    std::set<Key> active_;
    std::map<Key, LogicValue> completed_;
    bool blocked_ = false;
    LogicProof proof_;

    LogicValue unknown(const std::string &reason) {
        blocked_ = true;
        if (std::find(proof_.reasons.begin(), proof_.reasons.end(), reason) == proof_.reasons.end())
            proof_.reasons.push_back(reason);
        return {};
    }
    bool spend(uint64_t depth) {
        if (cancel_.stop_requested()) throw Error{ErrorCode::Cancelled, "Logic source analysis cancelled"};
        if (std::chrono::steady_clock::now() >= deadline_) { unknown("budget_time"); return false; }
        if (depth >= request_.maxDepth) { unknown("budget_logic_depth"); return false; }
        if (work_ >= request_.maxLogicWork) { unknown("budget_logic_work"); return false; }
        ++work_;
        return true;
    }
    LogicValue boundary() {
        LogicValue result; result.verdict = "logic_boundary"; return result;
    }
    bool rooted(const LogicValue &value, uint64_t depth) {
        if (value.verdict != "primary_input" || !value.origin || !value.sourceRef) return false;
        for (const auto &root : roots_) {
            if (!spend(depth)) return false;
            if (*value.sourceRef == root.point.slice.ref &&
                value.origin->slice.bits.lsb == root.point.slice.bits.lsb && value.origin->slice.bits.width == 1)
                return true;
        }
        return false;
    }
    struct Site { TracePoint point; std::string process; };
    LogicValue gate(const std::string &op, const LogicValue &a, const LogicValue &b,
                    const Site &site, const std::vector<size_t> &path, uint64_t bit, uint64_t depth) {
        if (roots_.empty() || (op != "and" && op != "or") || a.gate || b.gate) return boundary();
        const bool ar = rooted(a, depth), br = rooted(b, depth);
        if (ar == br) return boundary(); // Two declared clocks do not identify an enable.
        const auto &clock = ar ? a : b;
        const auto &enable = ar ? b : a;
        if (enable.verdict != "primary_input" && enable.verdict != "generated" && enable.verdict != "undriven")
            return boundary();
        LogicValue result; result.verdict = "gated"; result.gate = proof_.gates.size();
        proof_.gates.push_back({op, site.process, site.point, path, bit, clock, enable});
        return result;
    }
    LogicValue bitConstant(const std::string &text, uint64_t width, uint64_t bit) {
        const auto value = constantBit(text, width, bit);
        return value ? constant(*value) : unknown("invalid_constant");
    }
    LogicValue expression(const Expr &expr, uint64_t bit, uint64_t depth, const Site &site,
                          std::vector<size_t> path = {}) {
        if (!spend(depth)) return {};
        const auto child = [&](size_t index, uint64_t childBit) {
            auto nested = path; nested.push_back(index);
            return expression(expr.args[index], childBit, depth + 1, site, std::move(nested));
        };
        if (!expr.width || bit >= *expr.width) return unknown("unknown_expression_width");
        if (expr.op == "const") return bitConstant(expr.value, *expr.width, bit);
        if (expr.op == "ref") {
            if (expr.slice.bits.width != *expr.width ||
                expr.slice.bits.lsb > std::numeric_limits<uint64_t>::max() - bit)
                return unknown("invalid_reference_mapping");
            const auto object = take(design_.object(expr.slice.ref, cancel_));
            // The port placeholder in output port_expr needs outside semantics;
            // this revision deliberately does not interpret port_expr values.
            if (object.kind != "signal") return unknown("unsupported_expression_reference");
            return point({{expr.slice.ref, {expr.slice.bits.lsb + bit, 1}}, {}}, depth + 1);
        }
        if (expr.op == "not" && expr.args.size() == 1 && expr.args[0].width == expr.width)
            return inverted(child(0, bit));
        if (expr.op == "concat") {
            uint64_t offset = 0;
            for (size_t i = expr.args.size(); i > 0; --i) {
                const auto &arg = expr.args[i - 1];
                if (!spend(depth)) return {};
                if (!arg.width || *arg.width > std::numeric_limits<uint64_t>::max() - offset)
                    return unknown("invalid_concat_width");
                if (bit >= offset && bit - offset < *arg.width) return child(i - 1, bit - offset);
                offset += *arg.width;
            }
            return unknown("invalid_concat_mapping");
        }
        if ((expr.op == "and" || expr.op == "or" || expr.op == "xor") && expr.args.size() == 2 &&
            expr.args[0].width == expr.width && expr.args[1].width == expr.width) {
            auto a = child(0, bit);
            if (expr.op == "and" && is(a, '0')) return constant('0');
            if (expr.op == "or" && is(a, '1')) return constant('1');
            auto b = child(1, bit);
            if (a.value && b.value) {
                if (expr.op == "and") {
                    if (is(a, '0') || is(b, '0')) return constant('0');
                    return constant(is(a, '1') && is(b, '1') ? '1' : 'x');
                }
                if (expr.op == "or") {
                    if (is(a, '1') || is(b, '1')) return constant('1');
                    return constant(is(a, '0') && is(b, '0') ? '0' : 'x');
                }
                if ((*a.value != "0" && *a.value != "1") || (*b.value != "0" && *b.value != "1"))
                    return constant('x');
                return constant(*a.value == *b.value ? '0' : '1');
            }
            if (expr.op == "and") {
                if (is(b, '0')) return constant('0');
                if (is(a, '1')) return b;
                if (is(b, '1')) return a;
            } else if (expr.op == "or") {
                if (is(b, '1')) return constant('1');
                if (is(a, '0')) return b;
                if (is(b, '0')) return a;
            } else {
                if (is(a, '0')) return b;
                if (is(b, '0')) return a;
                if (is(a, '1')) return inverted(std::move(b));
                if (is(b, '1')) return inverted(std::move(a));
            }
            return gate(expr.op, a, b, site, path, bit, depth);
        }
        if (expr.op == "mux" && expr.args.size() == 3 && expr.args[0].width == 1 &&
            expr.args[1].width == expr.width && expr.args[2].width == expr.width) {
            const auto condition = child(0, 0);
            if (is(condition, '1')) return child(1, bit);
            if (is(condition, '0')) return child(2, bit);
            auto a = child(1, bit);
            auto b = child(2, bit);
            if (condition.value && a.value && b.value)
                return *a.value == *b.value ? a : constant('x');
            return same(a, b) ? a : boundary();
        }
        return unknown("unsupported_expression"); // Never parse text or infer a value from uses/deps.
    }
    LogicValue process(const Hop &hop, const TracePoint &at, uint64_t depth) {
        if (!spend(depth)) return {};
        auto response = take(design_.proc(hop.via, cancel_));
        const auto proc = response.result;
        const auto complete = response.completeness.status == "complete";
        proof_.processes.push_back(std::move(response));
        if (!complete) return unknown("core_process_partial");
        if ((proc.kind != "assign" && proc.kind != "init") || !proc.expr)
            return unknown("unsupported_process_kind");
        std::optional<uint64_t> rootBit;
        for (const auto &write : proc.writes) {
            if (!spend(depth)) return {};
            if (write.target.ref != at.slice.ref || !contains(write.target.bits, at.slice.bits.lsb)) continue;
            if (!write.exprMap || write.exprMap->status != "mapped") return unknown("unresolved_value_mapping");
            for (const auto &segment : write.exprMap->segments) {
                if (!spend(depth)) return {};
                if (!contains({segment.to, segment.width}, at.slice.bits.lsb)) continue;
                const auto offset = at.slice.bits.lsb - segment.to;
                if (rootBit || segment.from > std::numeric_limits<uint64_t>::max() - offset)
                    return unknown("ambiguous_value_mapping");
                rootBit = segment.from + offset;
            }
        }
        if (!rootBit) return unknown("missing_value_mapping");
        return expression(*proc.expr, *rootBit, depth + 1, {at, hop.via});
    }
    LogicValue point(const TracePoint &at, uint64_t depth) {
        if (!spend(depth)) return {};
        if (at.slice.bits.width != 1) return unknown("unsupported_control_width");
        const auto identity = key(at);
        if (const auto done = completed_.find(identity); done != completed_.end()) return done->second;
        if (!active_.insert(identity).second) return unknown("source_cycle");
        auto result = drivers(at, depth);
        active_.erase(identity);
        completed_.emplace(identity, result);
        return result;
    }
    LogicValue drivers(const TracePoint &at, uint64_t depth) {
        ConnectionRequest request;
        request.bits = at.slice.bits; request.reach = "hier"; request.side = at.side.value_or("");
        StepLimit page;
        std::map<std::pair<std::string, std::string>, Hop> candidates;
        do {
            if (!spend(depth)) return {};
            if (work_ >= request_.maxLogicWork) return unknown("budget_logic_work");
            page.maxHops = int(std::min<uint64_t>(200, request_.maxLogicWork - work_));
            auto response = take(design_.step(at.slice.ref, true, request, page, cancel_));
            bool acceptable = response.completeness.status == "complete";
            if (!acceptable && !response.result.next.empty() && !response.completeness.reasons.empty())
                acceptable = std::all_of(response.completeness.reasons.begin(), response.completeness.reasons.end(),
                    [](const auto &reason) { return reason.code == "budget_nodes"; });
            const auto next = response.result.next;
            const auto conservative = response.result.hasConservative;
            // For a process/register, only its driver identity is consumed here.
            // Value mapping comes exclusively from complete proc.expr/exprMap;
            // never reinterpret a conservative dependency as an exact transfer.
            const auto identitiesOnly = !response.result.hops.empty() &&
                std::all_of(response.result.hops.begin(), response.result.hops.end(), [](const auto &hop) {
                    return hop.kind == "process" || hop.kind == "register";
                });
            for (const auto &hop : response.result.hops) {
                if (!spend(depth)) { proof_.steps.push_back({at, std::move(response)}); return {}; }
                const auto driver = hop.kind == "process" || hop.kind == "register" ? hop.via : hop.fact;
                candidates.emplace(std::pair{hop.kind, driver}, hop);
            }
            proof_.steps.push_back({at, std::move(response)});
            if (!acceptable || (conservative && !identitiesOnly)) return unknown("core_step_partial_or_conservative");
            if (!next.empty() && next == page.cursor) throw Error{ErrorCode::Internal, "Step cursor did not advance"};
            page.cursor = next;
        } while (!page.cursor.empty());
        if (candidates.empty()) {
            LogicValue result; result.verdict = "undriven"; result.origin = at; return result;
        }
        if (candidates.size() != 1) return unknown("multiple_drivers");
        const auto &hop = candidates.begin()->second;
        if (hop.kind == "process") return process(hop, at, depth + 1);
        if (hop.kind == "register") {
            LogicValue result; result.verdict = "generated"; result.origin = at; result.sourceRef = hop.via; return result;
        }
        if (hop.kind == "const" && hop.value) return bitConstant(*hop.value, 1, 0);
        if (hop.kind == "unconnected") {
            LogicValue result; result.verdict = "undriven"; result.origin = at; result.sourceRef = hop.via; return result;
        }
        if (hop.kind == "top_port") {
            if (!spend(depth)) return {};
            const auto object = take(design_.object(hop.via, cancel_));
            if (!tops_.contains(object.inst)) return unknown("nonprimary_port");
            for (const auto &port : take(design_.ports(object.inst, cancel_))) {
                if (!spend(depth)) return {};
                if (port.ref != hop.via) continue;
                if (port.direction != Direction::In) return unknown("noninput_primary_port");
                for (size_t i = 0; i < inputs_.size(); ++i) {
                    if (!spend(depth)) return {};
                    const auto &input = inputs_[i];
                    if (hop.at && hop.at->slice.bits.width == 1 && input.input.point.slice.ref == hop.via &&
                        input.input.point.slice.bits.lsb == hop.at->slice.bits.lsb) {
                        // This is a conditional analysis value, not a rewritten
                        // Core constant. The raw top_port response stays intact.
                        if (std::find(proof_.appliedInputs.begin(), proof_.appliedInputs.end(), i) == proof_.appliedInputs.end())
                            proof_.appliedInputs.push_back(i);
                        return constant(input.high ? '1' : '0');
                    }
                }
                LogicValue result; result.verdict = "primary_input";
                result.origin = hop.at; result.sourceRef = hop.via; return result;
            }
            return unknown("missing_primary_port");
        }
        if ((hop.kind == "binding_up" || hop.kind == "binding_down") && hop.next.size() == 1) {
            const auto &next = hop.next.front();
            if (next.precision != "exact" || next.align != "bitwise" || next.slice.bits.width != 1)
                return unknown("unsupported_binding_mapping");
            return point({next.slice, next.side}, depth + 1);
        }
        return unknown("unsupported_source_boundary");
    }
  public:
    Walk(Design &design, const Request &request, const std::set<std::string> &tops, uint64_t &work,
         std::chrono::steady_clock::time_point deadline, Cancel cancel, const std::vector<ClockRoot> &roots,
         const std::vector<InputValue> &inputs)
        : design_(design), request_(request), tops_(tops), roots_(roots), inputs_(inputs), work_(work),
          deadline_(deadline), cancel_(cancel) {}
    LogicProof run(const TracePoint &source) {
        const auto start = work_;
        proof_.result = point(source, 0);
        if (blocked_) proof_.result = {};
        if (proof_.result.verdict == "logic_boundary") proof_.reasons.push_back("logic_requires_analysis");
        if (proof_.result.verdict == "gated") proof_.reasons.push_back("gated_control_requires_protocol");
        proof_.work = work_ - start;
        return std::move(proof_);
    }
};
} // namespace
LogicProof resolveSource(Design &design, const TracePoint &point, const Request &request,
                         const std::set<std::string> &tops, uint64_t &work,
                         std::chrono::steady_clock::time_point deadline, Cancel cancel,
                         const std::vector<ClockRoot> &roots, const std::vector<InputValue> &inputs) {
    return Walk(design, request, tops, work, deadline, cancel, roots, inputs).run(point);
}
} // namespace dft::sequential::detail
