#include "ReportValidation.h"
#include "SourceIdentity.h"
#include <set>
namespace dft::sequential::detail {
namespace {
using namespace hier;
void checkpoint(Cancel cancel, std::string_view label) {
    if (cancel.stop_requested()) throw Error{ErrorCode::Cancelled, std::string(label) + " cancelled"};
}
}
uint64_t validateReportReferences(const Report &r, Cancel cancel, std::string_view label) {
    if (r.checks.size() > 10000 || r.registers.size() > 100000)
        throw Error{ErrorCode::BadRequest, std::string(label) + " input exceeds checks or facts limit"};
    std::set<detail::SourcePointKey> points;
    for (const auto &c : r.checks) {
        checkpoint(cancel, label);
        if (!points.emplace(c.point.slice.ref, c.point.slice.bits.lsb, c.point.slice.bits.width, c.point.side).second)
            throw Error{ErrorCode::BadRequest, std::string(label) + " requires unique control points"};
    }
    uint64_t events = 0;
    const auto check = [&](std::optional<size_t> i) {
        if (i && *i >= r.checks.size()) throw Error{ErrorCode::BadRequest, std::string(label) + " check index out of range"};
    };
    for (const auto &record : r.registers) {
        checkpoint(cancel, label);
        if (record.asyncChecks.size() != record.fact.async.size())
            throw Error{ErrorCode::BadRequest, std::string(label) + " event references do not match original fact shape"};
        if (record.fact.async.size() > 1000000 || events > 1000000 - record.fact.async.size())
            throw Error{ErrorCode::BadRequest, std::string(label) + " input exceeds event limit"};
        events += record.fact.async.size();
        if (++events > 1000000)
            throw Error{ErrorCode::BadRequest, std::string(label) + " input exceeds event limit"};
        check(record.clockCheck);
        for (const auto i : record.asyncChecks) { checkpoint(cancel, label); check(i); }
    }
    return events;
}
}
