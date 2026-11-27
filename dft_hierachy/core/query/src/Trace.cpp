#include "Trace.h"
#include "ConnectionRefs.h"
#include "Cursor.h"
#include "PartialReasons.h"
#include "Step.h"
#include "TraceGraph.h"
#include "Observe.h"
#include <algorithm>
#include <chrono>
#include <deque>
#include <set>

namespace hier::detail {
using namespace model;
using namespace tracing;
namespace {
template<class T> T take(Result<T> value) {
    if (!value)
        throw value.error();
    return std::move(value.value());
}
void cancelled(Cancel cancel) {
    if (cancel.stop_requested())
        throw Error{ErrorCode::Cancelled, "trace cancelled"};
}
ObjectKey validate(const TraceSelection &selection) {
    auto key = parseObject(selection.ref);
    if (!key || (key->kind != 's' && key->kind != 'p'))
        throw Error{ErrorCode::BadRequest, "expected signal or port reference"};
    if ((key->kind == 's' && selection.side) ||
        (key->kind == 'p' && selection.side != "inside" && selection.side != "outside") ||
        (selection.side == "outside" && key->inst.size() == 1))
        throw Error{ErrorCode::BadRequest, "invalid side for this object"};
    if (selection.bits &&
        ((selection.bits->width == 0 && (!selection.unknownWidth || selection.bits->lsb != 0)) ||
         selection.bits->lsb > UINT64_MAX - selection.bits->width))
        throw Error{ErrorCode::BadRequest, "invalid bit range"};
    return *key;
}
struct Work {
    TracePoint point;
    std::string node;
    uint64_t depth = 0;
};
struct Pending {
    Link link;
    bool expand = false;
};
// Each view owns its cache borrow, including while another body is extracted.
struct PinView {
    db::IndexedConnections data;
    InstKey parent;
    size_t pin;
    InstKind kind;
    BodyId body;
    const PinBinding &binding() const { return data.facts->bindings[pin]; }
};
class TraceQuery {
  public:
    TraceQuery(const db::DesignDb &db, TraceDirection direction, TracePolicy policy,
               const Budget &budget, Cancel cancel)
        : db_(db), direction_(direction), policy_(policy), budget_(budget), cancel_(cancel),
          started_(observation::now()), graph_(budget, cancel) {}

    QueryResult<TraceResult> run(const TraceSelection &source,
                                  const std::optional<TraceSelection> &target) {
        const auto origin = resolve(source);
        if (target && expired()) {
            frontier({origin, {}, 0}, "budget_time");
            return finish();
        }
        if (target)
            target_ = resolve(*target);
        if (target_ && !target_->slice.bits.width)
            frontier({*target_, {}, 0}, target_->slice.ref.starts_with("p:")
                                           ? "unknown_pin_width" : "unsupported");
        // Partition goal hits before expansion. No returned node contains both
        // a stopped goal range and an independently expanding residual range.
        const auto pieces = split(origin);
        for (const auto &piece : pieces) {
            if (graph_.result.nodes.size() == size_t(budget_.maxNodes)) {
                frontier({piece, {}, 0}, "budget_nodes");
                stopped_ = true;
            } else {
                const auto id = graph_.root(piece);
                enqueue({piece, id, 0});
            }
        }
        if (expired()) {
            stop("budget_time", {}, {});
        } else if (stopped_) {
            stop("budget_nodes", {}, {});
        }
        while (!queue_.empty() && !stopped_) {
            cancelled(cancel_);
            auto work = queue_.front();
            queue_.pop_front();
            if (expired()) {
                stop("budget_time", work, {});
                break;
            }
            if (work.depth >= uint64_t(budget_.maxDepth)) {
                frontier(work, "budget_depth");
                continue;
            }
            expand(work);
        }
        if (target_) {
            // The pruning workspace is bounded independently by the same node
            // and edge limits. An interrupted filter cannot prove an empty path.
            auto reason = graph_.routes(*target_, [&] { return expired(); });
            if (!reason.empty()) {
                frontier({origin, {}, 0}, reason);
                graph_.result.nodes.clear();
                graph_.result.edges.clear();
            }
        }
        graph_.sort();
        cancelled(cancel_);
        return finish();
    }

  private:
    const db::DesignDb &db_;
    TraceDirection direction_;
    TracePolicy policy_;
    Budget budget_;
    Cancel cancel_;
    std::chrono::steady_clock::time_point started_;
    TraceGraph graph_;
    Completeness completeness_;
    PartialReasons reasons_{completeness_, [this] { cancelled(cancel_); }};
    std::optional<TracePoint> target_;
    std::deque<Work> queue_;
    std::set<std::string> visited_, frontiers_;
    bool stopped_ = false;

    QueryResult<TraceResult> finish() {
        reasons_.release();
        return {std::move(graph_.result), std::move(completeness_)};
    }
    bool back() const { return direction_ == TraceDirection::Back; }
    bool expired() const {
        cancelled(cancel_);
        return budget_.maxMillis &&
               std::chrono::duration_cast<std::chrono::milliseconds>(
                   observation::now() - started_).count() >= *budget_.maxMillis;
    }
    TracePoint resolve(const TraceSelection &selection) {
        const auto key = validate(selection);
        cancelled(cancel_);
        const auto located = take(db_.locate(key.inst, cancel_));
        uint64_t width = 0;
        if (key.kind == 's') {
            if (located.body == kNoBody)
                throw Error{ErrorCode::NotFound, "instance has no signals"};
            auto facts = take(db_.connections(located.body, cancel_));
            if (key.index >= facts->signals.size())
                throw Error{ErrorCode::NotFound, "no such signal"};
            const auto &signal = facts->signals[key.index];
            width = signal.opaque ? 0 : signal.width;
        } else if (located.body != kNoBody && selection.side == "inside") {
            const auto *skeleton = take(db_.skeleton(located.body, cancel_));
            if (key.index >= skeleton->ports.size())
                throw Error{ErrorCode::NotFound, "no such port"};
            width = skeleton->ports[key.index].width;
        } else {
            auto data = take(db_.indexedConnections(located.steps.back().parentBody, cancel_));
            const auto local = "p:" + std::to_string(key.inst.back()) + ":" + std::to_string(key.index);
            auto pin = data.index->bindings.find(local);
            if (pin == data.index->bindings.end())
                throw Error{ErrorCode::NotFound, "no such port"};
            width = data.facts->bindings[pin->second].width.value_or(0);
        }
        cancelled(cancel_);
        const auto bits = selection.bits.value_or(BitRange{0, width});
        if (selection.bits && ((width && (!bits.width || bits.lsb >= width || bits.width > width - bits.lsb)) ||
                                (!width && (bits.lsb || bits.width))))
            throw Error{ErrorCode::BadRequest, "slice is outside the object bit space"};
        return {{qualify(std::string(1, key.kind) + "::" + std::to_string(key.index), key.inst), bits},
                selection.side};
    }
    bool hit(const TracePoint &point) const {
        return target_ && sameObject(point, *target_) && overlap(point.slice.bits, target_->slice.bits);
    }
    std::vector<TracePoint> split(const TracePoint &point) const {
        if (!hit(point))
            return {point};
        std::vector<TracePoint> out;
        auto goal = point;
        goal.slice.bits = *overlap(point.slice.bits, target_->slice.bits);
        out.push_back(goal);
        for (auto bits : subtract(point.slice.bits, goal.slice.bits)) {
            auto rest = point;
            rest.slice.bits = bits;
            out.push_back(std::move(rest));
        }
        return out;
    }
    void enqueue(Work work) {
        if (!hit(work.point) && visited_.insert(pointId(work.point)).second)
            queue_.push_back(std::move(work));
    }
    void reason(const std::string &code, const std::string &at) {
        reasons_.append(code, at);
    }
    void frontier(const Work &work, const std::string &code, const std::optional<std::string> &cursor = {},
                  const std::string &at = {}) {
        reason(code, at.empty() ? work.point.slice.ref : at);
        auto identity = pointId(work.point);
        cursorField(identity, std::to_string(work.depth));
        cursorField(identity, code);
        cursorField(identity, cursor.value_or(""));
        if (frontiers_.insert(identity).second)
            graph_.result.frontier.push_back({work.point, work.depth, code, cursor});
    }
    void stop(const std::string &code, const std::optional<Work> &current,
              const std::optional<std::string> &cursor) {
        cancelled(cancel_);
        stopped_ = true;
        if (current)
            frontier(*current, code, cursor);
        for (const auto &work : queue_) {
            cancelled(cancel_);
            frontier(work, code);
        }
        queue_.clear();
    }
    bool commit(const Work &work, std::vector<Pending> pending,
                const std::optional<std::string> &cursor) {
        if (expired()) {
            stop("budget_time", work, cursor);
            return false;
        }
        std::vector<Link> links;
        for (const auto &p : pending)
            links.push_back(p.link);
        auto denied = graph_.admit(links);
        if (!denied.empty()) {
            stop(denied, work, cursor);
            return false;
        }
        for (size_t i = 0; i < pending.size(); ++i)
            if (pending[i].expand)
                enqueue({*links[i].node.point, links[i].node.id, work.depth + 1});
        return true;
    }
    void relation(std::vector<Pending> &pending, const Work &work, const TracePoint &to,
                  BitRange from, const std::string &fact, const std::string &kind,
                  const std::string &via, const std::string &role = "data",
                  const std::string &precision = "exact", const std::string &align = "bitwise") {
        for (const auto &point : split(to)) {
            observation::emit({observation::Kind::TraceRelation});
            cancelled(cancel_);
            TraceEdge edge;
            edge.from = work.node;
            edge.fact = fact;
            edge.kind = kind;
            if (!via.empty())
                edge.via = via;
            edge.role = role;
            edge.precision = precision;
            edge.align = align;
            edge.toBits = point.slice.bits;
            edge.fromBits = align == "all" ? from : project(point.slice.bits, to.slice.bits, from);
            if (align == "bitwise")
                edge.map.push_back({edge.fromBits->lsb, point.slice.bits.lsb, point.slice.bits.width});
            pending.push_back({{sliceNode(point), std::move(edge)}, !hit(point)});
        }
    }
    Pending terminal(const Work &work, const Hop &hop) const {
        TraceNode node;
        node.kind = hop.kind;
        node.fact = hop.fact;
        if (!hop.via.empty())
            node.ref = hop.via;
        node.point = hop.at;
        node.value = hop.value;
        if (!hop.reason.empty())
            node.reason = hop.reason;
        TraceEdge edge;
        edge.from = work.node;
        edge.fact = hop.fact;
        edge.via = node.ref;
        edge.kind = "boundary";
        edge.align = "none";
        return {{std::move(node), std::move(edge)}, false};
    }
    std::optional<PinView> pinView(const TracePoint &point) {
        auto key = parseObject(point.slice.ref);
        if (!key || key->kind != 'p' || key->inst.size() == 1)
            return {};
        auto located = take(db_.locate(key->inst, cancel_));
        auto parent = key->inst;
        parent.pop_back();
        auto data = take(db_.indexedConnections(located.steps.back().parentBody, cancel_));
        auto local = "p:" + std::to_string(key->inst.back()) + ":" + std::to_string(key->index);
        auto pos = data.index->bindings.find(local);
        if (pos == data.index->bindings.end())
            throw Error{ErrorCode::Internal, "trace pin missing from binding index"};
        return PinView{std::move(data), std::move(parent), pos->second,
                       located.steps.back().slot->kind, located.body};
    }
    TracePoint semanticPoint(const Work &work, const Hop &hop, const std::optional<StepAnchor> &anchor) {
        if (hop.at)
            return *hop.at;
        if (anchor)
            return {anchor->pin, anchor->outside ? "outside" : "inside"};
        if (hop.via == work.point.slice.ref)
            return work.point;
        auto key = parseObject(hop.via);
        if (!key || key->kind != 'p')
            return work.point;
        auto point = TracePoint{{hop.via, {0, 0}}, key->inst.size() == 1 ? "inside" : "outside"};
        auto pin = pinView(point);
        if (!pin)
            return point;
        // An unresolved binding has no proven slice mapping. Report its entire
        // available pin space (or the explicit zero-width unknown space).
        point.slice.bits.width = pin->binding().width.value_or(0);
        return point;
    }
    bool consume(const Work &work, Hop hop, const std::optional<StepAnchor> &anchor,
                 const std::optional<std::string> &cursor) {
        std::vector<Pending> pending;
        std::vector<BitRange> remaining{hop.from.bits};
        if (target_ && anchor && anchor->pin.ref == target_->slice.ref &&
            ((target_->side == "inside" && anchor->inside) ||
             (target_->side == "outside" && anchor->outside))) {
            if (auto selected = overlap(anchor->pin.bits, target_->slice.bits)) {
                const auto from = project(*selected, anchor->pin.bits, hop.from.bits);
                relation(pending, work, {{anchor->pin.ref, *selected}, target_->side}, from,
                           hop.fact, "binding", hop.via);
                remaining = subtract(hop.from.bits, from);
            }
        }
        // Known terminal pins are also real binding endpoints when they are the
        // requested goal, before any unsupported internal relation is needed.
        if (hop.at && target_ && sameObject(*hop.at, *target_) &&
            (hop.kind == "primitive_pin" || hop.kind == "blackbox_pin" || hop.kind == "top_port")) {
            if (auto selected = overlap(hop.at->slice.bits, target_->slice.bits)) {
                const auto from = project(*selected, hop.at->slice.bits, hop.from.bits);
                if (!anchor)
                    relation(pending, work, {{hop.at->slice.ref, *selected}, hop.at->side}, from,
                               hop.fact, "binding", hop.via);
                remaining = subtract(hop.from.bits, from);
            }
        }
        std::vector<std::pair<Work, std::string>> semantic;
        for (auto selected : remaining) {
            cancelled(cancel_);
            const bool pass = (hop.kind == "process" && policy_ != TracePolicy::Structural) ||
                              (hop.kind == "register" && policy_ == TracePolicy::Full) ||
                              hop.kind.starts_with("binding_");
            if (pass && !hop.next.empty()) {
                for (const auto &next : hop.next) {
                    auto common = overlap(selected, next.from);
                    if (!common)
                        continue;
                    auto to = next.slice;
                    if (next.align == "bitwise")
                        to.bits = project(*common, next.from, next.slice.bits);
                    const auto side = next.side;
                    std::vector<BitRange> destinations{to.bits};
                    // A port_expr produces the external pin value; an explicit
                    // outside goal is reached by that same dependency relation.
                    if (target_ && target_->slice.ref == to.ref && target_->side == "outside" &&
                        side == "inside" && hop.kind == "process") {
                        if (auto hitBits = overlap(to.bits, target_->slice.bits)) {
                            auto from = next.align == "all" ? *common : project(*hitBits, to.bits, *common);
                            relation(pending, work, {{to.ref, *hitBits}, "outside"}, from, hop.fact,
                                       "dependency", hop.via, next.role, next.precision, next.align);
                            destinations = subtract(to.bits, *hitBits);
                        }
                    }
                    for (auto destination : destinations) {
                        const auto from = next.align == "all" ? *common : project(destination, to.bits, *common);
                        relation(pending, work, {{to.ref, destination}, side}, from, hop.fact,
                                   hop.kind.starts_with("binding_") ? "binding" : "dependency",
                                   hop.via, next.role, next.precision, next.align);
                    }
                }
            } else if (hop.kind == "blackbox_pin" && policy_ == TracePolicy::Full && hop.at) {
                auto to = *hop.at;
                to.slice.bits = project(selected, hop.from.bits, to.slice.bits);
                relation(pending, work, to, selected, hop.fact, "binding", hop.via);
            } else {
                auto terminalHop = hop;
                if (terminalHop.at)
                    terminalHop.at->slice.bits = project(selected, hop.from.bits, terminalHop.at->slice.bits);
                if (hop.kind == "primitive_pin" && policy_ != TracePolicy::Structural)
                    terminalHop.reason = "unsupported";
                pending.push_back(terminal(work, terminalHop));
                if (!terminalHop.reason.empty()) {
                    auto point = semanticPoint(work, terminalHop, anchor);
                    // A terminal at this point only visualizes a stop. A known
                    // binding to a different pin consumes one relation first.
                    const bool binding = (anchor || (terminalHop.at && !terminalHop.map.empty())) &&
                                         !sameObject(work.point, point);
                    semantic.emplace_back(Work{std::move(point), {}, work.depth + (binding ? 1 : 0)},
                                          terminalHop.reason);
                }
            }
        }
        if (!commit(work, std::move(pending), cursor))
            return false;
        for (const auto &[boundary, code] : semantic)
            frontier(boundary, code, {}, hop.via);
        return true;
    }
    void steps(const Work &work, bool outsideBinding = false) {
        std::string cursor;
        do {
            if (expired()) {
                stop("budget_time", work, cursor.empty() ? std::nullopt : std::optional(cursor));
                return;
            }
            ConnectionRequest request;
            if (work.point.slice.bits.width)
                request.bits = work.point.slice.bits;
            request.side = work.point.side.value_or("");
            std::vector<std::optional<StepAnchor>> anchors;
            auto page = take(step(db_, work.point.slice.ref, back(), request, {1, cursor}, cancel_,
                                  outsideBinding, &anchors));
            const auto saved = cursor.empty() ? std::nullopt : std::optional(cursor);
            if (expired()) {
                stop("budget_time", work, saved);
                return;
            }
            for (size_t i = 0; i < page.result.hops.size(); ++i)
                if (!consume(work, page.result.hops[i], anchors.at(i), saved))
                    return;
            cursor = page.result.next;
        } while (!cursor.empty());
    }
    void opaque(const Work &work, const PinView &view) {
        const auto &active = view.binding();
        const bool enters = active.direction == (back() ? "out" : "in") ||
                            active.direction == "inout" || active.direction == "ref";
        const bool exits = active.direction == (back() ? "in" : "out") ||
                           active.direction == "inout" || active.direction == "ref";
        if (!active.width.value_or(0) || active.direction == "unknown" || !active.unresolved.empty()) {
            steps(work);
            return;
        }
        if (enters && policy_ == TracePolicy::Full && view.kind != InstKind::Primitive) {
            auto group = view.data.index->cellPins.find(active.inst);
            bool relationFound = false;
            if (group != view.data.index->cellPins.end())
                for (auto index : group->second) {
                    if (expired()) {
                        stop("budget_time", work, {});
                        return;
                    }
                    const auto &pin = view.data.facts->bindings[index];
                    const auto ref = qualify(pin.pin, view.parent);
                    if (!pin.width.value_or(0) || pin.direction == "unknown" || !pin.unresolved.empty()) {
                        const auto code = !pin.unresolved.empty() ? pin.unresolved
                                          : !pin.width.value_or(0) ? "unknown_pin_width" : "blackbox";
                        Hop missing;
                        missing.kind = "unresolved";
                        missing.via = ref;
                        missing.at = TracePoint{{ref, {0, pin.width.value_or(0)}}, "outside"};
                        missing.reason = code;
                        missing.fact = "f:";
                        cursorField(missing.fact, "reason:" + code);
                        cursorField(missing.fact, ref);
                        // Unknown counterparts are terminals in the working
                        // graph too. Charge them before retaining a frontier;
                        // otherwise an arbitrary pin list bypasses the budget.
                        if (!commit(work, {terminal(work, missing)}, {}))
                            return;
                        frontier({*missing.at, {}, work.depth}, code);
                        continue;
                    }
                    if (pin.direction != (back() ? "in" : "out") && pin.direction != "inout" && pin.direction != "ref")
                        continue;
                    std::string fact = "f:";
                    cursorField(fact, "blackbox");
                    cursorField(fact, back() ? ref : work.point.slice.ref);
                    cursorField(fact, back() ? work.point.slice.ref : ref);
                    std::vector<Pending> pending;
                    relation(pending, work, {{ref, {0, *pin.width}}, "outside"}, work.point.slice.bits,
                               fact, "blackbox", qualify(active.inst, view.parent), "data", "conservative", "all");
                    if (!commit(work, std::move(pending), {}))
                        return;
                    relationFound = true;
                }
            if (!relationFound) {
                Hop hop;
                hop.kind = "blackbox_pin";
                hop.via = work.point.slice.ref;
                hop.at = work.point;
                hop.fact = "f:";
                cursorField(hop.fact, "terminal");
                cursorField(hop.fact, work.point.slice.ref);
                if (!commit(work, {terminal(work, hop)}, {}))
                    return;
            }
        } else if (enters) {
            // Public step owns the terminal semantics for strategy boundaries.
            steps(work);
            if (stopped_)
                return;
        }
        if (exits)
            steps(work, true);
    }
    void enterModule(const Work &work, const PinView &view) {
        const auto key = *parseObject(work.point.slice.ref);
        // The borrow survives graph admissions and later cache eviction. Read
        // original internal segments, seeking directly to the selected range.
        const auto facts = take(db_.connections(view.body, cancel_));
        const auto &internal = facts->internals.at(key.index);
        if (internal.kind == "unresolved" || view.kind == InstKind::Interface) {
            Hop missing;
            missing.kind = "unresolved";
            missing.via = work.point.slice.ref;
            missing.at = work.point;
            missing.reason = view.kind == InstKind::Interface ? "interface_port"
                             : internal.reason.empty() ? "unsupported" : internal.reason;
            missing.fact = "f:";
            cursorField(missing.fact, "reason:" + missing.reason);
            cursorField(missing.fact, missing.via);
            if (commit(work, {terminal(work, missing)}, {}))
                frontier(work, missing.reason);
            return;
        }
        size_t index = 0;
        if (internal.kind == "mapped") {
            auto first = std::lower_bound(internal.segments.begin(), internal.segments.end(),
                                          work.point.slice.bits.lsb, [](const auto &s, uint64_t bit) {
                return s.pinBits.lsb + s.pinBits.width <= bit;
            });
            index = size_t(first - internal.segments.begin());
        }
        for (; index < db::internalSegmentCount(internal); ++index) {
            if (expired()) {
                stop("budget_time", work, {});
                return;
            }
            BindSegment direct;
            const auto &segment = db::internalSegment(internal, index, direct);
            if (segment.pinBits.lsb >= work.point.slice.bits.lsb + work.point.slice.bits.width)
                break;
            auto selected = overlap(segment.pinBits, work.point.slice.bits);
            if (!selected)
                continue;
            // This is an explicit, charged anchor backed by the actual internal
            // mapping. The two sides never become equal states. Once admitted,
            // inside step owns all continuations, errors and pagination cursors.
            std::string fact = "f:";
            cursorField(fact, "internal");
            cursorField(fact, work.point.slice.ref);
            cursorField(fact, std::to_string(index));
            std::vector<Pending> pending;
            relation(pending, work, {{work.point.slice.ref, *selected}, "inside"}, *selected,
                     fact, "binding", work.point.slice.ref);
            if (!commit(work, std::move(pending), {}))
                return;
        }
    }
    void expand(const Work &work) {
        if (work.point.side == "outside") {
            auto pin = pinView(work.point);
            if (expired()) {
                stop("budget_time", work, {});
                return;
            }
            if (pin) {
                if (pin->body == kNoBody) {
                    opaque(work, *pin);
                    return;
                }
                const auto &direction = pin->binding().direction;
                const bool enters = direction == (back() ? "out" : "in") ||
                                    direction == "inout" || direction == "ref";
                const bool exits = direction == (back() ? "in" : "out") ||
                                   direction == "inout" || direction == "ref";
                if (enters && work.point.slice.bits.width)
                    enterModule(work, *pin);
                if (!stopped_ && (exits || !enters || !work.point.slice.bits.width))
                    steps(work);
                return;
            }
        }
        steps(work);
    }
};
} // namespace

Result<QueryResult<TraceResult>> trace(const db::DesignDb &db, const TraceSelection &source,
                                      const std::optional<TraceSelection> &target,
                                      TraceDirection direction, TracePolicy policy,
                                      const Budget &budget, Cancel cancel) {
    try {
        validate(source);
        if (target)
            validate(*target);
        if ((direction != TraceDirection::Back && direction != TraceDirection::Forward) ||
            (policy != TracePolicy::Structural && policy != TracePolicy::Combinational && policy != TracePolicy::Full) ||
            budget.maxNodes < 1 || budget.maxEdges < 0 || budget.maxDepth < 0 ||
            (budget.maxMillis && *budget.maxMillis <= 0))
            throw Error{ErrorCode::BadRequest, "invalid trace direction, policy or budget"};
        cancelled(cancel);
        return TraceQuery(db, direction, policy, budget, cancel).run(source, target);
    } catch (const Error &error) {
        return error;
    }
}
} // namespace hier::detail
