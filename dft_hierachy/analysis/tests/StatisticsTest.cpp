#include "RegisterStatisticsInternal.h"
#include <iostream>
#include <limits>
#include <stdexcept>
namespace { void need(bool v, const char *message) { if (!v) throw std::runtime_error(message); } }
int main() try {
    using namespace dft::sequential;
    std::vector<hier::model::BitRange> ranges{{2,4},{4,4},{12,2}};
    auto coverage = detail::coverageForIntervals(ranges, 10, [] { return true; });
    need(coverage && coverage->coveredBits == 8 && coverage->overlapBits == 2 && coverage->maxMultiplicity == 2 &&
        coverage->segments.size() == 4, "exact interval union/multiplicity without counting per bit");
    need(!detail::coverageForIntervals(ranges, 3, [] { return true; }), "segment limit does not publish a half summary");
    need(!detail::coverageForIntervals(ranges, 10, [] { return false; }), "stopped sweep publishes no summary");
    ranges = {{2,3},{0,2}};
    auto adjacent = detail::coverageForIntervals(ranges, 1, [] { return true; });
    need(adjacent && adjacent->segments.size() == 1 && adjacent->coveredBits == 5, "adjacent equal counts merge before cap");
    ranges = {{std::numeric_limits<uint64_t>::max()-4,4}};
    need(detail::coverageForIntervals(ranges, 1, [] { return true; })->coveredBits == 4, "wide endpoints stay integer exact");
    ranges = {{std::numeric_limits<uint64_t>::max(),1}};
    bool overflow = false;
    try { (void)detail::coverageForIntervals(ranges, 1, [] { return true; }); }
    catch (const hier::Error &e) { overflow = e.code == hier::ErrorCode::Unsupported; }
    need(overflow, "overflow rejected, never wrapped");
    hier::model::OpenOptions open; open.files = {DFT_STATISTICS_FIXTURE}; open.tops = {"stats_top"};
    auto design = hier::Design::open(open); need(bool(design), "open RTL");
    StatisticsRequest request; request.scope = "stats_top"; request.recursive = true;
    auto r = registerStatistics(**design, request);
    need(bool(r) && r->complete && r->totals.facts == 3 && r->totals.signals == 3 && r->totals.coveredBits == 11 &&
        r->totals.factBits == 11 && r->instances.size() == 4 && r->definitions.size() == 2, "per occurrence parameter widths, definitions and empty top");
    std::stop_source stop; stop.request_stop();
    auto cancelled = registerStatistics(**design, request, stop.get_token());
    need(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "pre-cancel is Error only");
    auto expired = detail::statisticsWithDeadline(**design, request, {}, {});
    need(bool(expired) && !expired->complete && expired->work == 0 && expired->pages.empty(), "deterministic expired seam");
    auto bad = request; bad.maxFacts = 0; need(!registerStatistics(**design, bad), "invalid budget");
    bad = request; bad.scope += ".missing";
    auto missing = registerStatistics(**design, bad); need(!missing && missing.error().code == hier::ErrorCode::NotFound, "missing scope remains NotFound");
    auto again = registerStatistics(**design, request); need(bool(again) && again->complete, "reuse after cancel/error");
    design.value().reset();
    const auto &f = r->facts[0];
    need(!r->pages[f.page].response.result.items[f.item].process.empty() && r->signals[f.signal].coverage->coveredBits > 0,
        "raw facts, metadata, coverage and indices survive Design release");
    std::cout << "Register statistics RTL/parameter/coverage/cancel/error/ownership checks passed\n";
    return 0;
} catch (const std::exception &e) { std::cerr << e.what() << '\n'; return 1; }
