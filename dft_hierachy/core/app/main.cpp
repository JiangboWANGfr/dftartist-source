// hier: command-line access to the kernel. Each subcommand is one Design method and
// prints its result as one line of JSON (docs/DESIGN.md 5.3).
#include <charconv>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <string_view>
#include <vector>

#include "hier/Design.h"
#include "VerifySharing.h"
#include "hier/protocol/Json.h"
#include "hier/protocol/Serve.h"

using namespace hier;

namespace {
bool serving = false;

const char *kUsage =
    "usage: hier --version\n"
    "       hier <command> [<inst>] [--limit N] [--cursor C] <design>\n"
    "\n"
    "commands:\n"
    "  serve                one NDJSON query session on stdin/stdout\n"
    "  info                 what was opened: frontend, tops, counts\n"
    "  diags                compile diagnostics\n"
    "  roots                the top instances\n"
    "  inst <inst>          one instance\n"
    "  children <inst>      its child instances, paged\n"
    "  ancestors <inst>     from the top down to its parent\n"
    "  ports <inst>         its ports\n"
    "  params <inst>        its parameters\n"
    "  defs                 every definition, paged\n"
    "  def-instances <def>  all occurrences of a definition, paged\n"
    "  search <text>        literal search; [--kind KIND] [--scope INST], paged\n"
    "  resolve-path <path>  resolve HDL hierarchy paths to all matching references\n"
    "  signals / procs <inst>  signals or driving sources, paged\n"
    "  bindings <inst>      child pin bindings in this body\n"
    "  proc / obj <ref>     a source or object descriptor\n"
    "  registers <inst>     RTL registers; --recursive includes descendants\n"
    "  drivers / loads <ref> --reach local|hier [--side inside|outside]\n"
    "                       [--lsb N --width N] (default: whole object)\n"
    "  step <ref> --dir back|forward [--side inside|outside] [--max-hops N]\n"
    "  cone <ref> --dir back|forward --policy structural|combinational|full\n"
    "  paths <from> <to> [--from-lsb N --from-width N] [--to-lsb N --to-width N]\n"
    "                       [--from-side inside|outside] [--to-side inside|outside]\n"
    "  trace budgets: --max-nodes N --max-edges N --max-depth N --max-millis N\n"
    "  source <ref> --kind definition|instantiation|statement\n"
    "  resolve-source <file> --line N [--col N] [--limit N] [--cursor C]\n"
    "  read-source <file> / check-inputs  read or check snapshot inputs\n"
    "  verify-facts         check source accesses and dependency facts\n"
    "  verify-sharing       open the design twice, with and without body sharing, and\n"
    "                       compare every instance; exits 1 on any difference\n"
    "\n"
    "<inst> is a reference as printed by other commands, e.g. i:0.3\n"
    "\n"
    "<design>:\n"
    "  FILE...              source files\n"
    "  -f FILE              filelist; paths inside are relative to the current directory\n"
    "  -F FILE              filelist; paths inside are relative to the filelist\n"
    "  -D NAME[=VALUE]      also +define+NAME[=VALUE]\n"
    "  -I DIR               also +incdir+DIR\n"
    "  -y DIR               library directory\n"
    "  -Y EXT               also +libext+EXT\n"
    "  --top NAME           elaborate only this top (repeatable)\n"
    "  --timescale T        timescale for elements that declare none (default 1ns/1ns)\n"
    "  --no-single-unit     compile each file as its own compilation unit\n"
    "  --unknown-modules-are-errors\n"
    "  --per-instance-bodies  never share one extraction between instances\n"
    "  --comparison-cache-bytes N  connection cache per design (verify-sharing only)\n";

[[noreturn]] void fail(const std::string &message) {
    if (serving) {
        std::fprintf(stderr, "hier serve: %s\n", message.c_str());
        std::exit(2);
    }
    protocol::JsonWriter w;
    protocol::write(w, Error{ErrorCode::BadRequest, message});
    std::puts(w.str().c_str());
    std::exit(2);
}

template <class T> int print(const Result<T> &r) {
    protocol::JsonWriter w;
    if (r)
        protocol::write(w, r.value());
    else
        protocol::write(w, r.error());
    std::puts(w.str().c_str());
    return r ? 0 : 1;
}

int print(const Error &error) {
    protocol::JsonWriter w;
    protocol::write(w, error);
    std::puts(w.str().c_str());
    return 1;
}

template <class T> int print(const T &v) {
    protocol::JsonWriter w;
    protocol::write(w, v);
    std::puts(w.str().c_str());
    return 0;
}


} // namespace

int main(int argc, char **argv) {
    std::vector<std::string_view> args(argv + 1, argv + argc);
    if (args.size() == 1 && args[0] == "--version") {
        std::puts(protocol::buildInfoJson().c_str());
        return 0;
    }
    if (args.empty() || args[0] == "-h" || args[0] == "--help") {
        std::fputs(kUsage, args.empty() ? stderr : stdout);
        return args.empty() ? 2 : 0;
    }

    std::string command(args[0]);
    serving = command == "serve";
    std::string inst;
    PageRequest page;
    model::OpenOptions open;
    ConnectionRequest connection;
    connection.reach.clear();
    std::optional<uint64_t> lsb, width;
    bool recursive = false;
    std::string dir;
    std::string policy, target;
    model::Budget budget;
    ConnectionRequest targetConnection;
    std::optional<uint64_t> toLsb, toWidth;
    StepLimit stepLimit;
    model::SearchQuery search;
    std::string lookupArgument;
    std::optional<model::SourceKind> sourceKind;
    std::optional<size_t> sourceLine, sourceColumn;

    size_t i = 1;
    const bool lookup = command == "search" || command == "resolve-path" ||
                        command == "def-instances" || command == "source" ||
                        command == "resolve-source" || command == "read-source";
    if (lookup) {
        if (args.size() < 2)
            fail(command + " requires a positional argument");
        lookupArgument = args[i++];
    }
    if (command == "cone" || command == "paths") {
        if (args.size() < (command == "paths" ? 3u : 2u))
            fail(command + " requires object references");
        inst = args[i++];
        if (command == "paths")
            target = args[i++];
    }
    auto next = [&](std::string_view flag) {
        if (i + 1 >= args.size())
            fail("missing value for " + std::string(flag));
        return std::string(args[++i]);
    };
    auto number = [&](const std::string &n) {
        uint64_t value = 0;
        auto [end, ec] = std::from_chars(n.data(), n.data() + n.size(), value);
        if (n.empty() || ec != std::errc{} || end != n.data() + n.size())
            fail("expected unsigned integer");
        return value;
    };
    // +define+A+B and friends: one argument, several values.
    auto plus = [](std::string_view arg, std::string_view prefix, std::vector<std::string> &out) {
        if (!arg.starts_with(prefix))
            return false;
        arg.remove_prefix(prefix.size());
        while (!arg.empty()) {
            size_t p = arg.find('+');
            if (p != 0)
                out.emplace_back(arg.substr(0, p));
            if (p == std::string_view::npos)
                break;
            arg.remove_prefix(p + 1);
        }
        return true;
    };
    for (; i < args.size(); i++) {
        std::string_view a = args[i];
        if (a == "--limit") {
            auto value = next(a);
            auto [end, ec] = std::from_chars(value.data(), value.data() + value.size(), page.limit);
            if (value.empty() || ec != std::errc{} || end != value.data() + value.size())
                fail("limit must be an integer in the supported range");
        } else if (a == "--kind" && command == "source") {
            sourceKind = protocol::parseSourceKind(next(a));
            if (!sourceKind)
                fail("invalid source kind");
        } else if (a == "--line" && command == "resolve-source") {
            sourceLine = size_t(number(next(a)));
        } else if (a == "--col" && command == "resolve-source") {
            sourceColumn = size_t(number(next(a)));
        } else if (a == "--kind" && command == "search") {
            auto kind = protocol::parseHitKind(next(a));
            if (!kind)
                fail("invalid search kind");
            if (!search.kinds)
                search.kinds.emplace();
            search.kinds->push_back(*kind);
        } else if (a == "--scope" && command == "search")
            search.scope = next(a);
        else if (a == "--reach")
            connection.reach = next(a);
        else if (a == "--side" || (a == "--from-side" && command == "paths"))
            connection.side = next(a);
        else if (a == "--to-side" && command == "paths")
            targetConnection.side = next(a);
        else if (a == "--to-lsb" && command == "paths")
            toLsb = number(next(a));
        else if (a == "--to-width" && command == "paths")
            toWidth = number(next(a));
        else if (a == "--lsb" || (a == "--from-lsb" && command == "paths"))
            lsb = number(next(a));
        else if (a == "--width" || (a == "--from-width" && command == "paths"))
            width = number(next(a));
        else if (a == "--recursive")
            recursive = true;
        else if (a == "--dir")
            dir = next(a);
        else if (a == "--policy" && command == "cone")
            policy = next(a);
        else if ((command == "cone" || command == "paths") &&
                 (a == "--max-nodes" || a == "--max-edges" || a == "--max-depth" || a == "--max-millis")) {
            const auto n = number(next(a));
            if (n > uint64_t(INT64_MAX))
                fail("trace budget exceeds the supported integer range");
            if (a == "--max-nodes") budget.maxNodes = int64_t(n);
            if (a == "--max-edges") budget.maxEdges = int64_t(n);
            if (a == "--max-depth") budget.maxDepth = int64_t(n);
            if (a == "--max-millis") budget.maxMillis = int64_t(n);
        }
        else if (a == "--max-hops") {
            auto n = number(next(a));
            if (n > 2147483647)
                fail("max-hops is too large");
            stepLimit.maxHops = int(n);
        } else if (a == "--cursor")
            page.cursor = next(a);
        else if (a == "-f")
            open.filelists.push_back(next(a));
        else if (a == "-F")
            open.filelistsRelativeToFile.push_back(next(a));
        else if (a == "-D")
            open.defines.push_back(next(a));
        else if (a == "-I")
            open.includeDirs.push_back(next(a));
        else if (a == "-y")
            open.libraryDirs.push_back(next(a));
        else if (a == "-Y")
            open.libraryExts.push_back(next(a));
        else if (a == "--top")
            open.tops.push_back(next(a));
        else if (a == "--timescale")
            open.defaultTimescale = next(a);
        else if (a == "--no-single-unit")
            open.singleUnit = false;
        else if (a == "--unknown-modules-are-errors")
            open.unknownModulesAreBlackboxes = false;
        else if (a == "--comparison-cache-bytes" && command == "verify-sharing") {
            const auto value = next(a);
            const auto [end, ec] = std::from_chars(value.data(), value.data() + value.size(),
                                                 open.connectionCacheBytes);
            if (value.empty() || ec != std::errc{} || end != value.data() + value.size())
                fail("comparison cache must be an unsigned byte count in the supported range");
        }
        else if (a == "--per-instance-bodies")
            open.forcePerInstanceBodies = true;
        else if (plus(a, "+define+", open.defines) || plus(a, "+incdir+", open.includeDirs) ||
                 plus(a, "+libext+", open.libraryExts))
            continue;
        else if (a.starts_with("-") || a.starts_with("+"))
            fail("unknown option " + std::string(a));
        else if (a.size() > 2 && a[1] == ':' &&
                 std::string_view("ispxr").find(a[0]) != std::string_view::npos && inst.empty())
            inst = std::string(a);
        else
            open.files.emplace_back(a);
    }

    bool needsInst = command == "inst" || command == "children" || command == "ancestors" ||
                     command == "ports" || command == "params" || command == "signals" ||
                     command == "bindings" || command == "procs" || command == "proc" ||
                     command == "obj" || command == "registers" || command == "drivers" ||
                     command == "loads" || command == "step" || command == "cone" || command == "paths";
    bool known = needsInst || lookup || command == "info" || command == "diags" ||
                 command == "roots" || command == "defs" || command == "check-inputs" ||
                 command == "verify-sharing" || command == "verify-facts" || serving;
    if (!known)
        fail("unknown command " + command);
    if (needsInst && inst.empty())
        fail(command + " needs an instance reference such as i:0");

    if (bool(lsb) != bool(width))
        fail("lsb and width must be provided together");
    if (lsb)
        connection.bits = model::BitRange{*lsb, *width};
    if (bool(toLsb) != bool(toWidth))
        fail("to-lsb and to-width must be provided together");
    if (toLsb)
        targetConnection.bits = model::BitRange{*toLsb, *toWidth};
    if ((command == "drivers" || command == "loads") && connection.reach.empty())
        fail("reach is required");
    if ((command == "step" || command == "cone") && dir != "back" && dir != "forward")
        fail("dir must be back or forward");
    if (command == "cone" && policy != "structural" && policy != "combinational" && policy != "full")
        fail("policy must be structural, combinational or full");
    if (command == "source" && !sourceKind)
        fail("source requires --kind");
    if (command == "resolve-source" && !sourceLine)
        fail("resolve-source requires --line");
    stepLimit.cursor = page.cursor;
    if (command == "verify-sharing")
        return app::verifySharing(open);

    if (serving)
        return protocol::serve(std::move(open));
    auto opened = Design::open(open);
    if (!opened)
        return print(opened.error());
    const Design &design = *opened.value();

    if (command == "source")
        return print(design.source(lookupArgument, *sourceKind));
    if (command == "resolve-source")
        return print(design.resolveSource(lookupArgument, *sourceLine, sourceColumn, page));
    if (command == "read-source")
        return print(design.readSource(lookupArgument));
    if (command == "check-inputs")
        return print(design.checkInputs());
    if (command == "search") {
        search.text = lookupArgument;
        return print(design.search(search, page));
    }
    if (command == "def-instances")
        return print(design.instancesOf(lookupArgument, page));
    if (command == "resolve-path")
        return print(design.resolvePath(lookupArgument));
    if (command == "signals")
        return print(design.signals(inst, page));
    if (command == "bindings")
        return print(design.bindings(inst));
    if (command == "procs")
        return print(design.procs(inst, page));
    if (command == "proc")
        return print(design.proc(inst));
    if (command == "obj")
        return print(design.object(inst));
    if (command == "registers")
        return print(design.registers(inst, page, recursive));
    if (command == "drivers")
        return print(design.drivers(inst, connection));
    if (command == "loads")
        return print(design.loads(inst, connection));
    if (command == "step")
        return print(design.step(inst, dir == "back", connection, stepLimit));
    if (command == "cone")
        return print(design.cone(inst, dir == "back" ? model::TraceDirection::Back : model::TraceDirection::Forward,
                                policy == "structural" ? model::TracePolicy::Structural :
                                policy == "combinational" ? model::TracePolicy::Combinational : model::TracePolicy::Full,
                                connection, budget));
    if (command == "paths")
        return print(design.paths(inst, target, connection, targetConnection, budget));
    if (command == "verify-facts") {
        auto c = design.verifyFacts();
        std::printf("slangCompared=%llu selfChecked=%llu skippedExternal=%llu mismatched=%llu\n",
                    static_cast<unsigned long long>(c.slangCompared),
                    static_cast<unsigned long long>(c.selfChecked),
                    static_cast<unsigned long long>(c.skippedExternal),
                    static_cast<unsigned long long>(c.mismatched));
        for (auto &issue : c.issues)
            std::printf("%s\n", issue.c_str());
        return c.mismatched ? 1 : 0;
    }
    if (command == "info")
        return print(design.snapshot());
    if (command == "diags")
        return print(design.diagnostics());
    if (command == "roots")
        return print(design.roots());
    if (command == "inst")
        return print(design.instance(inst));
    if (command == "children")
        return print(design.children(inst, page));
    if (command == "ancestors")
        return print(design.ancestors(inst));
    if (command == "ports")
        return print(design.ports(inst));
    if (command == "params")
        return print(design.params(inst));
    return print(design.definitions(page));
}
