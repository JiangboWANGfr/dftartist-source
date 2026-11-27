#include "Connections.h"
#include "AsyncWriteTypes.h"
#include "DependencyBits.h"
#include "StaticConnectionBits.h"
#include "ProcedureAnalysisLookup.h"
#include "ExpressionTargetProjection.h"
#include "Sources.h"
#include "TypeLayout.h"
#include "WriteIntervals.h"

#include <algorithm>
#include <functional>
#include <map>
#include <set>
#include <slang/analysis/CaseDecisionDag.h>
#include <slang/analysis/ValueDriver.h>
#include <slang/ast/ASTVisitor.h>
#include <slang/ast/Compilation.h>
#include <slang/ast/EvalContext.h>
#include <slang/ast/ValuePath.h>
#include <slang/ast/symbols/BlockSymbols.h>
#include <slang/ast/symbols/MemberSymbols.h>
#include <slang/ast/symbols/PortSymbols.h>
#include <slang/ast/symbols/VariableSymbols.h>
#include <slang/ast/types/AllTypes.h>
#include <slang/syntax/AllSyntax.h>
#include <slang/text/SourceManager.h>
#include <tuple>

namespace hier::frontend {
namespace {
using namespace slang;
using namespace slang::ast;
using namespace model;
using Deps = std::vector<Dep>;
using Bits = detail::DependencyBits;
using StaticBits = detail::StaticConnectionBits;
std::string local(char kind, size_t index) {
    return std::string(1, kind) + "::" + std::to_string(index);
}
std::string textOf(const Expression &e) {
    auto text = e.syntax ? e.syntax->toString() : "";
    auto first = text.find_first_not_of(" \t\r\n"), last = text.find_last_not_of(" \t\r\n");
    return first == std::string::npos ? "" : text.substr(first, last - first + 1);
}
uint64_t widthOf(const Type &type) { return bitWidth(type); }
std::optional<uint64_t> expressionWidth(const Expression &e) {
    if (e.kind == ExpressionKind::Streaming) {
        auto &stream = e.as<StreamingConcatenationExpression>();
        return stream.isFixedSize() ? std::optional<uint64_t>(stream.getBitstreamWidth())
                                    : std::nullopt;
    }
    return hasBitLayout(*e.type) ? std::optional<uint64_t>(widthOf(*e.type)) : std::nullopt;
}
std::vector<BitRange> mergeBitRanges(std::vector<BitRange> ranges) {
    std::sort(ranges.begin(), ranges.end(), [](auto a, auto b) { return a.lsb < b.lsb; });
    std::vector<BitRange> merged;
    for (auto b : ranges) {
        if (!b.width)
            continue;
        if (!merged.empty() && b.lsb <= merged.back().lsb + merged.back().width)
            merged.back().width =
                std::max(merged.back().lsb + merged.back().width, b.lsb + b.width) - merged.back().lsb;
        else
            merged.push_back(b);
    }
    return merged;
}
std::vector<BitRange> intersectBitRanges(const std::vector<BitRange> &a,
                                       const std::vector<BitRange> &b) {
    std::vector<BitRange> result;
    size_t i = 0, j = 0;
    while (i < a.size() && j < b.size()) {
        auto lo = std::max(a[i].lsb, b[j].lsb);
        auto hi = std::min(a[i].lsb + a[i].width, b[j].lsb + b[j].width);
        if (lo < hi)
            result.push_back({lo, hi - lo});
        if (a[i].lsb + a[i].width < b[j].lsb + b[j].width)
            ++i;
        else
            ++j;
    }
    return result;
}
void add(Deps &dest, const Deps &src) {
    detail::appendDependencies(dest, src);
}
void sortDeps(Deps &d) {
    std::sort(d.begin(), d.end(), [](const Dep &a, const Dep &b) {
        return std::tie(a.signal, a.role, a.precision, a.align, a.bits.lsb, a.bits.width) <
               std::tie(b.signal, b.role, b.precision, b.align, b.bits.lsb, b.bits.width);
    });
}
void partial(Completeness &c, std::string code, std::string at = "", std::string detail = "") {
    c.status = "partial";
    for (auto &r : c.reasons)
        if (r.code == code && r.at == at)
            return;
    c.reasons.push_back({std::move(code), std::move(at), std::move(detail)});
}
// Scope traversal is restricted to declarations owned by this body. Child instances and
// subroutine bodies are separate semantic domains.
template <class F> void members(const Scope &scope, F &&fn) {
    for (auto &m : scope.members()) {
        fn(m);
        if (m.kind == SymbolKind::GenerateBlock && !m.as<GenerateBlockSymbol>().isUninstantiated)
            members(m.as<GenerateBlockSymbol>(), fn);
        else if (m.kind == SymbolKind::GenerateBlockArray)
            for (auto g : m.as<GenerateBlockArraySymbol>().entries)
                if (!g->isUninstantiated)
                    members(*g, fn);
    }
}
struct ExternalVisitor
    : ASTVisitor<ExternalVisitor, VisitFlags::Expressions | VisitFlags::Statements> {
    ExternalAccess &accesses;
    EvalContext eval;
    unsigned access = 1;
    std::unordered_set<const InstanceBodySymbol *> *affectedBodies = nullptr;
    const InstanceBodySymbol *sourceBody = nullptr;
    ExternalVisitor(ExternalAccess &a, const Scope &scope)
        : accesses(a), eval(ASTContext(scope, LookupLocation::max)) {}
    void connection(const Expression &e, unsigned direction) {
        auto saved = access;
        access = direction;
        if (direction != 1 && e.kind == ExpressionKind::Assignment) {
            // Output and inout connections wrap the external lvalue in an
            // assignment to a placeholder. Direction applies to that lvalue;
            // selectors are still reads, handled by the selection visitors.
            auto &assignment = e.as<AssignmentExpression>();
            assignment.left().visit(*this);
            access = 1;
            assignment.right().visit(*this);
        } else
            e.visit(*this);
        access = saved;
    }
    void handle(const AssignmentExpression &e) {
        auto saved = access;
        access = 2;
        e.left().visit(*this);
        access = 1;
        e.right().visit(*this);
        if (e.op)
            e.left().visit(*this);
        access = saved;
    }
    void handle(const ElementSelectExpression &e) {
        e.value().visit(*this);
        auto saved = access;
        access = 1;
        e.selector().visit(*this);
        access = saved;
    }
    void handle(const RangeSelectExpression &e) {
        e.value().visit(*this);
        auto saved = access;
        access = 1;
        e.left().visit(*this);
        e.right().visit(*this);
        access = saved;
    }
    void handle(const HierarchicalValueExpression &e) {
        accesses[&e.symbol] |= access;
        if (affectedBodies) {
            affectedBodies->insert(sourceBody);
            auto scope = e.symbol.getParentScope();
            while (scope && scope->asSymbol().kind != SymbolKind::InstanceBody)
                scope = scope->asSymbol().getParentScope();
            if (scope)
                affectedBodies->insert(&scope->asSymbol().as<InstanceBodySymbol>());
        }
    }
};

struct Extractor {
    const InstanceBodySymbol &body;
    const InstanceBodySymbol *analyzedBody = nullptr;
    const analysis::AnalysisManager *analysis;
    std::optional<detail::ProcedureAnalysisLookup> procedureAnalysis;
    const ExternalAccess &external;
    EvalContext eval;
    BodyConnections out;
    std::unordered_map<const ValueSymbol *, size_t> ids;
    std::unordered_map<std::string, size_t> lexicalIds;
    QueryResult<ProcessInfo> *current = nullptr;
    detail::WriteIntervals writes;
    Deps control;
    std::vector<EventInfo> events;
    detail::AsyncWriteTypes asyncTypes;
    std::set<std::string> conditionedEvents;
    std::map<const Statement *, std::vector<std::string>> asyncBranches;
    std::vector<std::string> activeAsync;
    std::optional<Slice> outputPin;

    Extractor(const InstanceBodySymbol &b, const analysis::AnalysisManager *a,
              const ExternalAccess &e)
        : body(b), analysis(a), external(e), eval(ASTContext(b, LookupLocation::max)) {}

    std::string relative(const Symbol &s) const {
        auto path = s.getHierarchicalPath();
        auto scope = s.getParentScope();
        while (scope && scope->asSymbol().kind != SymbolKind::InstanceBody)
            scope = scope->asSymbol().getParentScope();
        if (scope) {
            auto prefix = scope->asSymbol().getHierarchicalPath();
            if (path.starts_with(prefix + "."))
                return path.substr(prefix.size() + 1);
            if (path == prefix)
                return "";
        }
        return path;
    }
    std::string signal(const ValueSymbol *s) const {
        if (!s)
            return {};
        if (auto i = ids.find(s); i != ids.end())
            return local('s', i->second);
        return {};
    }
    std::string oracleSignal(const ValueSymbol &s) const {
        if (auto i = lexicalIds.find(relative(s)); i != lexicalIds.end())
            return local('s', i->second);
        return {};
    }
    const analysis::AnalyzedProcedure *procedureFor(const Symbol *source) {
        if (!source)
            return nullptr;
        if (!procedureAnalysis) {
            const auto direct = analysis->getAnalyzedScope(body);
            const auto canonical = analyzedBody ? analysis->getAnalyzedScope(*analyzedBody) : nullptr;
            using Procedures = std::span<const analysis::AnalyzedProcedure>;
            procedureAnalysis.emplace(direct ? Procedures(direct->procedures) : Procedures{},
                                      canonical ? Procedures(canonical->procedures) : Procedures{});
        }
        return procedureAnalysis->find(*source, [&](const Symbol &symbol) { return relative(symbol); });
    }
    void externalRef(const ValuePath &p, const char *access) {
        if (!current || !p.rootExpr || p.rootExpr->kind != ExpressionKind::HierarchicalValue)
            return;
        ExternalRef r{textOf(*p.fullExpr), access};
        if (r.text.empty())
            r.text = p.rootSymbol()->getHierarchicalPath();
        for (auto &prev : current->result.externalRefs)
            if (prev.text == r.text && prev.access == r.access)
                return;
        current->result.externalRefs.push_back(r);
        partial(current->completeness, "hier_ref", current->result.ref);
    }
    void possibleWrites(const Expression &e, std::vector<Slice> &targets) {
        // Only lvalue forms are eligible. Visiting every read path of an rvalue
        // (a & b, calls, etc.) would incorrectly invent possible output targets.
        if (e.kind == ExpressionKind::Concatenation) {
            for (auto operand : e.as<ConcatenationExpression>().operands())
                possibleWrites(*operand, targets);
            return;
        }
        if (e.kind == ExpressionKind::Streaming) {
            for (const auto &stream : e.as<StreamingConcatenationExpression>().streams())
                possibleWrites(*stream.operand, targets);
            return; // with/selectors are reads, never destinations.
        }
        if (e.kind != ExpressionKind::NamedValue && e.kind != ExpressionKind::HierarchicalValue &&
            e.kind != ExpressionKind::ElementSelect && e.kind != ExpressionKind::RangeSelect &&
            e.kind != ExpressionKind::MemberAccess)
            return;
        ValuePath path(e, eval);
        externalRef(path, "write");
        auto ref = signal(path.rootSymbol());
        if (!ref.empty() && path.lsp)
            targets.push_back({ref, {path.lspBounds.first, path.lspBounds.second - path.lspBounds.first + 1}});
    }
    Deps reads(const Expression &e, std::string role = "data", std::string precision = "exact") {
        Deps result;
        if (outputPin) {
            struct Placeholder : ASTVisitor<Placeholder, VisitFlags::AllGood> {
                bool found = false;
                void handle(const EmptyArgumentExpression &) { found = true; }
            } placeholder;
            e.visit(placeholder);
            if (placeholder.found)
                result.push_back({outputPin->ref, outputPin->bits, role, precision, "all"});
        }
        ValuePath::visitPaths(e, eval, [&](const ValuePath &p) {
            externalRef(p, "read");
            auto ref = signal(p.rootSymbol());
            if (ref.empty() || !p.lsp)
                return;
            result.push_back({ref,
                              {p.lspBounds.first, p.lspBounds.second - p.lspBounds.first + 1},
                              role,
                              precision,
                              "all"});
        });
        sortDeps(result);
        result.erase(std::unique(result.begin(), result.end()), result.end());
        return result;
    }
    std::optional<std::pair<const Expression *, BitRange>> selection(const Expression &e) {
        if (e.kind == ExpressionKind::RangeSelect) {
            auto &r = e.as<RangeSelectExpression>();
            if (auto b = r.evalRange(eval, {}, false); b && b->lower() >= 0)
                return std::pair{&r.value(), BitRange{uint64_t(b->lower()), widthOf(*e.type)}};
        } else if (e.kind == ExpressionKind::ElementSelect) {
            auto &s = e.as<ElementSelectExpression>();
            if (s.value().type->hasFixedRange()) {
                auto n = s.selector().eval(eval);
                if (n && n.isInteger())
                    if (auto index = n.integer().as<int32_t>()) {
                        auto range = s.value().type->getFixedRange();
                        if (s.value().type->isUnpackedArray())
                            range = range.reverse();
                        if (range.containsPoint(*index))
                            return std::pair{
                                &s.value(),
                                BitRange{uint64_t(range.translateIndex(*index)) * widthOf(*e.type),
                                         widthOf(*e.type)}};
                    }
            }
        }
        return {};
    }
    Bits expression(const Expression &e) {
        const auto width = expressionWidth(e).value_or(0);
        if (!width)
            return {};
        if (e.kind == ExpressionKind::EmptyArgument && outputPin) {
            const auto used = std::min(width, outputPin->bits.width);
            return Bits(used, {{outputPin->ref, {outputPin->bits.lsb, used},
                                "data", "exact", "bitwise"}}).resized(width);
        }
        ValuePath p(e, eval);
        if (!p.empty() && p.isFullyStatic() && p.rootSymbol() &&
            e.kind != ExpressionKind::Conversion) {
            externalRef(p, "read");
            auto ref = signal(p.rootSymbol());
            return ref.empty() ? Bits(width)
                               : Bits(width, {{ref, {p.lspBounds.first, width},
                                               "data", "exact", "bitwise"}});
        }
        auto cv = e.eval(eval);
        if (cv)
            return Bits(width);
        if (auto s = selection(e))
            return expression(*s->first).slice(s->second.lsb, width).resized(width);
        auto extend = [&](Bits in, bool sign) { return in.resized(width, sign); };
        switch (e.kind) {
        case ExpressionKind::Call: {
            auto &c = e.as<CallExpression>();
            if ((c.getSubroutineName() == "$signed" || c.getSubroutineName() == "$unsigned") &&
                c.arguments().size() == 1)
                return extend(expression(*c.arguments()[0]), e.type->isSigned());
            break;
        }
        case ExpressionKind::Conversion: {
            auto &operand = e.as<ConversionExpression>().operand();
            if (!expressionWidth(operand))
                return Bits(width, reads(operand, "data", "conservative"));
            return extend(expression(operand), operand.type->isSigned());
        }
        case ExpressionKind::Concatenation: {
            Bits result;
            auto ops = e.as<ConcatenationExpression>().operands();
            for (auto it = ops.rbegin(); it != ops.rend(); ++it) {
                // Evaluate every operand even if already full, retaining external
                // reference discovery and diagnostics from the original traversal.
                auto operand = expression(**it);
                result.append(operand.slice(0, width - result.size()));
            }
            return result.resized(width);
        }
        case ExpressionKind::Replication:
            return expression(e.as<ReplicationExpression>().concat()).repeated(width);
        case ExpressionKind::ConditionalOp: {
            auto &c = e.as<ConditionalExpression>();
            auto a = extend(expression(c.left()), false), b = extend(expression(c.right()), false);
            Deps cond;
            {
                detail::DependencyUnion conditions(cond);
                for (auto &x : c.conditions)
                    conditions.append(reads(*x.expr, "control"));
            }
            return a.united(b).united(Bits(width, std::move(cond)));
        }
        case ExpressionKind::UnaryOp: {
            auto &u = e.as<UnaryExpression>();
            if (u.op == UnaryOperator::BitwiseNot || u.op == UnaryOperator::Plus)
                return extend(expression(u.operand()), false);
            if (u.op != UnaryOperator::Minus)
                return Bits(width, reads(u.operand()));
            break;
        }
        case ExpressionKind::BinaryOp: {
            auto &b = e.as<BinaryExpression>();
            auto op = b.op;
            if (op == BinaryOperator::BinaryAnd || op == BinaryOperator::BinaryOr ||
                op == BinaryOperator::BinaryXor || op == BinaryOperator::BinaryXnor) {
                auto l = extend(expression(b.left()), false),
                     r = extend(expression(b.right()), false);
                return l.united(r);
            }
            if (op == BinaryOperator::LogicalShiftLeft || op == BinaryOperator::LogicalShiftRight ||
                op == BinaryOperator::ArithmeticShiftLeft ||
                op == BinaryOperator::ArithmeticShiftRight) {
                auto shift = b.right().eval(eval);
                if (shift && shift.isInteger())
                    if (auto n = shift.integer().as<uint64_t>()) {
                        auto l = extend(expression(b.left()), false);
                        if (op == BinaryOperator::LogicalShiftLeft ||
                            op == BinaryOperator::ArithmeticShiftLeft) {
                            Bits result(std::min(width, *n));
                            if (*n < width)
                                result.append(l.slice(0, width - *n));
                            return result;
                        }
                        auto result = *n < width ? l.slice(*n, width - *n) : Bits{};
                        if (op == BinaryOperator::ArithmeticShiftRight &&
                            b.left().type->isSigned())
                            result.append(Bits(1, l.bit(width - 1)).repeated(width - result.size()));
                        else
                            result = result.resized(width);
                        return result;
                    }
            }
            if (op == BinaryOperator::Equality || op == BinaryOperator::Inequality ||
                op == BinaryOperator::CaseEquality || op == BinaryOperator::CaseInequality ||
                op == BinaryOperator::GreaterThan || op == BinaryOperator::GreaterThanEqual ||
                op == BinaryOperator::LessThan || op == BinaryOperator::LessThanEqual ||
                op == BinaryOperator::LogicalAnd || op == BinaryOperator::LogicalOr)
                return Bits(width, reads(e));
            break;
        }
        default:
            break;
        }
        return Bits(width, reads(e, "data", "conservative"));
    }
    // A trivial connection retains static signal ranges and explicit constant text,
    // separately from expression dependencies, so wires remain distinct from logic.
    StaticBits trivial(const Expression &e) {
        const auto width = widthOf(*e.type);
        ValuePath p(e, eval);
        if (!p.empty() && p.isFullyStatic() && e.kind != ExpressionKind::Conversion) {
            auto ref = signal(p.rootSymbol());
            return ref.empty() ? StaticBits{} : StaticBits::signal(ref, {p.lspBounds.first, width});
        }
        auto cv = e.eval(eval);
        if (cv && cv.isInteger()) {
            std::string digits;
            digits.reserve(size_t(width));
            for (auto bit = width; bit; --bit)
                digits.push_back(cv.integer()[int32_t(bit - 1)].toChar());
            return StaticBits::constant(digits);
        }
        if (e.kind == ExpressionKind::Assignment)
            return trivial(e.as<AssignmentExpression>().left());
        if (e.kind == ExpressionKind::Call) {
            auto &c = e.as<CallExpression>();
            if ((c.getSubroutineName() == "$signed" || c.getSubroutineName() == "$unsigned") &&
                c.arguments().size() == 1) {
                auto value = trivial(*c.arguments()[0]);
                return value.empty() ? StaticBits{} : value.resized(width, e.type->isSigned());
            }
        }
        if (e.kind == ExpressionKind::Conversion) {
            auto &operand = e.as<ConversionExpression>().operand();
            auto value = trivial(operand);
            return value.empty() ? StaticBits{} : value.resized(width, operand.type->isSigned());
        }
        if (e.kind == ExpressionKind::Concatenation) {
            StaticBits result;
            auto operands = e.as<ConcatenationExpression>().operands();
            for (auto it = operands.rbegin(); it != operands.rend(); ++it) {
                auto value = trivial(**it);
                if (value.empty())
                    return {};
                result.append(value);
            }
            return result;
        }
        if (e.kind == ExpressionKind::Replication) {
            auto value = trivial(e.as<ReplicationExpression>().concat());
            return value.empty() ? StaticBits{} : value.repeated(width);
        }
        return {};
    }
    model::Expr tree(const Expression &e) {
        model::Expr r;
        r.op = "other";
        r.text = textOf(e);
        r.width = expressionWidth(e);
        r.isSigned = e.type->isSigned();
        if (e.kind == ExpressionKind::EmptyArgument && outputPin) {
            r.op = "ref";
            r.slice = *outputPin;
            return r;
        }
        ValuePath p(e, eval);
        if (!p.empty() && p.isFullyStatic() && e.kind != ExpressionKind::Conversion) {
            auto ref = signal(p.rootSymbol());
            if (!ref.empty()) {
                r.op = "ref";
                r.slice = {ref, {p.lspBounds.first, p.lspBounds.second - p.lspBounds.first + 1}};
                return r;
            }
        }
        auto cv = e.eval(eval);
        if (cv && cv.isInteger()) {
            r.op = "const";
            auto n = widthOf(*e.type);
            r.value = std::to_string(n) + "'b";
            for (uint64_t i = n; i > 0; --i)
                r.value += cv.integer()[int32_t(i - 1)].toChar();
            return r;
        }
        if (e.kind == ExpressionKind::UnaryOp) {
            auto &u = e.as<UnaryExpression>();
            switch (u.op) {
            case UnaryOperator::BitwiseNot:
                r.op = "not";
                break;
            case UnaryOperator::BitwiseAnd:
                r.op = "reduce_and";
                break;
            case UnaryOperator::BitwiseOr:
                r.op = "reduce_or";
                break;
            case UnaryOperator::BitwiseXor:
                r.op = "reduce_xor";
                break;
            default:
                break;
            }
            if (r.op != "other")
                r.args.push_back(tree(u.operand()));
        }
        if (e.kind == ExpressionKind::BinaryOp) {
            auto &b = e.as<BinaryExpression>();
            switch (b.op) {
            case BinaryOperator::BinaryAnd:
                r.op = "and";
                break;
            case BinaryOperator::BinaryOr:
                r.op = "or";
                break;
            case BinaryOperator::BinaryXor:
                r.op = "xor";
                break;
            default:
                break;
            }
            if (r.op != "other") {
                r.args.push_back(tree(b.left()));
                r.args.push_back(tree(b.right()));
            }
        }
        if (e.kind == ExpressionKind::ConditionalOp) {
            auto &c = e.as<ConditionalExpression>();
            if (c.conditions.size() == 1) {
                r.op = "mux";
                r.args = {tree(*c.conditions[0].expr), tree(c.left()), tree(c.right())};
            }
        }
        if (e.kind == ExpressionKind::Concatenation) {
            r.op = "concat";
            for (auto op : e.as<ConcatenationExpression>().operands())
                r.args.push_back(tree(*op));
        }
        if (r.op == "other") {
            if (r.text.empty() && e.kind == ExpressionKind::Conversion)
                r.text = textOf(e.as<ConversionExpression>().operand());
            if (r.text.empty())
                r.text = "<expression of type " + e.type->toString() + ">";
            // Summarize projected output dependencies, not syntactic reads. In
            // particular, truncation and shifts must not resurrect discarded bits.
            if (!r.width)
                r.uses = reads(e, "data", "conservative");
            else {
                struct Coverage {
                    std::vector<BitRange> any, every;
                    size_t outputs = 0;
                };
                using Key = std::pair<std::string, std::string>;
                std::map<Key, Coverage> groups;
                const auto projected = expression(e);
                for (const auto &range : projected.ranges()) {
                    std::map<Key, std::vector<BitRange>> exact;
                    for (auto &d : range.deps) {
                        Key key{d.signal, d.role};
                        groups[key].any.push_back(d.bits);
                        if (d.align == "all" && d.precision == "exact")
                            exact[key].push_back(d.bits);
                    }
                    for (auto &[key, ranges] : exact) {
                        auto &g = groups[key];
                        auto merged = mergeBitRanges(std::move(ranges));
                        g.every = g.outputs == 0 ? std::move(merged)
                                                 : intersectBitRanges(g.every, merged);
                        g.outputs += range.end - range.begin;
                    }
                }
                for (auto &[key, g] : groups) {
                    // An exact relation on only some result bits becomes a
                    // conservative all relation when the result coordinate is lost.
                    if (g.outputs != *r.width)
                        g.every.clear();
                    const auto &[ref, role] = key;
                    size_t nextExact = 0;
                    for (auto b : mergeBitRanges(std::move(g.any))) {
                        uint64_t pos = b.lsb, end = b.lsb + b.width;
                        while (nextExact < g.every.size() && g.every[nextExact].lsb < end) {
                            auto exact = g.every[nextExact++];
                            if (pos < exact.lsb)
                                r.uses.push_back({ref, {pos, exact.lsb - pos}, role,
                                                  "conservative", "all"});
                            r.uses.push_back({ref, exact, role, "exact", "all"});
                            pos = exact.lsb + exact.width;
                        }
                        if (pos < end)
                            r.uses.push_back({ref, {pos, end - pos}, role, "conservative", "all"});
                    }
                }
            }
        }
        return r;
    }
    using ValueTarget = detail::ExpressionTarget;
    bool valueTargets(const Expression &lhs, uint64_t from, std::vector<ValueTarget> &targets) {
        if (lhs.kind == ExpressionKind::Concatenation) {
            auto operands = lhs.as<ConcatenationExpression>().operands();
            for (auto it = operands.rbegin(); it != operands.rend(); ++it) {
                if (!valueTargets(**it, from, targets))
                    return false;
                from += widthOf(*(*it)->type);
            }
            return true;
        }
        ValuePath path(lhs, eval);
        auto ref = signal(path.rootSymbol());
        if (path.empty() || !path.isFullyStatic() || ref.empty() || !hasBitLayout(*lhs.type))
            return false;
        targets.push_back({{ref, {path.lspBounds.first, widthOf(*lhs.type)}}, from});
        return true;
    }
    void mapValues(ProcessInfo &proc, const Expression *lhs, const std::optional<Slice> &target) {
        if (!proc.expr)
            return;
        std::vector<ValueTarget> targets;
        bool known = proc.expr->width.has_value();
        if (lhs)
            known = valueTargets(*lhs, 0, targets) && known;
        else if (target)
            targets.push_back({*target, 0});
        else
            known = false;
        const detail::ExpressionTargetProjection projection(targets, known ? proc.writes.size() : 0);
        for (auto &w : proc.writes) {
            ExprMapping mapping;
            if (known)
                projection.project(w.target, [&](BitMapSegment segment) {
                    mapping.segments.push_back(segment);
                });
            std::sort(mapping.segments.begin(), mapping.segments.end(), [](auto a, auto b) {
                return std::tie(a.to, a.from) < std::tie(b.to, b.from);
            });
            uint64_t covered = w.target.bits.lsb;
            std::vector<BitMapSegment> merged;
            bool valid = known;
            for (auto s : mapping.segments) {
                if (!s.width || s.to != covered || s.from > *proc.expr->width ||
                    s.width > *proc.expr->width - s.from)
                    valid = false;
                covered = s.to + s.width;
                if (!merged.empty() && merged.back().to + merged.back().width == s.to &&
                    merged.back().from + merged.back().width == s.from)
                    merged.back().width += s.width;
                else
                    merged.push_back(s);
            }
            if (valid && covered == w.target.bits.lsb + w.target.bits.width)
                mapping.segments = std::move(merged);
            else {
                mapping.status = "unresolved";
                mapping.reason = "unsupported";
                mapping.segments.clear();
                partial(current->completeness, "unsupported", proc.ref,
                        "Cannot map RHS result bits to this write target");
            }
            w.exprMap = std::move(mapping);
        }
    }
    // A single continuous assignment between equal static local slices is already
    // one interval. Keep the common finish() validation and expression mapping.
    bool directAssignment(const Expression &lhs, const Expression &rhs) {
        if (lhs.kind == ExpressionKind::Conversion || rhs.kind == ExpressionKind::Conversion)
            return false;
        const auto width = expressionWidth(lhs);
        if (!width || !*width || width != expressionWidth(rhs))
            return false;
        ValuePath target(lhs, eval), source(rhs, eval);
        auto isLocalSlice = [&](const ValuePath &path) {
            return !path.empty() && path.isFullyStatic() && path.rootExpr &&
                   path.rootExpr->kind != ExpressionKind::HierarchicalValue &&
                   path.lspBounds.second >= path.lspBounds.first &&
                   path.lspBounds.second - path.lspBounds.first == *width - 1;
        };
        if (!isLocalSlice(target) || !isLocalSlice(source))
            return false;
        const auto targetRef = signal(target.rootSymbol()), sourceRef = signal(source.rootSymbol());
        if (targetRef.empty() || sourceRef.empty())
            return false;
        current->result.writes.push_back(
            {{targetRef, {target.lspBounds.first, *width}},
             {{sourceRef, {source.lspBounds.first, *width}, "data", "exact", "bitwise"}}});
        return true;
    }
    void assign(const Expression &lhs, const Expression &rhs) {
        auto data = expression(rhs);
        auto targets = trivial(lhs);
        struct OperandType {
            BitRange bits;
            std::string type;
        };
        std::vector<OperandType> constantTypes;
        if (!activeAsync.empty()) {
            auto value = rhs.eval(eval);
            if (value && value.isInteger()) {
                auto integer = value.integer().resize(bitwidth_t(widthOf(*lhs.type)));
                // Concatenation operands own consecutive RHS bit spaces. Classify
                // each whole operand, retaining the original nonzero rule.
                std::function<void(const Expression &, uint64_t)> project =
                    [&](const Expression &target, uint64_t offset) {
                        if (target.kind == ExpressionKind::Concatenation) {
                            auto operands = target.as<ConcatenationExpression>().operands();
                            for (auto it = operands.rbegin(); it != operands.rend(); ++it) {
                                project(**it, offset);
                                offset += widthOf(*(*it)->type);
                            }
                        } else {
                            const auto width = widthOf(*target.type);
                            if (!width || offset > targets.size() || width > targets.size() - offset)
                                return;
                            auto part = integer.slice(int32_t(offset + width - 1), int32_t(offset));
                            const auto type = part.hasUnknown() ? "unknown"
                                              : bool(part != 0) ? "set" : "reset";
                            if (!constantTypes.empty() && constantTypes.back().type == type &&
                                constantTypes.back().bits.lsb + constantTypes.back().bits.width ==
                                    offset)
                                constantTypes.back().bits.width += width;
                            else
                                constantTypes.push_back({{offset, width}, type});
                        }
                    };
                project(lhs, 0);
            }
        }
        if (!targets.empty()) {
            size_t classification = 0;
            for (const auto &target : targets.ranges()) {
                if (target.target.kind != "signal")
                    continue;
                const auto end = target.pinBits.lsb + target.pinBits.width;
                for (auto from = target.pinBits.lsb; from < end;) {
                    auto stop = end;
                    std::string_view type = "unknown";
                    while (classification < constantTypes.size() &&
                           constantTypes[classification].bits.lsb +
                               constantTypes[classification].bits.width <= from)
                        ++classification;
                    if (classification < constantTypes.size()) {
                        const auto &entry = constantTypes[classification];
                        if (entry.bits.lsb <= from) {
                            type = entry.type;
                            stop = std::min(stop, entry.bits.lsb + entry.bits.width);
                        } else
                            stop = std::min(stop, entry.bits.lsb);
                    }
                    const BitRange targetRange{
                        target.target.bits.lsb + from - target.pinBits.lsb, stop - from};
                    const auto projected = data.slice(from, stop - from).resized(stop - from);
                    for (const auto &range : projected.ranges())
                        writes.addProjected(target.target.signal,
                                            {targetRange.lsb + range.begin, range.end - range.begin},
                                            range.deps, control);
                    for (const auto &event : activeAsync)
                        asyncTypes.record(target.target.signal, targetRange, event, type);
                    from = stop;
                }
            }
        } else {
            auto all = reads(rhs, "data", "conservative");
            ValuePath::visitPaths(
                lhs, eval,
                [&](const ValuePath &p) {
                    externalRef(p, "write");
                    auto ref = signal(p.rootSymbol());
                    if (ref.empty() || !p.lsp)
                        return;
                    // A destination can hide dynamic selectors beneath a range
                    // or member selection. Each path owns its address controls;
                    // they must not leak to other writes in this process.
                    Deps selectors;
                    for (const auto &part : p) {
                        if (part.kind == ExpressionKind::ElementSelect)
                            add(selectors, reads(part.as<ElementSelectExpression>().selector(),
                                                 "control", "conservative"));
                        else if (part.kind == ExpressionKind::RangeSelect) {
                            const auto &range = part.as<RangeSelectExpression>();
                            add(selectors, reads(range.left(), "control", "conservative"));
                            add(selectors, reads(range.right(), "control", "conservative"));
                        }
                    }
                    auto deps = all;
                    add(deps, control);
                    add(deps, selectors);
                    writes.addUniform(ref,
                                      {p.lspBounds.first,
                                       p.lspBounds.second - p.lspBounds.first + 1}, deps);
                },
                true);
        }
    }
    bool caseCovered(const CaseStatement &s) {
        if (!s.expr.type->isIntegral())
            return false;
        std::vector<SVInt> clauses;
        for (auto &item : s.items)
            for (auto e : item.expressions) {
                auto v = e->eval(eval);
                if (!v || !v.isInteger())
                    return false;
                auto n = v.integer();
                if (s.condition == CaseStatementCondition::Normal && n.hasUnknown())
                    continue;
                if (s.condition == CaseStatementCondition::WildcardJustZ && n.countXs())
                    continue;
                clauses.push_back(n.trunc(s.expr.type->getBitWidth()));
            }
        analysis::CaseDecisionDag dag(clauses, s.expr.type->getBitWidth(),
                                      s.condition == CaseStatementCondition::WildcardXOrZ, 1000000);
        return !dag.gaveUp && dag.isExhaustive();
    }
    void leadingAsync(const Statement &stmt) {
        if (stmt.kind == StatementKind::Block) {
            leadingAsync(stmt.as<BlockStatement>().body);
        } else if (stmt.kind == StatementKind::List) {
            auto list = stmt.as<StatementList>().list;
            if (!list.empty())
                leadingAsync(*list.front());
        } else if (stmt.kind == StatementKind::Conditional) {
            auto &s = stmt.as<ConditionalStatement>();
            for (auto &c : s.conditions)
                for (auto &d : reads(*c.expr))
                    for (auto &e : events)
                        if (d.signal == e.signal) {
                            conditionedEvents.insert(e.signal);
                            // Evaluate only the condition with this event asserted. This
                            // context never affects dependency / reachability evaluation.
                            EvalContext asserted(ASTContext(body, LookupLocation::max));
                            for (auto &[symbol, id] : ids)
                                if (local('s', id) == e.signal && widthOf(symbol->getType()) == 1)
                                    asserted.createLocal(
                                        symbol, SVInt(1, e.edge == "posedge" ? 1 : 0, false));
                            bool known = true, takeTrue = true;
                            for (auto &condition : s.conditions) {
                                auto cv = condition.expr->eval(asserted);
                                if (!cv || condition.pattern) {
                                    known = false;
                                    break;
                                }
                                takeTrue &= cv.isTrue();
                            }
                            if (known) {
                                auto branch = takeTrue ? &s.ifTrue : s.ifFalse;
                                if (branch)
                                    asyncBranches[branch].push_back(e.signal);
                            }
                        }
            // Only the leading if / else-if chain classifies asynchronous events.
            // Conditions nested in a data branch must not reclassify its clock.
            if (s.ifFalse && s.ifFalse->kind == StatementKind::Conditional)
                leadingAsync(*s.ifFalse);
        }
    }
    struct Statements : ASTVisitor<Statements, VisitFlags::Expressions | VisitFlags::Statements> {
        Extractor &x;
        explicit Statements(Extractor &value) : x(value) {}
        void handle(const AssignmentExpression &e) { x.assign(e.left(), e.right()); }
        void handle(const ConditionalStatement &s) {
            auto saved = x.control;
            bool canTrue = true, canFalse = false;
            for (auto &c : s.conditions) {
                add(x.control, x.reads(*c.expr, "control"));
                auto cv = c.expr->eval(x.eval);
                if (!cv || c.pattern)
                    canFalse = true;
                else if (!cv.isTrue()) {
                    canTrue = false;
                    canFalse = true;
                    break;
                }
            }
            auto branch = [&](const Statement &stmt) {
                auto previous = x.activeAsync;
                if (auto it = x.asyncBranches.find(&stmt); it != x.asyncBranches.end())
                    x.activeAsync.insert(x.activeAsync.end(), it->second.begin(), it->second.end());
                stmt.visit(*this);
                x.activeAsync = std::move(previous);
            };
            if (canTrue)
                branch(s.ifTrue);
            if (canFalse && s.ifFalse)
                branch(*s.ifFalse);
            x.control = std::move(saved);
        }
        void handle(const CaseStatement &s) {
            auto saved = x.control;
            add(x.control, x.reads(s.expr, "control"));
            for (auto &i : s.items) {
                for (auto e : i.expressions)
                    add(x.control, x.reads(*e, "control"));
                i.stmt->visit(*this);
            }
            if (s.defaultCase && !x.caseCovered(s))
                s.defaultCase->visit(*this);
            x.control = std::move(saved);
        }
        void handle(const TimedStatement &s) {
            x.timing(s.timing);
            x.leadingAsync(s.stmt);
            s.stmt.visit(*this);
        }
    };
    void timing(const TimingControl &t) {
        if (t.kind == TimingControlKind::EventList) {
            for (auto c : t.as<EventListControl>().events)
                timing(*c);
            return;
        }
        if (t.kind != TimingControlKind::SignalEvent)
            return;
        auto &e = t.as<SignalEventControl>();
        if (e.edge == EdgeKind::None)
            return;
        auto d = reads(e.expr);
        for (auto &dep : d)
            events.push_back({dep.signal, dep.bits,
                              e.edge == EdgeKind::PosEdge ? "posedge" : "negedge", "unknown"});
    }
    void begin(std::string kind) {
        out.processes.push_back({});
        current = &out.processes.back();
        current->result.kind = std::move(kind);
        current->result.ref = local('x', out.processes.size() - 1);
        current->result.inst = "i:";
        writes.clear();
        control.clear();
        events.clear();
        asyncTypes.clear();
        conditionedEvents.clear();
        asyncBranches.clear();
        activeAsync.clear();
        outputPin.reset();
    }
    using Ranges = std::map<std::string, std::vector<std::pair<uint64_t, uint64_t>>>;
    static void range(Ranges &ranges, const std::string &ref, BitRange b) {
        if (!ref.empty() && b.width)
            ranges[ref].push_back({b.lsb, b.lsb + b.width});
    }
    static void normalize(Ranges &rs) {
        for (auto &[key, v] : rs) {
            (void)key;
            std::sort(v.begin(), v.end());
            std::vector<std::pair<uint64_t, uint64_t>> m;
            for (auto r : v) {
                if (!m.empty() && r.first <= m.back().second)
                    m.back().second = std::max(m.back().second, r.second);
                else
                    m.push_back(r);
            }
            v = std::move(m);
        }
    }
    // Independent backwards projection of demanded output ranges. This verifier uses
    // intervals, not the per-bit dependency builder above. Source reads are collected
    // separately, so truncation/constant shifts never erase Slang access evidence.
    Deps demanded(const Expression &e, BitRange demand) {
        // Streaming operands have their own bitstream width, independent of
        // their AST type. Any demanded output may read any streamed parameter.
        if (e.kind == ExpressionKind::Streaming)
            return demand.width ? reads(e) : Deps{};
        auto w = widthOf(*e.type);
        if (demand.lsb >= w || !demand.width)
            return {};
        demand.width = std::min(demand.width, w - demand.lsb);
        if (e.kind == ExpressionKind::EmptyArgument && outputPin)
            return {{outputPin->ref,
                     {outputPin->bits.lsb + demand.lsb, demand.width},
                     "data",
                     "exact",
                     "all"}};
        if (e.kind == ExpressionKind::Conversion) {
            auto &child = e.as<ConversionExpression>().operand();
            if (child.kind == ExpressionKind::Streaming || !hasBitLayout(*child.type))
                return reads(child);
            auto n = widthOf(*child.type);
            Deps d;
            if (demand.lsb < n)
                d = demanded(child, {demand.lsb, std::min(demand.width, n - demand.lsb)});
            if (child.type->isSigned() && n && demand.lsb + demand.width > n)
                add(d, demanded(child, {n - 1, 1}));
            return d;
        }
        ValuePath p(e, eval);
        if (!p.empty() && p.isFullyStatic()) {
            auto ref = signal(p.rootSymbol());
            if (ref.empty())
                return {};
            return {{ref, {p.lspBounds.first + demand.lsb, demand.width}, "data", "exact", "all"}};
        }
        if (e.eval(eval))
            return {};
        if (auto selected = selection(e))
            return demanded(*selected->first, {selected->second.lsb + demand.lsb, demand.width});
        if (e.kind == ExpressionKind::Concatenation) {
            Deps d;
            uint64_t offset = 0;
            auto operands = e.as<ConcatenationExpression>().operands();
            for (auto it = operands.rbegin(); it != operands.rend(); ++it) {
                auto n = widthOf(*(*it)->type);
                auto lo = std::max(demand.lsb, offset),
                     hi = std::min(demand.lsb + demand.width, offset + n);
                if (lo < hi)
                    add(d, demanded(**it, {lo - offset, hi - lo}));
                offset += n;
            }
            return d;
        }
        if (e.kind == ExpressionKind::Replication) {
            auto &child = e.as<ReplicationExpression>().concat();
            auto n = widthOf(*child.type);
            Deps d;
            if (n)
                for (uint64_t offset = 0; offset < w; offset += n) {
                    auto lo = std::max(demand.lsb, offset),
                         hi = std::min(demand.lsb + demand.width, offset + n);
                    if (lo < hi)
                        add(d, demanded(child, {lo - offset, hi - lo}));
                }
            return d;
        }
        if (e.kind == ExpressionKind::Call) {
            auto &c = e.as<CallExpression>();
            if ((c.getSubroutineName() == "$signed" || c.getSubroutineName() == "$unsigned") &&
                c.arguments().size() == 1)
                return demanded(*c.arguments()[0], demand);
        }
        if (e.kind == ExpressionKind::ConditionalOp) {
            auto &c = e.as<ConditionalExpression>();
            auto d = demanded(c.left(), demand);
            add(d, demanded(c.right(), demand));
            for (auto &cond : c.conditions)
                add(d, reads(*cond.expr));
            return d;
        }
        if (e.kind == ExpressionKind::UnaryOp) {
            auto &u = e.as<UnaryExpression>();
            if (u.op == UnaryOperator::BitwiseNot || u.op == UnaryOperator::Plus)
                return demanded(u.operand(), demand);
        }
        if (e.kind == ExpressionKind::BinaryOp) {
            auto &b = e.as<BinaryExpression>();
            auto op = b.op;
            if (op == BinaryOperator::BinaryAnd || op == BinaryOperator::BinaryOr ||
                op == BinaryOperator::BinaryXor || op == BinaryOperator::BinaryXnor) {
                auto d = demanded(b.left(), demand);
                add(d, demanded(b.right(), demand));
                return d;
            }
            if (op == BinaryOperator::LogicalShiftLeft ||
                op == BinaryOperator::ArithmeticShiftLeft ||
                op == BinaryOperator::LogicalShiftRight ||
                op == BinaryOperator::ArithmeticShiftRight) {
                auto cv = b.right().eval(eval);
                if (cv && cv.isInteger())
                    if (auto amount = cv.integer().as<uint64_t>()) {
                        auto n = widthOf(*b.left().type);
                        Deps d;
                        if (op == BinaryOperator::LogicalShiftLeft ||
                            op == BinaryOperator::ArithmeticShiftLeft) {
                            auto hi = demand.lsb + demand.width;
                            if (hi > *amount) {
                                auto lo = std::max(demand.lsb, *amount);
                                d = demanded(b.left(), {lo - *amount, hi - lo});
                            }
                        } else {
                            if (*amount < n && demand.lsb < n - *amount)
                                d = demanded(b.left(),
                                             {demand.lsb + *amount,
                                              std::min(demand.width, n - *amount - demand.lsb)});
                            if (op == BinaryOperator::ArithmeticShiftRight &&
                                b.left().type->isSigned() && n &&
                                (*amount >= n || demand.lsb + demand.width > n - *amount))
                                add(d, demanded(b.left(), {n - 1, 1}));
                        }
                        return d;
                    }
            }
        }
        return reads(e);
    }
    struct Accesses : ASTVisitor<Accesses, VisitFlags::AllGood> {
        Extractor &x;
        Ranges written, read, influence;
        Deps conditions;
        explicit Accesses(Extractor &value) : x(value) {}
        void readExpr(const Expression &e, bool allInfluence = true) {
            for (auto &d : x.reads(e))
                range(read, d.signal, d.bits);
            if (allInfluence)
                for (auto &d : x.demanded(e, {0, expressionWidth(e).value_or(0)}))
                    range(influence, d.signal, d.bits);
        }
        void writeExpr(const Expression &e) {
            ValuePath::visitPaths(
                e, x.eval,
                [&](const ValuePath &p) {
                    if (p.lsp)
                        range(written, x.signal(p.rootSymbol()),
                              {p.lspBounds.first, p.lspBounds.second - p.lspBounds.first + 1});
                },
                true);
            // Selectors belong to the read set even though their base is written.
            struct Selectors : ASTVisitor<Selectors, VisitFlags::AllGood> {
                Accesses &a;
                explicit Selectors(Accesses &v) : a(v) {}
                void handle(const ElementSelectExpression &s) {
                    a.readExpr(s.selector());
                    s.value().visit(*this);
                }
                void handle(const RangeSelectExpression &s) {
                    a.readExpr(s.left());
                    a.readExpr(s.right());
                    s.value().visit(*this);
                }
                void handle(const NamedValueExpression &) {}
                void handle(const HierarchicalValueExpression &) {}
            } selectors(*this);
            e.visit(selectors);
        }
        void localOutput(const Expression &lhs, uint64_t offset, const Expression &rhs) {
            if (lhs.kind == ExpressionKind::Streaming) {
                // A streaming lvalue has no single ValuePath. Its dependency
                // contract is conservative until its permutation is modeled:
                // each local destination may consume any RHS read. Collect
                // those accesses independently, without reading published deps.
                bool hasLocalTarget = false;
                ValuePath::visitPaths(lhs, x.eval, [&](const ValuePath &path) {
                    hasLocalTarget |= !x.signal(path.rootSymbol()).empty();
                }, true);
                if (hasLocalTarget) {
                    for (auto &d : x.reads(rhs))
                        range(influence, d.signal, d.bits);
                    for (auto &d : conditions)
                        range(influence, d.signal, d.bits);
                }
                return;
            }
            if (lhs.kind == ExpressionKind::Concatenation) {
                auto operands = lhs.as<ConcatenationExpression>().operands();
                for (auto it = operands.rbegin(); it != operands.rend(); ++it) {
                    localOutput(**it, offset, rhs);
                    offset += widthOf(*(*it)->type);
                }
                return;
            }
            ValuePath p(lhs, x.eval);
            if (x.signal(p.rootSymbol()).empty())
                return;
            for (auto &d : x.demanded(rhs, {offset, widthOf(*lhs.type)}))
                range(influence, d.signal, d.bits);
            for (auto &d : conditions)
                range(influence, d.signal, d.bits);
        }
        void handle(const AssignmentExpression &e) {
            writeExpr(e.left());
            readExpr(e.right(), false);
            localOutput(e.left(), 0, e.right());
            if (e.op)
                readExpr(e.left());
        }
        void handle(const ConditionalStatement &s) {
            auto saved = conditions;
            bool trueReachable = true, falseReachable = false;
            for (auto &c : s.conditions) {
                readExpr(*c.expr, false);
                add(conditions, x.reads(*c.expr));
                auto value = c.expr->eval(x.eval);
                if (!value || c.pattern)
                    falseReachable = true;
                else if (!value.isTrue()) {
                    falseReachable = true;
                    trueReachable = false;
                    break;
                }
            }
            if (trueReachable)
                s.ifTrue.visit(*this);
            if (falseReachable && s.ifFalse)
                s.ifFalse->visit(*this);
            conditions = std::move(saved);
        }
        void handle(const CaseStatement &s) {
            auto saved = conditions;
            readExpr(s.expr, false);
            add(conditions, x.reads(s.expr));
            for (auto &item : s.items) {
                for (auto e : item.expressions) {
                    readExpr(*e, false);
                    add(conditions, x.reads(*e));
                }
                item.stmt->visit(*this);
            }
            if (s.defaultCase && !x.caseCovered(s))
                s.defaultCase->visit(*this);
            conditions = std::move(saved);
        }
        void handle(const TimedStatement &s) { s.stmt.visit(*this); }
        template <class T> void operator()(Accesses &visitor, const T &node) {
            if constexpr (std::is_base_of_v<Expression, T>)
                readExpr(node, false);
            else
                visitor.visitDefault(node);
        }
    };
    void finish(const Symbol *source, const Expression *selfExpr = nullptr,
                std::optional<Slice> selfTarget = {},
                const AssignmentExpression *outputAssignment = nullptr) {
        auto &proc = current->result;
        const Expression *valueTarget = outputAssignment ? &outputAssignment->left() : nullptr;
        if (selfExpr)
            proc.expr = tree(*selfExpr);
        if (source && source->kind == SymbolKind::ContinuousAssign) {
            auto &e = source->as<ContinuousAssignSymbol>().getAssignment();
            if (e.kind == ExpressionKind::Assignment) {
                proc.expr = tree(e.as<AssignmentExpression>().right());
                valueTarget = &e.as<AssignmentExpression>().left();
            }
        }
        if (events.size() > 1)
            std::stable_sort(events.begin(), events.end(), [&](const auto &a, const auto &b) {
                return conditionedEvents.contains(a.signal) < conditionedEvents.contains(b.signal);
            });
        auto asyncType = [&](const std::string &ref, uint64_t bit, const std::string &event) {
            return asyncTypes.typeAt(ref, bit, event);
        };
        // Uniform and linear ranges represent the same per-bit union. Both
        // follow the original source-coordinate and final coalescing rules.
        for (auto &[key, span] : writes.entries()) {
            auto &d = span.deps;
            const auto width = span.end - key.second;
            for (size_t i = 0; i < events.size(); ++i)
                d.push_back(
                    {events[i].signal, events[i].bits, i ? "async" : "clock", "exact", "all"});
            sortDeps(d);
            bool merged = false;
            if (!proc.writes.empty()) {
                auto &prev = proc.writes.back();
                if (prev.target.ref == key.first &&
                    prev.target.bits.lsb + prev.target.bits.width == key.second &&
                    prev.deps.size() == d.size()) {
                    bool match = true;
                    for (auto &e : events)
                        if (asyncType(key.first, prev.target.bits.lsb, e.signal) !=
                            asyncType(key.first, key.second, e.signal))
                            match = false;
                    for (size_t i = 0; i < d.size(); ++i) {
                        auto a = prev.deps[i], b = d[i];
                        if (a.align == "bitwise") {
                            a.bits.lsb += a.bits.width;
                            a.bits.width = width;
                        }
                        if (a != b)
                            match = false;
                    }
                    if (match) {
                        prev.target.bits.width += width;
                        for (auto &a : prev.deps)
                            if (a.align == "bitwise")
                                a.bits.width += width;
                        merged = true;
                    }
                }
            }
            if (!merged)
                proc.writes.push_back({{key.first, {key.second, width}}, d});
        }
        std::stable_sort(proc.writes.begin(), proc.writes.end(),
                         [](const Write &a, const Write &b) {
                             auto index = [](const std::string &ref) {
                                 return std::stoull(ref.substr(ref.rfind(':') + 1));
                             };
                             if (a.target.ref == b.target.ref)
                                 return a.target.bits.lsb < b.target.bits.lsb;
                             return index(a.target.ref) < index(b.target.ref);
                         });
        // Independent validation begins here; mutation probes alter only published facts.
        Accesses access(*this);
        if (source && source->kind == SymbolKind::ContinuousAssign)
            source->as<ContinuousAssignSymbol>().getAssignment().visit(access);
        if (source && source->kind == SymbolKind::ProceduralBlock)
            source->as<ProceduralBlockSymbol>().getBody().visit(access);
        if (outputAssignment)
            outputAssignment->visit(access);
        else if (selfExpr)
            access.readExpr(*selfExpr);
        if (selfTarget)
            range(access.written, selfTarget->ref, selfTarget->bits);
        normalize(access.written);
        normalize(access.read);
        normalize(access.influence);
        Ranges gotW, gotR, wantW, wantR;
        for (auto &w : proc.writes) {
            range(gotW, w.target.ref, w.target.bits);
            for (auto &d : w.deps)
                if (d.role == "data" || d.role == "control")
                    range(gotR, d.signal, d.bits);
        }
        // Preserve direct identity first, then kind/location/relative matching
        // against Slang's representative, including the original last match.
        const auto oracle = procedureFor(source);
        if (oracle && proc.externalRefs.empty()) {
            ++out.check.slangCompared;
            for (auto d : oracle->getDrivers()) {
                auto b = d->getBounds();
                range(wantW, oracleSignal(d->getSymbol()), {b.first, b.second - b.first + 1});
            }
            for (auto r : oracle->getReadSet()) {
                auto b = r.bitRange;
                range(wantR, oracleSignal(*r.symbol), {b.first, b.second - b.first + 1});
            }
        } else {
            ++out.check.selfChecked;
            if (!proc.externalRefs.empty()) {
                ++out.check.skippedExternal;
                out.check.issues.push_back(proc.ref + ": skipped external references");
            }
            wantW = access.written;
            wantR = access.read;
            if (source && !oracle && proc.externalRefs.empty()) {
                partial(current->completeness, "unsupported", proc.ref,
                        "Slang procedure analysis unavailable");
                ++out.check.mismatched;
                out.check.issues.push_back(proc.ref + ": missing analysis");
                proc.writes.clear();
                partial(out.completeness, "unsupported", proc.ref,
                        "Slang procedure analysis unavailable");
            }
        }
        bool badShape = false;
        for (auto &[ref, ranges] : gotW) {
            (void)ref;
            auto ordered = ranges;
            std::sort(ordered.begin(), ordered.end());
            for (size_t i = 1; i < ordered.size(); ++i)
                if (ordered[i].first < ordered[i - 1].second)
                    badShape = true;
        }
        auto inBounds = [&](const std::string &ref, BitRange bits) {
            if (!bits.width)
                return false;
            if (ref.starts_with("s::")) {
                auto id = std::stoull(ref.substr(3));
                return id < out.signals.size() && bits.lsb < out.signals[id].width &&
                       bits.width <= out.signals[id].width - bits.lsb;
            }
            auto within = [&](const std::optional<Slice> &p) {
                return p && p->ref == ref && bits.lsb >= p->bits.lsb &&
                       bits.lsb - p->bits.lsb < p->bits.width &&
                       bits.width <= p->bits.width - (bits.lsb - p->bits.lsb);
            };
            return within(selfTarget) || within(outputPin);
        };
        for (auto &w : proc.writes) {
            if (!inBounds(w.target.ref, w.target.bits))
                badShape = true;
            for (auto &d : w.deps)
                if (!inBounds(d.signal, d.bits) ||
                    (d.align == "bitwise" && d.bits.width != w.target.bits.width))
                    badShape = true;
        }
        normalize(gotW);
        normalize(gotR);
        normalize(wantW);
        normalize(wantR);
        if (badShape || gotW != wantW || access.written != wantW || access.read != wantR ||
            gotR != access.influence) {
            ++out.check.mismatched;
            out.check.issues.push_back(proc.ref + ": local read/write set mismatch");
            if (source) {
                auto &sm = *body.getCompilation().getSourceManager();
                out.check.issues.push_back(std::string(sm.getFileName(source->location)) + ":" +
                                           std::to_string(sm.getLineNumber(source->location)));
            }
            auto describe = [&](const char *label, const Ranges &rs) {
                std::string line = label;
                for (auto &[r, bs] : rs)
                    for (auto [l, h] : bs)
                        line +=
                            " " + r + "[" + std::to_string(l) + ":" + std::to_string(h - 1) + "]";
                out.check.issues.push_back(line);
            };
            describe("extracted writes", gotW);
            describe("Slang writes", wantW);
            describe("dependency reads", gotR);
            describe("projected influence", access.influence);
            describe("source reads", access.read);
            describe("Slang reads", wantR);
            proc.writes.clear();
            Deps deps;
            for (auto &[ref, rs] : wantR)
                for (auto [l, h] : rs)
                    deps.push_back({ref, {l, h - l}, "data", "conservative", "all"});
            for (size_t i = 0; i < events.size(); ++i)
                deps.push_back(
                    {events[i].signal, events[i].bits, i ? "async" : "clock", "exact", "all"});
            bool canRebuild = oracle && proc.externalRefs.empty();
            for (auto &[ref, ranges] : wantW)
                for (auto [lo, hi] : ranges)
                    if (!inBounds(ref, {lo, hi - lo}))
                        canRebuild = false;
            for (auto &d : deps)
                if (!inBounds(d.signal, d.bits))
                    canRebuild = false;
            if (canRebuild)
                for (auto &[ref, rs] : wantW)
                    for (auto [l, h] : rs)
                        proc.writes.push_back({{ref, {l, h - l}}, deps});
            else {
                proc.expr.reset();
                partial(out.completeness, "unsupported", proc.ref,
                        "Cannot safely rebuild connection facts");
                partial(current->completeness, "unsupported", proc.ref,
                        "Cannot safely rebuild connection facts");
            }
        }
        mapValues(proc, valueTarget, selfTarget);
        if (!events.empty() && (proc.kind == "always_ff" || proc.kind == "always"))
            for (auto &w : proc.writes) {
                RegisterInfo r;
                r.ref = local('r', out.registers.size());
                r.inst = "i:";
                r.signal = w.target.ref;
                r.bits = w.target.bits;
                r.process = proc.ref;
                r.clock = events[0];
                for (size_t i = 1; i < events.size(); ++i) {
                    auto e = events[i];
                    const auto type = asyncTypes.typeAt(w.target.ref, w.target.bits.lsb, e.signal);
                    if (!type.empty())
                        e.type = type;
                    r.async.push_back(e);
                }
                out.registers.push_back(std::move(r));
            }
        current = nullptr;
    }
    PortInternal internal(const Symbol &s) {
        PortInternal result;
        if (s.kind == SymbolKind::InterfacePort) {
            result.reason = "interface_port";
            return result;
        }
        // An ordinary port already describes one interval. Preserve that form
        // instead of expanding every bit into a temporary target and coalescing it.
        if (s.kind == SymbolKind::Port) {
            const auto &p = s.as<PortSymbol>();
            if (!p.getInternalExpr() && p.internalSymbol && p.internalSymbol->isValue()) {
                const auto width = widthOf(p.getType());
                if (width) {
                    result.kind = "direct";
                    result.signal = signal(&p.internalSymbol->as<ValueSymbol>());
                    result.bits = {0, width};
                    return result;
                }
            }
        }
        StaticBits bits;
        auto portBits = [&](const PortSymbol &p) {
            if (auto e = p.getInternalExpr())
                return trivial(*e);
            if (p.internalSymbol && p.internalSymbol->isValue())
                return StaticBits::signal(signal(&p.internalSymbol->as<ValueSymbol>()),
                                          {0, widthOf(p.getType())});
            return StaticBits{};
        };
        if (s.kind == SymbolKind::Port)
            bits = portBits(s.as<PortSymbol>());
        else if (s.kind == SymbolKind::MultiPort) {
            auto ports = s.as<MultiPortSymbol>().ports;
            for (auto it = ports.rbegin(); it != ports.rend(); ++it) {
                bits.append(portBits(**it));
            }
        }
        auto segs = bits.segments();
        if (segs.size() == 1 && segs[0].target.kind == "signal") {
            result.kind = "direct";
            result.signal = segs[0].target.signal;
            result.bits = segs[0].target.bits;
        } else if (!segs.empty()) {
            result.kind = "mapped";
            result.segments = std::move(segs);
        } else
            result.reason = "unsupported";
        return result;
    }
};
} // namespace

namespace {
struct BlackboxConnections {
    std::vector<std::string> names;
    std::vector<const Expression *> expressions;
    bool positional = false;
};
std::vector<std::string> blackboxPinNames(const BlackboxConnections &connections,
                                         const CellInfo *cell) {
    std::vector<std::string> result;
    if (cell)
        for (const auto &pin : cell->pins)
            result.push_back(pin.name);
    if (connections.positional)
        result.resize(std::max(result.size(), connections.names.size()));
    else {
        // Keep library duplicates and append unseen names in source order.
        std::unordered_set<std::string_view> known;
        if (cell)
            for (const auto &pin : cell->pins)
                known.insert(pin.name);
        for (const auto &name : connections.names)
            if (known.insert(name).second)
                result.push_back(name);
    }
    return result;
}
BlackboxConnections blackboxConnections(const UninstantiatedDefSymbol &inst) {
    BlackboxConnections result;
    auto raw = inst.getPortConnections();
    size_t index = 0;
    // Slang omits EmptyPortConnection from the bound list. Reinsert those slots
    // from syntax, retaining the original ordinal of every following argument.
    if (auto syntax = inst.getSyntax())
        for (auto c : syntax->as<syntax::HierarchicalInstanceSyntax>().connections) {
            if (c->kind == syntax::SyntaxKind::EmptyPortConnection) {
                result.positional = true;
                result.names.emplace_back();
                result.expressions.push_back(nullptr);
            } else if (c->kind == syntax::SyntaxKind::OrderedPortConnection ||
                       c->kind == syntax::SyntaxKind::NamedPortConnection) {
                const bool ordered = c->kind == syntax::SyntaxKind::OrderedPortConnection;
                result.positional |= ordered;
                result.names.push_back(
                    ordered
                        ? ""
                        : std::string(c->as<syntax::NamedPortConnectionSyntax>().name.valueText()));
                const Expression *e = nullptr;
                if (index < raw.size() && raw[index]->kind == AssertionExprKind::Simple)
                    e = &raw[index]->as<SimpleAssertionExpr>().expr;
                ++index;
                result.expressions.push_back(e);
            }
        }
    return result;
}
} // namespace

LibraryInputBindings bindLibraryInputs(std::span<const InstanceBodySymbol *const> bodies,
                                      const std::map<std::string, model::CellInfo> &library) {
    LibraryInputBindings result;
    if (library.empty())
        return result;
    for (auto body : bodies)
        members(*body, [&](const Symbol &symbol) {
            if (symbol.kind != SymbolKind::UninstantiatedDef)
                return;
            auto &inst = symbol.as<UninstantiatedDefSymbol>();
            auto cell = library.find(std::string(inst.definitionName));
            if (cell == library.end())
                return;
            auto connections = blackboxConnections(inst);
            for (size_t i = 0; i < connections.expressions.size(); ++i) {
                auto expr = connections.expressions[i];
                if (!expr || expr->kind == ExpressionKind::EmptyArgument)
                    continue;
                auto &pins = cell->second.pins;
                auto pin = connections.positional
                               ? (i < pins.size() ? pins.begin() + std::ptrdiff_t(i) : pins.end())
                               : std::find_if(pins.begin(), pins.end(), [&](const PinInfo &p) {
                                     return p.name == connections.names[i];
                                 });
                if (pin == pins.end() || pin->dir != Direction::In || !pin->width || !*pin->width)
                    continue;
                auto key = std::pair{expr, *pin->width};
                if (result.contains(key))
                    continue;
                auto &comp = body->getCompilation();
                auto &type = comp.getType(bitwidth_t(*pin->width), IntegralFlags::FourState);
                if (expr->syntax) {
                    // Rebind syntax, leaving the original unknown-port AST intact.
                    // Assignment binding propagates context into operators before
                    // conversion, including sign extension and arithmetic carry bits.
                    ASTContext context(*inst.getParentScope(), LookupLocation::after(inst),
                                       ASTFlags::NonProcedural);
                    result.emplace(key, &Expression::bindRValue(type, *expr->syntax,
                                                               expr->sourceRange, context));
                } else if (expr->kind == ExpressionKind::NamedValue ||
                           expr->kind == ExpressionKind::HierarchicalValue) {
                    // Synthesized references are self-determined leaves.
                    result.emplace(key, comp.emplace<ConversionExpression>(
                        type, ConversionKind::Implicit, const_cast<Expression &>(*expr),
                        expr->sourceRange));
                }
            }
        });
    return result;
}

ExternalAccess
collectExternal(std::span<const slang::ast::InstanceBodySymbol *const> bodies,
                const std::map<std::string, model::CellInfo> &library,
                std::unordered_set<const slang::ast::InstanceBodySymbol *> *affectedBodies) {
    ExternalAccess result;
    for (auto body : bodies) {
        ExternalVisitor v(result, *body);
        v.sourceBody = body;
        v.affectedBodies = affectedBodies;
        std::function<void(const Symbol &)> scan = [&](const Symbol &s) {
            if (s.kind == SymbolKind::ContinuousAssign)
                s.as<ContinuousAssignSymbol>().getAssignment().visit(v);
            else if (s.kind == SymbolKind::ProceduralBlock)
                s.as<ProceduralBlockSymbol>().getBody().visit(v);
            else if (s.kind == SymbolKind::Net) {
                if (auto e = s.as<NetSymbol>().getInitializer())
                    e->visit(v);
            } else if (s.kind == SymbolKind::Instance) {
                for (auto c : s.as<InstanceSymbol>().getPortConnections())
                    if (auto e = c->getExpression()) {
                        auto direction = ArgumentDirection::In;
                        if (c->port.kind == SymbolKind::Port)
                            direction = c->port.as<PortSymbol>().direction;
                        else if (c->port.kind == SymbolKind::MultiPort)
                            direction = c->port.as<MultiPortSymbol>().direction;
                        v.connection(*e, direction == ArgumentDirection::In ? 1
                                         : direction == ArgumentDirection::Out ? 2 : 3);
                    }
            } else if (s.kind == SymbolKind::PrimitiveInstance) {
                auto &primitive = s.as<PrimitiveInstanceSymbol>();
                size_t pin = 0;
                for (auto e : primitive.getPortConnections()) {
                    bool bidirectional = primitive.primitiveType.primitiveKind ==
                                             PrimitiveSymbol::BiDiSwitch && pin < 2;
                    v.connection(*e, bidirectional ? 3
                                     : e->kind == ExpressionKind::Assignment ? 2 : 1);
                    ++pin;
                }
            } else if (s.kind == SymbolKind::UninstantiatedDef) {
                auto &instance = s.as<UninstantiatedDefSymbol>();
                auto connections = blackboxConnections(instance);
                auto cell = library.find(std::string(instance.definitionName));
                for (size_t i = 0; i < connections.expressions.size(); ++i) {
                    auto e = connections.expressions[i];
                    if (!e)
                        continue;
                    auto direction = Direction::Unknown;
                    if (cell != library.end())
                        for (size_t pin = 0; pin < cell->second.pins.size(); ++pin)
                            if (connections.positional ? pin == i
                                : cell->second.pins[pin].name == connections.names[i])
                                direction = cell->second.pins[pin].dir;
                    // An unknown direction cannot justify a complete answer in
                    // either direction; the binding itself remains unknown.
                    v.connection(*e, direction == Direction::In ? 1
                                     : direction == Direction::Out ? 2 : 3);
                }
            } else if (s.kind == SymbolKind::InstanceArray) {
                for (auto element : s.as<InstanceArraySymbol>().elements)
                    scan(*element);
            }
        };
        members(*body, scan);
    }
    return result;
}
std::vector<std::string> blackboxPinNames(const UninstantiatedDefSymbol &inst,
                                          const CellInfo *cell) {
    return blackboxPinNames(blackboxConnections(inst), cell);
}

std::vector<model::PortInternal> extractPortInternals(const InstanceBodySymbol &body) {
    ExternalAccess empty;
    Extractor x(body, nullptr, empty);
    size_t count = 0;
    members(body, [&](const Symbol &s) {
        if (s.kind == SymbolKind::Net || s.kind == SymbolKind::Variable)
            x.ids[&s.as<ValueSymbol>()] = count++;
    });
    std::vector<model::PortInternal> result;
    for (auto p : body.getPortList())
        result.push_back(x.internal(*p));
    return result;
}

model::BodyConnections extractConnections(const InstanceBodySymbol &body,
                                          std::span<const Symbol *const> slots,
                                          const analysis::AnalysisManager &analysis,
                                          const ExternalAccess &external,
                                          const std::map<std::string, model::CellInfo> &library,
                                          const LibraryInputBindings &libraryInputs,
                                          const InstanceBodySymbol *analyzedBody,
                                          const SourceCatalog &sources) {
    Extractor x(body, &analysis, external);
    x.analyzedBody = analyzedBody;
    members(body, [&](const Symbol &s) {
        if (s.kind != SymbolKind::Net && s.kind != SymbolKind::Variable)
            return;
        auto &value = s.as<ValueSymbol>();
        auto &type = value.getType();
        const auto id = x.out.signals.size();
        x.ids[&value] = id;
        x.lexicalIds[x.relative(value)] = id;
        SignalInfo info;
        info.ref = local('s', id);
        info.name = std::string(s.name);
        info.kind = s.kind == SymbolKind::Net ? "net" : "variable";
        info.typeText = type.toString();
        info.width = widthOf(type);
        info.isSigned = type.isSigned();
        info.opaque = !info.width;
        info.dims = dimensions(type);
        info.members = typeMembers(type);
        info.localPath = x.relative(value);
        // The opening scan excludes hierarchical targets from body sharing. Do not use a
        // lexical path here: that would mark unrelated occurrences of the module.
        for (auto &[target, flags] : external)
            if (target == &value) {
                info.externalRead |= (flags & 1) != 0;
                info.externalWrite |= (flags & 2) != 0;
            }
        sources.add(x.out.sources, info.ref, SourceKind::Definition, s.getSyntax());
        x.out.signals.push_back(std::move(info));
    });
    for (auto p : body.getPortList()) {
        sources.add(x.out.sources, local('p', x.out.internals.size()),
                    SourceKind::Definition, p->getSyntax());
        x.out.internals.push_back(x.internal(*p));
    }
    // The compilation owns syntax / token text. Retain only the current syntax
    // lookup, reusing consecutive array / generate occurrences without retaining
    // metadata for every distinct instance in a large module.
    PortConnectionSources connectionSources(nullptr);
    auto connectionSource = [&](size_t slot, size_t pin, std::string_view name) {
        connectionSources.reset(slots[slot]->getSyntax());
        return connectionSources.connection(pin, name);
    };
    auto addBinding = [&](size_t slot, size_t pin, std::string name, std::string dir,
                          std::optional<uint64_t> width, const Expression *expr,
                          uint64_t pinOffset = 0) {
        const auto *connectionSyntax = connectionSource(slot, pin, name);
        const auto firstProcess = x.out.processes.size();
        PinBinding b;
        b.inst = "i:" + std::to_string(slot);
        b.pin = "p:" + std::to_string(slot) + ":" + std::to_string(pin);
        b.port = std::move(name);
        b.direction = std::move(dir);
        b.width = width;
        if (!width) {
            b.unresolved = "unknown_pin_width";
        } else if (!expr) {
            b.segments.push_back({{0, *width}, {}});
        } else if (b.direction == "out" && expr->kind == ExpressionKind::Assignment &&
                   (widthOf(*expr->as<AssignmentExpression>().left().type) != *width ||
                    x.trivial(expr->as<AssignmentExpression>().left()).empty())) {
            // The output connection is an assignment, including the conversion on
            // its RHS. Its destination bit space belongs to the parent, not the pin.
            auto &assignment = expr->as<AssignmentExpression>();
            x.begin("port_expr");
            x.outputPin = Slice{b.pin, {pinOffset, *width}};
            x.assign(assignment.left(), assignment.right());
            BindTarget target;
            target.kind = "expr";
            target.process = x.current->result.ref;
            b.segments.push_back({{0, *width}, target});
            x.finish(nullptr, &assignment.right(), {}, &assignment);
            x.outputPin.reset();
        } else {
            auto bits = x.trivial(*expr);
            if (!bits.empty()) {
                b.segments = bits.resized(*width, expr->type->isSigned()).segments();
            } else {
                x.begin("port_expr");
                if (b.direction == "unknown") {
                    partial(x.current->completeness, "blackbox", b.pin);
                    x.possibleWrites(*expr, b.possibleWrites);
                    std::map<std::string, std::vector<BitRange>> ranges;
                    for (const auto &target : b.possibleWrites)
                        ranges[target.ref].push_back(target.bits);
                    b.possibleWrites.clear();
                    for (auto &[ref, slices] : ranges)
                        for (auto range : mergeBitRanges(std::move(slices)))
                            b.possibleWrites.push_back({ref, range});
                }
                if (b.direction == "inout" || b.direction == "ref" || b.direction == "unknown") {
                    const auto &lvalue = expr->kind == ExpressionKind::Assignment
                                             ? expr->as<AssignmentExpression>().left() : *expr;
                    ValuePath::visitPaths(lvalue, x.eval,
                                         [&](const ValuePath &p) { x.externalRef(p, "write"); },
                                         /* skipSelectors */ true);
                }
                auto data = x.expression(*expr);
                const auto projected = data.resized(*width);
                for (const auto &range : projected.ranges())
                    x.writes.assignProjected(b.pin,
                                             {pinOffset + range.begin, range.end - range.begin},
                                             range.deps);
                BindTarget t;
                t.kind = "expr";
                t.process = x.current->result.ref;
                b.segments.push_back({{0, *width}, t});
                x.finish(nullptr, expr, Slice{b.pin, {pinOffset, *width}});
            }
        }
        sources.add(x.out.sources, b.pin, SourceKind::Instantiation, connectionSyntax);
        for (size_t i = firstProcess; i < x.out.processes.size(); ++i)
            sources.add(x.out.sources, x.out.processes[i].result.ref, SourceKind::Statement, connectionSyntax);
        for (auto &segment : b.segments)
            segment.pinBits.lsb += pinOffset;
        x.out.bindings.push_back(std::move(b));
    };
    auto bindSlot = [&](size_t slot) {
        const auto &s = *slots[slot];
        sources.add(x.out.sources, "i:" + std::to_string(slot),
                    SourceKind::Instantiation, s.getSyntax());
        if (s.kind == SymbolKind::Instance) {
            auto &inst = s.as<InstanceSymbol>();
            // Resolve at the same point as before; use Slang's existing
            // first-connection map instead of rescanning all pins per port.
            inst.getPortConnections();
            size_t pin = 0;
            for (auto p : inst.body.getPortList()) {
                if (p->kind == SymbolKind::InterfacePort) {
                    PinBinding b;
                    b.inst = "i:" + std::to_string(slot);
                    b.pin = "p:" + std::to_string(slot) + ":" + std::to_string(pin++);
                    b.port = std::string(p->name);
                    b.unresolved = "interface_port";
                    sources.add(x.out.sources, b.pin, SourceKind::Instantiation,
                                connectionSource(slot, pin - 1, p->name));
                    x.out.bindings.push_back(std::move(b));
                    continue;
                }
                const Expression *expr = nullptr;
                if (p->kind == SymbolKind::Port)
                    if (auto c = inst.getPortConnection(p->as<PortSymbol>()))
                        expr = c->getExpression();
                std::string dir = "unknown";
                std::optional<uint64_t> width;
                auto set = [&](const auto &port) {
                    width = widthOf(port.getType());
                    switch (port.direction) {
                    case ArgumentDirection::In:
                        dir = "in";
                        break;
                    case ArgumentDirection::Out:
                        dir = "out";
                        break;
                    case ArgumentDirection::InOut:
                        dir = "inout";
                        break;
                    case ArgumentDirection::Ref:
                        dir = "ref";
                        break;
                    }
                };
                if (p->kind == SymbolKind::Port)
                    set(p->as<PortSymbol>());
                if (p->kind == SymbolKind::MultiPort)
                    set(p->as<MultiPortSymbol>());
                if (p->kind == SymbolKind::MultiPort) {
                    // Slang stores the expanded component connections, not an
                    // outer MultiPort connection. Keep the original reverse
                    // component evaluation and offset / emission order.
                    PinBinding b;
                    b.inst = "i:" + std::to_string(slot);
                    b.pin = "p:" + std::to_string(slot) + ":" + std::to_string(pin);
                    b.port = std::string(p->name);
                    b.direction = dir;
                    b.width = width;
                    auto parts = p->as<MultiPortSymbol>().ports;
                    uint64_t offset = 0;
                    for (auto it = parts.rbegin(); it != parts.rend(); ++it) {
                        const Expression *component = nullptr;
                        if (auto c = inst.getPortConnection(**it))
                            component = c->getExpression();
                        auto n = widthOf((*it)->getType());
                        addBinding(slot, pin, b.port, dir, n, component, offset);
                        auto part = std::move(x.out.bindings.back());
                        x.out.bindings.pop_back();
                        b.segments.insert(b.segments.end(), part.segments.begin(),
                                          part.segments.end());
                        offset += n;
                    }
                    ++pin;
                    x.out.bindings.push_back(std::move(b));
                } else
                    addBinding(slot, pin++, std::string(p->name), dir, width, expr);
            }
        } else if (s.kind == SymbolKind::PrimitiveInstance) {
            auto &prim = s.as<PrimitiveInstanceSymbol>();
            auto connections = prim.getPortConnections();
            for (size_t i = 0; i < connections.size(); ++i) {
                auto e = connections[i];
                auto dir = e->kind == ExpressionKind::Assignment ? "out" : "in";
                if (prim.primitiveType.primitiveKind == PrimitiveSymbol::BiDiSwitch && i < 2)
                    dir = "inout";
                addBinding(slot, i, std::to_string(i), dir, widthOf(*e->type), e);
            }
        } else if (s.kind == SymbolKind::UninstantiatedDef) {
            auto &u = s.as<UninstantiatedDefSymbol>();
            auto connections = blackboxConnections(u);
            auto &names = connections.names;
            auto &exprs = connections.expressions;
            auto cell = library.find(std::string(u.definitionName));
            auto pinNames = blackboxPinNames(connections,
                                             cell == library.end() ? nullptr : &cell->second);
            const bool positional = connections.positional;
            std::unordered_map<std::string_view, const Expression *> namedExpressions;
            if (!positional)
                for (size_t i = 0; i < names.size() && i < exprs.size(); ++i)
                    namedExpressions.insert_or_assign(names[i], exprs[i]);
            for (size_t pin = 0; pin < pinNames.size(); ++pin) {
                const Expression *e = nullptr;
                if (positional) {
                    if (pin < exprs.size())
                        e = exprs[pin];
                } else if (auto found = namedExpressions.find(pinNames[pin]);
                           found != namedExpressions.end())
                    e = found->second;
                if (e && e->kind == ExpressionKind::EmptyArgument)
                    e = nullptr;
                // Streaming has a bitstream width separate from its AST type.
                // Use the same width authority as expression extraction.
                std::optional<uint64_t> width = e ? expressionWidth(*e) : std::nullopt;
                std::string dir = "unknown";
                const PinInfo *declared = nullptr;
                if (cell != library.end())
                    for (auto &p : cell->second.pins)
                        if (p.name == pinNames[pin]) {
                            declared = &p;
                            if (p.width)
                                width = *p.width;
                            switch (p.dir) {
                            case Direction::In:
                                dir = "in";
                                break;
                            case Direction::Out:
                                dir = "out";
                                break;
                            case Direction::InOut:
                                dir = "inout";
                                break;
                            case Direction::Ref:
                                dir = "ref";
                                break;
                            default:
                                break;
                            }
                        }
                if (dir == "in" && e && width) {
                    if (auto found = libraryInputs.find({e, *width}); found != libraryInputs.end())
                        e = found->second;
                }
                if (dir == "out" && e && width && *width &&
                    (e->type->isIntegral() || e->kind == ExpressionKind::Streaming)) {
                    // A library pin has a declared unsigned bit space even though
                    // Slang only bound its external expression without a direction.
                    const auto &type =
                        body.getCompilation().getType(bitwidth_t(*width), IntegralFlags::FourState);
                    EmptyArgumentExpression source(type, e->sourceRange);
                    ConversionExpression conversion(*e->type, ConversionKind::Implicit, source,
                                                    e->sourceRange);
                    // A streaming lvalue is not an integral destination type;
                    // assign its bitstream from the declared pin space directly.
                    Expression &rhs = e->kind == ExpressionKind::Streaming
                                          ? static_cast<Expression &>(source) : conversion;
                    AssignmentExpression assignment({}, false, *e->type,
                                                    const_cast<Expression &>(*e), rhs,
                                                    nullptr, e->sourceRange);
                    addBinding(slot, pin, pinNames[pin], dir, width, &assignment);
                } else
                    addBinding(slot, pin, pinNames[pin], dir, width, e);
                if (declared)
                    x.out.bindings.back().attrs = declared->attrs;
                if (cell != library.end())
                    x.out.bindings.back().cell = cell->second;
            }
        }
    };
    // Slots (including arrays) can appear in a single declaration. Emit their expression
    // sources at that declaration, in stable slot / pin order.
    // Schedule each slot at the first visited declaration in its ancestor chain.
    // This is the same first match as the original per-declaration scan, without
    // revisiting every slot for every member of a large generated module body.
    auto bindingSchedule = [&] {
        if (slots.empty())
            return std::vector<std::vector<size_t>>{};
        std::unordered_map<const Symbol *, size_t> declarationOrder;
        size_t count = 0;
        members(body, [&](const Symbol &s) { declarationOrder.try_emplace(&s, count++); });
        // The final queue preserves the original unmatched-slot fallback.
        std::vector<std::vector<size_t>> schedule(count + 1);
        for (size_t slot = 0; slot < slots.size(); ++slot) {
            size_t first = count;
            for (const Symbol *ancestor = slots[slot]; ancestor && ancestor != &body;) {
                if (auto found = declarationOrder.find(ancestor); found != declarationOrder.end())
                    first = std::min(first, found->second);
                auto parent = ancestor->getParentScope();
                ancestor = parent ? &parent->asSymbol() : nullptr;
            }
            schedule[first].push_back(slot);
        }
        return schedule;
    }();
    size_t declaration = 0;
    members(body, [&](const Symbol &s) {
        if (s.kind == SymbolKind::Net) {
            auto &net = s.as<NetSymbol>();
            if (auto e = net.getInitializer()) {
                x.begin("init");
                sources.add(x.out.sources, x.current->result.ref, SourceKind::Statement, s.getSyntax());
                auto data = x.expression(*e);
                auto ref = x.signal(&net);
                for (const auto &range : data.ranges())
                    x.writes.assignProjected(ref, {range.begin, range.end - range.begin}, range.deps);
                x.finish(nullptr, e, Slice{ref, {0, widthOf(net.getType())}});
            }
        } else if (s.kind == SymbolKind::ContinuousAssign) {
            x.begin("assign");
            auto syntax = s.getSyntax();
            while (syntax && syntax->kind != syntax::SyntaxKind::ContinuousAssign)
                syntax = syntax->parent;
            sources.add(x.out.sources, x.current->result.ref, SourceKind::Statement, syntax);
            auto &e = s.as<ContinuousAssignSymbol>().getAssignment();
            if (e.kind == ExpressionKind::Assignment) {
                auto &a = e.as<AssignmentExpression>();
                if (!x.directAssignment(a.left(), a.right()))
                    x.assign(a.left(), a.right());
            }
            x.finish(&s);
        } else if (s.kind == SymbolKind::ProceduralBlock) {
            auto &p = s.as<ProceduralBlockSymbol>();
            std::string kind = "always";
            switch (p.procedureKind) {
            case ProceduralBlockKind::AlwaysComb:
                kind = "always_comb";
                break;
            case ProceduralBlockKind::AlwaysFF:
                kind = "always_ff";
                break;
            case ProceduralBlockKind::AlwaysLatch:
                kind = "always_latch";
                break;
            case ProceduralBlockKind::Initial:
                kind = "initial";
                break;
            default:
                break;
            }
            x.begin(kind);
            sources.add(x.out.sources, x.current->result.ref, SourceKind::Statement, s.getSyntax());
            Extractor::Statements visitor(x);
            p.getBody().visit(visitor);
            x.finish(&s);
        }
        if (!bindingSchedule.empty())
            for (auto slot : bindingSchedule[declaration++])
                bindSlot(slot);
    });
    if (!bindingSchedule.empty())
        for (auto slot : bindingSchedule.back())
            bindSlot(slot);
    // Account for retained vector storage and string allocations (including SSO
    // capacity, which conservatively overcounts). The L2 limit excludes query-owned
    // copies and the frontend compiler's separate lifetime.
    size_t bytes = sizeof(BodyConnections);
    auto strings = [&](const auto &...values) { ((bytes += values.capacity() + 1), ...); };
    auto deps = [&](const std::vector<Dep> &ds) {
        bytes += ds.capacity() * sizeof(Dep);
        for (auto &d : ds)
            strings(d.signal, d.role, d.precision, d.align);
    };
    auto status = [&](const Completeness &c) {
        strings(c.status);
        bytes += c.reasons.capacity() * sizeof(Reason);
        for (auto &r : c.reasons)
            strings(r.code, r.at, r.detail);
    };
    std::function<void(const model::Expr &)> exprSize = [&](const model::Expr &e) {
        strings(e.op, e.text, e.value, e.slice.ref);
        deps(e.uses);
        bytes += e.args.capacity() * sizeof(model::Expr);
        for (auto &a : e.args)
            exprSize(a);
    };
    auto targets = [&](const std::vector<BindSegment> &segments) {
        bytes += segments.capacity() * sizeof(BindSegment);
        for (auto &seg : segments)
            strings(seg.target.kind, seg.target.signal, seg.target.value, seg.target.process,
                    seg.target.reason);
    };
    std::function<void(const std::vector<MemberInfo> &)> memberSize = [&](const auto &ms) {
        bytes += ms.capacity() * sizeof(MemberInfo);
        for (auto &m : ms) {
            strings(m.name, m.typeText);
            bytes += m.dims.capacity() * sizeof(Dim);
            memberSize(m.members);
        }
    };
    bytes += x.out.signals.capacity() * sizeof(SignalInfo);
    for (auto &sig : x.out.signals) {
        strings(sig.ref, sig.name, sig.kind, sig.typeText, sig.localPath);
        bytes += sig.dims.capacity() * sizeof(Dim);
        memberSize(sig.members);
    }
    bytes += x.out.processes.capacity() * sizeof(QueryResult<ProcessInfo>);
    for (auto &q : x.out.processes) {
        status(q.completeness);
        auto &p = q.result;
        strings(p.ref, p.kind, p.inst);
        bytes += p.writes.capacity() * sizeof(Write);
        for (auto &w : p.writes) {
            strings(w.target.ref);
            deps(w.deps);
            if (w.exprMap) {
                strings(w.exprMap->status, w.exprMap->reason);
                bytes += w.exprMap->segments.capacity() * sizeof(BitMapSegment);
            }
        }
        bytes += p.externalRefs.capacity() * sizeof(ExternalRef);
        for (auto &e : p.externalRefs)
            strings(e.text, e.access);
        if (p.expr)
            exprSize(*p.expr);
    }
    bytes += x.out.bindings.capacity() * sizeof(PinBinding);
    for (auto &b : x.out.bindings) {
        strings(b.inst, b.pin, b.port, b.direction, b.unresolved);
        targets(b.segments);
        bytes += b.possibleWrites.capacity() * sizeof(Slice);
        for (const auto &target : b.possibleWrites)
            strings(target.ref);
        for (auto &[key, value] : b.attrs) {
            strings(key, value);
            bytes += sizeof(std::pair<const std::string, std::string>) + 4 * sizeof(void *);
        }
        if (b.cell) {
            bytes += b.cell->pins.capacity() * sizeof(PinInfo);
            for (auto &p : b.cell->pins) {
                strings(p.name);
                for (auto &[key, value] : p.attrs) {
                    strings(key, value);
                    bytes += sizeof(std::pair<const std::string, std::string>) + 4 * sizeof(void *);
                }
            }
            for (auto &[key, value] : b.cell->attrs) {
                strings(key, value);
                bytes += sizeof(std::pair<const std::string, std::string>) + 4 * sizeof(void *);
            }
        }
    }
    bytes += x.out.internals.capacity() * sizeof(PortInternal);
    for (auto &p : x.out.internals) {
        strings(p.kind, p.signal, p.status, p.reason, p.expr);
        targets(p.segments);
    }
    auto eventSize = [&](const EventInfo &e) { strings(e.signal, e.edge, e.type); };
    bytes += x.out.registers.capacity() * sizeof(RegisterInfo);
    for (auto &r : x.out.registers) {
        strings(r.ref, r.inst, r.signal, r.process);
        eventSize(r.clock);
        bytes += r.async.capacity() * sizeof(EventInfo);
        for (auto &e : r.async)
            eventSize(e);
    }
    status(x.out.completeness);
    bytes += x.out.check.issues.capacity() * sizeof(std::string);
    for (auto &issue : x.out.check.issues)
        strings(issue);
    std::unordered_map<std::string, model::SourceRange> statementRanges;
    for (const auto &source : x.out.sources)
        if (source.kind == SourceKind::Statement)
            statementRanges.emplace(source.ref, source.range);
    for (const auto &reg : x.out.registers) {
        if (auto it = statementRanges.find(reg.process); it != statementRanges.end())
            x.out.sources.push_back({reg.ref, SourceKind::Statement, it->second});
    }
    bytes += x.out.sources.capacity() * sizeof(SourceRecord);
    for (const auto &source : x.out.sources)
        bytes += source.ref.capacity();
    x.out.estimatedBytes = bytes;
    return std::move(x.out);
}
} // namespace hier::frontend
