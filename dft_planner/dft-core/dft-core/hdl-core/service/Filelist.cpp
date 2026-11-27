#include "service/Filelist.h"

#include <algorithm>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <system_error>

namespace fs = std::filesystem;

namespace {
const char* kExts[] = {".v", ".sv", ".svh", ".vh"};
bool isHeader(const std::string& ext) { return ext == ".vh" || ext == ".svh"; }

std::string strip(const std::string& s) {
    const char* ws = " \t\r\n\f\v";
    size_t a = s.find_first_not_of(ws);
    if (a == std::string::npos) return "";
    size_t b = s.find_last_not_of(ws);
    return s.substr(a, b - a + 1);
}

std::string replaceAll(std::string s, const std::string& from, const std::string& to) {
    if (from.empty()) return s;
    size_t pos = 0;
    while ((pos = s.find(from, pos)) != std::string::npos) {
        s.replace(pos, from.size(), to);
        pos += to.size();
    }
    return s;
}

std::string resolve(const std::string& base, const std::string& p) {
    return fs::path(p).is_absolute() ? p : (fs::path(base) / p).string();
}

// A library extension as slang wants it: leading dot, no duplicates. `+libext+v` (no dot) shows
// up in hand-written filelists and means the same thing as `+libext+.v`.
void addLibExt(std::vector<std::string>& out, const std::string& raw) {
    if (raw.empty()) return;
    std::string ext = raw[0] == '.' ? raw : "." + raw;
    if (std::find(out.begin(), out.end(), ext) == out.end()) out.push_back(ext);
}

// Length of the "--std" / "-std" option token at the head of `line`, or 0 if this is not that
// option. Matched exactly (end, '=' or a space follows) so that a path-ish "-stdcells" is left
// alone instead of being read as a bogus language version.
size_t stdOptLen(const std::string& line) {
    for (const char* opt : {"--std", "-std"}) {
        size_t n = std::strlen(opt);
        if (line.compare(0, n, opt) != 0) continue;
        if (line.size() == n || line[n] == '=' || line[n] == ' ' || line[n] == '\t') return n;
    }
    return 0;
}

// split "a+b+c" by '+', dropping empties
std::vector<std::string> splitPlus(const std::string& s) {
    std::vector<std::string> out;
    size_t start = 0;
    while (start <= s.size()) {
        size_t plus = s.find('+', start);
        std::string tok =
            s.substr(start, plus == std::string::npos ? std::string::npos : plus - start);
        if (!tok.empty()) out.push_back(tok);
        if (plus == std::string::npos) break;
        start = plus + 1;
    }
    return out;
}
}  // namespace

namespace hdl::service {

FilelistResult parseFilelist(const std::string& path,
                             const std::vector<std::pair<std::string, std::string>>& varmap,
                             const std::vector<std::pair<std::string, std::string>>& substs) {
    FilelistResult r;
    std::error_code ec;
    if (fs::is_directory(path, ec)) {
        std::vector<std::string> heads, srcs;
        for (const char* ext : kExts) {
            std::vector<std::string> matches;
            for (auto& e : fs::recursive_directory_iterator(path)) {
                if (e.is_regular_file() && e.path().extension() == ext)
                    matches.push_back(e.path().string());
            }
            std::sort(matches.begin(), matches.end());
            for (auto& m : matches) (isHeader(ext) ? heads : srcs).push_back(m);
        }
        heads.insert(heads.end(), srcs.begin(), srcs.end());
        r.files = std::move(heads);
        return r;
    }

    std::string base = fs::absolute(path).parent_path().string();
    std::ifstream in(path);
    std::string raw;
    // An option whose argument was not on the same line ("-y" / "-v" / "--std" alone) claims the
    // next non-option line. Dropped silently if what follows is another option.
    enum class Pending { None, LibDir, File, Std } pending = Pending::None;
    while (std::getline(in, raw)) {
        std::string line = strip(raw);
        if (line.empty() || line.rfind("//", 0) == 0 || line.rfind("#", 0) == 0) continue;
        // var/subst on every line (so +incdir+${VAR}/dir and -f ${VAR}/sub.f also expand)
        for (auto& [k, v] : varmap) {
            line = replaceAll(line, "${" + k + "}", v);
            line = replaceAll(line, "$" + k, v);
        }
        for (auto& [a, b] : substs) line = replaceAll(line, a, b);

        if (pending != Pending::None) {
            Pending p = pending;
            pending = Pending::None;
            if (line[0] != '+' && line[0] != '-') {
                if (p == Pending::LibDir)
                    r.libdirs.push_back(resolve(base, line));
                else if (p == Pending::Std)
                    r.langVersion = line;
                else
                    r.libfiles.push_back(resolve(base, line));
                continue;
            }
            // fall through: the dangling option had no argument
        }

        if (line.rfind("+define+", 0) == 0) {
            for (auto& d : splitPlus(line.substr(8))) r.defines.push_back(d);
        } else if (line.rfind("+incdir+", 0) == 0) {
            for (auto& d : splitPlus(line.substr(8))) r.incdirs.push_back(resolve(base, d));
        } else if (line.rfind("+libext+", 0) == 0) {
            for (auto& e : splitPlus(line.substr(8))) addLibExt(r.libexts, e);
        } else if (size_t n = stdOptLen(line)) {
            // exact "--std"/"-std", or with the value glued on by '=' or a space
            std::string v = strip(line.substr(n));
            if (!v.empty() && v[0] == '=') v = strip(v.substr(1));
            if (!v.empty())
                r.langVersion = v;
            else
                pending = Pending::Std;
        } else if (line.rfind("-y", 0) == 0) {
            std::string d = strip(line.substr(2));
            if (!d.empty())
                r.libdirs.push_back(resolve(base, d));
            else
                pending = Pending::LibDir;
        } else if (line.rfind("-f", 0) == 0 || line.rfind("-F", 0) == 0) {
            std::string nested = resolve(base, strip(line.substr(2)));
            FilelistResult sub = parseFilelist(nested, varmap, substs);
            r.files.insert(r.files.end(), sub.files.begin(), sub.files.end());
            r.libfiles.insert(r.libfiles.end(), sub.libfiles.begin(), sub.libfiles.end());
            r.defines.insert(r.defines.end(), sub.defines.begin(), sub.defines.end());
            r.incdirs.insert(r.incdirs.end(), sub.incdirs.begin(), sub.incdirs.end());
            r.libdirs.insert(r.libdirs.end(), sub.libdirs.begin(), sub.libdirs.end());
            for (auto& e : sub.libexts) addLibExt(r.libexts, e);
            if (r.langVersion.empty()) r.langVersion = sub.langVersion;  // outer wins
        } else if (line.rfind("-v", 0) == 0) {
            std::string f = strip(line.substr(2));
            if (!f.empty())
                r.libfiles.push_back(resolve(base, f));
            else
                pending = Pending::File;
        } else if (line[0] == '+' || line[0] == '-') {
            // unknown option -> ignore
        } else {
            r.files.push_back(resolve(base, line));
        }
    }
    return r;
}

}  // namespace hdl::service
