#include "SourceInvestigation.h"
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <utility>

namespace {
unsigned checks = 0;
void need(bool ok, const char *why) { ++checks; if (!ok) throw std::runtime_error(why); }
std::string bytes(const std::string &path) {
    std::ifstream file(path, std::ios::binary);
    return {std::istreambuf_iterator<char>(file), {}};
}
}
int main() try {
    using namespace dft::sequential;
    hier::model::OpenOptions open; open.files = {DFT_EXCERPT_FIXTURE}; open.tops = {"excerpt_top"};
    auto design = hier::Design::open(open); need(bool(design), "open");
    SourceInvestigationRequest request;
    request.statistics.scope = "excerpt_top"; request.statistics.recursive = true;
    request.scenarios.common.resolveLogic = true;
    request.scenarios.scenarios = {{"BASE", {}}, {"REPEAT", {}}, {"THIRD", {}}};
    request.query.scenario = 2; request.excerpts.contextLines = 0;
    auto result = investigateRegisterSources(**design, request);
    need(bool(result) && result->excerpts.complete, "complete multi-scenario investigation");
    need(result->statistics.facts.size() == 5 && result->ranges.comparisons.size() == 2,
         "five contextual writes and two comparisons retained");
    need(result->excerpts.rows.size() == 8 && result->excerpts.files.size() == 2 &&
         result->excerpts.snippets.size() == 5, "shared occurrences retain distinct locations and deduplicate text");
    for (const auto &row : result->evidence.rows) {
        const auto &selected = result->selection.rows.at(row.selectionRow);
        const auto &range = result->ranges.comparisons.at(1).rows.at(selected.rangeRow).signals.at(selected.rangeSignal);
        need(range.signal == selected.value.signal, "selection references matching original range");
        need(row.signal.ref == result->statistics.signals.at(range.signal).object.ref, "original statistics identity");
        for (const auto &proof : row.proofs) for (const auto &context : proof.contexts) {
            need(context.scenario == 0 || context.scenario == 2, "selected comparison only");
            for (const auto &fact : context.facts)
                need(result->evidence.facts.at(fact.fact).fact < result->statistics.facts.size(), "fact dictionary resolves");
        }
    }
    for (const auto &row : result->locations.rows)
        need(row.statisticsFact == result->evidence.facts.at(row.fact).fact &&
             row.ref == result->evidence.facts.at(row.fact).info.ref, "location refers to owned evidence");
    for (const auto &row : result->excerpts.rows) {
        const auto &span = *result->locations.locations.at(row.location).span;
        const auto &snippet = result->excerpts.snippets.at(*row.snippet);
        need(result->excerpts.files.at(*row.file).file == span.file && snippet.file == *row.file, "original FileRef mapping");
        need(snippet.text == bytes(span.path).substr(snippet.startOffset, snippet.endOffset - snippet.startOffset), "exact UTF8 file window");
    }
    auto chosen = request; chosen.query.node = "excerpt_top.left";
    auto left = investigateRegisterSources(**design, chosen);
    need(bool(left) && left->excerpts.complete && left->excerpts.rows.size() == 3 && left->excerpts.files.size() == 1, "exact selected owner");
    chosen.query.node = "excerpt_top.le";
    auto empty = investigateRegisterSources(**design, chosen);
    need(bool(empty) && empty->excerpts.complete && empty->selection.rows.empty() &&
         empty->excerpts.queries == 1 && empty->excerpts.readBytes == 0, "no prefix matching or unnecessary file read");
    // Each stage's soft budget must survive the full orchestration as partial, not an Error or false complete.
    for (unsigned stage = 0; stage < 6; ++stage) {
        auto cut = request;
        if (stage == 0) cut.statistics.maxWork = 1;
        if (stage == 1) cut.ranges.maxWork = 1;
        if (stage == 2) cut.selection.maxWork = 1;
        if (stage == 3) cut.evidence.maxWork = 1;
        if (stage == 4) cut.locations.maxQueries = 1;
        if (stage == 5) cut.excerpts.maxQueries = 1;
        auto partial = investigateRegisterSources(**design, cut);
        need(bool(partial) && !partial->excerpts.complete && !partial->excerpts.reasons.empty(), "per-stage partial retained");
    }
    // Invalid later sections must beat a nonexistent scope: preflight cannot start with statistics queries.
    for (unsigned section = 0; section < 11; ++section) {
        auto invalid = request; invalid.statistics.scope = "nonexistent_scope";
        if (section == 0) invalid.statistics.maxWork = 0;
        if (section == 1) invalid.scenarios.common.resolveLogic = false;
        if (section == 2) invalid.ranges.maxWork = 0;
        if (section == 3) invalid.query.scenario = 0;
        if (section == 4) invalid.query.scenario = 3;
        if (section == 5) invalid.selection.maxRows = 0;
        if (section == 6) invalid.evidence.maxFacts = 0;
        if (section == 7) invalid.locations.maxQueries = 0;
        if (section == 8) invalid.excerpts.contextLines = 21;
        if (section == 9) invalid.ranges.matrix.maxWork = 0;
        if (section == 10) invalid.scenarios.scenarios[1].name = "BASE";
        auto bad = investigateRegisterSources(**design, invalid);
        need(!bad && bad.error().code == hier::ErrorCode::BadRequest, "all sections prevalidated");
    }
    auto absent = request; absent.statistics.scope = "nonexistent_scope";
    auto missing = investigateRegisterSources(**design, absent);
    auto original = registerStatistics(**design, absent.statistics);
    need(!missing && !original && missing.error().code == original.error().code &&
         missing.error().message == original.error().message, "original stage Error preserved");
    std::stop_source stop; stop.request_stop();
    auto cancelled = investigateRegisterSources(**design, {}, stop.get_token());
    need(!cancelled && cancelled.error().code == hier::ErrorCode::Cancelled, "pre-cancel before validation");
    need(investigateRegisterSources(**design, request)->excerpts.complete, "Design reusable after errors and cancellation");
    auto owned = std::move(result.value()); request = {}; design.value().reset();
    need(owned.statistics.facts.size() == 5 && !owned.excerpts.snippets.at(0).text.empty() &&
         !owned.locations.locations.at(0).span->file.empty(), "all results owned after Design and request release");
    std::cout << checks << " source investigation assertions passed\n";
    return 0;
} catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
