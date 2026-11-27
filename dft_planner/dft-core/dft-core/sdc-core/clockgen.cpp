#include "clockgen.h"

#include <cctype>
#include <cmath>
#include <iomanip>
#include <regex>
#include <sstream>
#include <unordered_map>
#include <unordered_set>

namespace sdc {
namespace {

double round3(double x) { return std::round(x * 1000.0) / 1000.0; }

/// Mirrors gen_dft.pl's `fmt_num` (`0 + sprintf("%.3f", $x)`, then Perl's own number-to-string
/// stringification, which drops trailing zeros): format to 3 decimals, then trim.
std::string formatNum(double x) {
    std::ostringstream ss;
    ss.setf(std::ios::fixed);
    ss << std::setprecision(3) << x;
    std::string s = ss.str();
    if (s.find('.') != std::string::npos) {
        size_t last = s.find_last_not_of('0');
        if (s[last] == '.') --last;
        s.erase(last + 1);
    }
    return s;
}

/// A signal name ending in PAD (optionally `*`, quotes, or trailing `]`), case-insensitive —
/// gen_dft.pl's `/PAD\*?\s*['"]*\]*$/i`.
bool looksLikePad(const std::string& objName) {
    static const std::regex re(R"(PAD\*?[ \t]*['"]*\]*$)", std::regex::icase);
    return std::regex_search(objName, re);
}

/// A DFT-infrastructure clock name — gen_dft.pl's `/edt_clk|tck|clockdr/i`.
bool looksLikeDftClock(const std::string& name) {
    static const std::regex re(R"(edt_clk|tck|clockdr)", std::regex::icase);
    return std::regex_search(name, re);
}

/// Mirrors gen_dft.pl's `write_tcl_file`'s `$extract_obj`: skip the first 2 whitespace-delimited
/// tokens ("add_clock" "0" — or, for an already-commented line, "#" "add_clock", which is the
/// off-by-one the original tool has on a PAD/DFT-commented line, faithfully reproduced by
/// operating on the same already-formatted text Perl's dedup pass saw), then take the 3rd token
/// as a whole (bracket-balanced if it starts with `[`, a bare word otherwise).
std::string extractObjToken(const std::string& s) {
    size_t pos = 0;
    const size_t len = s.size();
    auto isSpace = [](char c) { return std::isspace(static_cast<unsigned char>(c)) != 0; };
    for (int skip = 0; skip < 2; ++skip) {
        while (pos < len && isSpace(s[pos])) ++pos;
        while (pos < len && !isSpace(s[pos])) ++pos;
    }
    while (pos < len && isSpace(s[pos])) ++pos;
    if (pos >= len) return "";
    const size_t start = pos;
    if (s[pos] == '[') {
        int depth = 0;
        while (pos < len) {
            const char c = s[pos];
            if (c == '[') ++depth;
            if (c == ']') --depth;
            ++pos;
            if (depth == 0) break;
        }
    } else {
        while (pos < len && !isSpace(s[pos])) ++pos;
    }
    return s.substr(start, pos - start);
}

/// gen_dft.pl's `write_tcl_file`'s first pass: drop byte-identical repeats, keeping the first.
template <typename T, typename KeyFn>
std::vector<T> dedupExact(std::vector<T> items, KeyFn key) {
    std::unordered_set<std::string> seen;
    std::vector<T> out;
    out.reserve(items.size());
    for (T& item : items)
        if (seen.insert(key(item)).second) out.push_back(std::move(item));
    return out;
}

struct Work {
    double period = 0.0;   // 0 = unresolved
    std::string masterClock;
    bool masterInferred = false;
};

}  // namespace

ClockGenResult generateClocks(const std::vector<ResolvedClock>& clocks) {
    ClockGenResult result;

    // clocks_by_object: every clock registers under its OWN defining object set — create_clock's
    // object list, or create_generated_clock's target list (both land in ResolvedClock::targets).
    std::unordered_map<std::string, std::vector<int>> byObject;
    for (size_t i = 0; i < clocks.size(); ++i)
        for (const std::string& t : clocks[i].targets)
            if (!t.empty()) byObject[t].push_back(static_cast<int>(i));

    // clock_by_name: a plain hash assignment in the Perl, so a duplicate name has the LAST
    // definition win (SDC-CLK-REDEFINE already flags the duplicate as a lint finding elsewhere).
    std::unordered_map<std::string, int> byName;
    for (size_t i = 0; i < clocks.size(); ++i)
        if (!clocks[i].name.empty()) byName[clocks[i].name] = static_cast<int>(i);

    std::vector<Work> work(clocks.size());
    for (size_t i = 0; i < clocks.size(); ++i) {
        work[i].masterClock = clocks[i].masterClock;
        if (!clocks[i].generated) work[i].period = clocks[i].period;  // create_clock: given directly
    }

    // infer_generated_clock_master, ported 1:1 including its lack of self-exclusion: a generated
    // clock whose -source/target is never independently create_clock'd can end up "inferring"
    // itself as its own master (candidates collapses to just itself) — the original tool has this
    // same latent quirk, and resolve_generated_periods below simply never converges for it, same
    // as here.
    auto inferMaster = [&](int i) -> std::string {
        std::vector<std::string> candidateObjects;
        for (const std::string& s : clocks[i].source) candidateObjects.push_back(s);
        for (const std::string& t : clocks[i].targets) candidateObjects.push_back(t);

        std::unordered_set<std::string> seenNames;
        std::vector<int> candidates;
        for (const std::string& obj : candidateObjects) {
            if (obj.empty()) continue;
            auto it = byObject.find(obj);
            if (it == byObject.end()) continue;
            for (int ci : it->second) {
                const std::string& cn = clocks[ci].name;
                if (cn.empty()) continue;
                if (!seenNames.insert(cn).second) continue;
                candidates.push_back(ci);
            }
        }
        std::vector<int> withPeriod;
        for (int ci : candidates)
            if (work[ci].period > 0.0) withPeriod.push_back(ci);
        if (withPeriod.size() == 1) return clocks[withPeriod[0]].name;
        if (candidates.size() == 1) return clocks[candidates[0]].name;
        return std::string();
    };

    // resolve_generated_periods: iterative fixed point, exactly as gen_dft.pl runs it.
    bool changed = true;
    int guard = 0;
    while (changed && guard++ < 100) {
        changed = false;
        for (size_t i = 0; i < clocks.size(); ++i) {
            const ResolvedClock& c = clocks[i];
            if (!c.generated) continue;
            if (work[i].period > 0.0) continue;

            if (work[i].masterClock.empty()) {
                const std::string inf = inferMaster(static_cast<int>(i));
                if (!inf.empty()) {
                    work[i].masterClock = inf;
                    work[i].masterInferred = true;
                }
            }
            if (work[i].masterClock.empty()) continue;
            auto it = byName.find(work[i].masterClock);
            if (it == byName.end()) continue;
            const Work& master = work[it->second];
            if (master.period <= 0.0) continue;

            const double mp = master.period;
            double p = 0.0;
            bool got = false;
            if (c.hasMultiplyBy && c.hasDivideBy) {
                if (c.multiplyBy != 0) {
                    p = mp * static_cast<double>(c.divideBy) / static_cast<double>(c.multiplyBy);
                    got = true;
                }
            } else if (c.hasDivideBy) {
                p = mp * static_cast<double>(c.divideBy);
                got = true;
            } else if (c.hasMultiplyBy) {
                if (c.multiplyBy != 0) {
                    p = mp / static_cast<double>(c.multiplyBy);
                    got = true;
                }
            } else if (c.hasEdges) {
                // SDC edges are numbered in master-clock half-periods: span in full periods = diff/2.
                double cycles = (c.edges.back() - c.edges.front()) / 2.0;
                if (cycles <= 0) cycles = 0.5;
                p = mp * cycles;
                got = true;
            } else if (c.combinational) {
                p = mp;
                got = true;
            } else {
                p = mp;  // no ratio given at all -> implicit divide_by 1, same as the master
                got = true;
            }
            if (got) {
                work[i].period = p;
                changed = true;
            }
        }
    }

    for (size_t i = 0; i < clocks.size(); ++i) {
        const ResolvedClock& c = clocks[i];
        if (!c.generated || work[i].period > 0.0) continue;
        std::ostringstream where;
        where << c.file << ":" << c.line;
        if (work[i].masterClock.empty())
            result.warnings.push_back("Unable to infer master clock for generated clock '" +
                                      c.name + "' at " + where.str());
        else
            result.warnings.push_back("Unable to resolve period for generated clock '" + c.name +
                                      "' with master '" + work[i].masterClock + "' at " +
                                      where.str());
    }

    // finalize_clocks: per-target add_clock command, PAD/DFT-clock auto-comment, tessent mapping.
    int autoLabelSeq = 1;
    result.clocks.reserve(clocks.size());
    for (size_t i = 0; i < clocks.size(); ++i) {
        const ResolvedClock& c = clocks[i];
        GeneratedClock g;
        g.name = c.name;
        g.generated = c.generated;
        g.masterClock = work[i].masterClock;
        g.masterInferred = work[i].masterInferred;
        g.targets = c.targets;
        g.file = c.file;
        g.line = c.line;
        if (work[i].period > 0.0) {
            g.period = round3(work[i].period);
            if (g.period != 0.0) g.frequencyMhz = round3(1000.0 / g.period);
        }

        if (g.period > 0.0) {
            for (size_t idx = 0; idx < c.targets.size(); ++idx) {
                const std::string& objExpr = c.targets[idx];
                if (objExpr.empty()) continue;

                std::ostringstream cmd;
                cmd << "add_clock 0 " << objExpr << " -period " << formatNum(g.period) << "ns";

                std::string label;
                if (idx == 0) {
                    if (!c.name.empty())
                        label = c.name;
                    else
                        result.warnings.push_back("Clock at " + c.file + ":" +
                                                  std::to_string(c.line) +
                                                  " has no name; first add_clock has no label");
                } else {
                    label = "intelgraphic_" + std::to_string(autoLabelSeq++);
                }
                if (!label.empty()) cmd << " -label " << label;

                AddClockCmd ac;
                ac.clockName = c.name;
                ac.objectExpr = objExpr;
                ac.label = label;

                const bool isPad = looksLikePad(objExpr);
                const bool isDftClk = !c.name.empty() && looksLikeDftClock(c.name);
                if (isPad) {
                    ac.commented = true;
                    ac.reason = "PAD signal";
                    ac.text = "# " + cmd.str();
                    result.warnings.push_back("Commented out clock defined on PAD signal '" +
                                              objExpr + "' at " + c.file + ":" +
                                              std::to_string(c.line));
                } else if (isDftClk) {
                    ac.commented = true;
                    ac.reason = "DFT clock";
                    ac.text = "# " + cmd.str();
                    result.warnings.push_back("Commented out DFT clock '" + c.name + "' at " +
                                              c.file + ":" + std::to_string(c.line));
                } else {
                    ac.text = cmd.str();
                }
                result.addClockCmds.push_back(std::move(ac));
            }
        }

        if (!c.name.empty())
            g.tessentClockMappingCmd = "set tessent_clock_mapping(" + c.name + ") " + c.name;
        result.clocks.push_back(std::move(g));
    }

    // write_tcl_file's two dedup passes for dft_clock_define.tcl (exact-text, then keep-last-
    // per-object with earlier ones commented out — including the accidental double-comment on an
    // already-PAD/DFT-commented line, since the object key is extracted from the same final text
    // Perl wrote to disk).
    result.addClockCmds =
        dedupExact(std::move(result.addClockCmds), [](const AddClockCmd& a) { return a.text; });
    {
        std::unordered_map<std::string, int> lastIdxForObj;
        for (size_t i = 0; i < result.addClockCmds.size(); ++i) {
            const std::string key = extractObjToken(result.addClockCmds[i].text);
            if (!key.empty()) lastIdxForObj[key] = static_cast<int>(i);
        }
        for (size_t i = 0; i < result.addClockCmds.size(); ++i) {
            const std::string key = extractObjToken(result.addClockCmds[i].text);
            if (key.empty() || lastIdxForObj[key] == static_cast<int>(i)) continue;
            result.addClockCmds[i].text = "# " + result.addClockCmds[i].text;
            if (!result.addClockCmds[i].commented) {
                result.addClockCmds[i].commented = true;
                result.addClockCmds[i].reason = "superseded";
            }
        }
    }

    for (const GeneratedClock& g : result.clocks)
        if (!g.tessentClockMappingCmd.empty()) result.tessentMappingCmds.push_back(g.tessentClockMappingCmd);
    result.tessentMappingCmds = dedupExact(std::move(result.tessentMappingCmds),
                                           [](const std::string& s) { return s; });

    return result;
}

}  // namespace sdc
