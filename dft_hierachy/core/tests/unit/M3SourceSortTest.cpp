// B independent C59 oracle: DESIGN, handwritten generator, C-approved events only.
#include <catch2/catch_test_macros.hpp>
#include "hier/Design.h"
#include "Observe.h"
#include <algorithm>
#include <array>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <stop_token>
#include <string>
#include <unistd.h>
using namespace hier;
namespace {
namespace obs=hier::observation;
constexpr auto Macro="`B_C59_DECLS";
constexpr size_t Kinds=static_cast<size_t>(obs::Kind::TraceFilterRange)+1;
struct State {
    std::array<size_t,Kinds> counts{};
    std::stop_source* stop=nullptr;
    obs::Kind trigger=obs::Kind::SourceIndexSortCompare;
    size_t at=0,inGroup=0,atStop=0,afterCandidates=0;
    uint64_t subject=0;
    bool haveGroup=false,badPayload=false,badKind=false;
    size_t count(obs::Kind kind) const {return counts[static_cast<size_t>(kind)];}
};
void event(void* context,const obs::Event& e) noexcept {
    auto& s=*static_cast<State*>(context);
    const bool ordering=e.kind==obs::Kind::SourceIndexSortCompare ||
                        e.kind==obs::Kind::SourceIndexDedupCandidate;
    if(ordering && e.amount!=1) s.badPayload=true;
    if(ordering && s.stop && s.stop->stop_requested()) ++s.afterCandidates;
    const auto index=static_cast<size_t>(e.kind);
    if(index>=s.counts.size()) {s.badKind=true;return;}
    ++s.counts[index];
    if(s.stop && e.kind==s.trigger) {
        if(!s.haveGroup || s.subject!=e.subject) {
            s.haveGroup=true;s.subject=e.subject;s.inGroup=0;
        }
        ++s.inGroup;
        if(!s.stop->stop_requested() && s.inGroup==s.at) {
            s.atStop=s.inGroup;s.stop->request_stop();
        }
    }
}
obs::Sink sink(State& s) {return {&s,event,nullptr};}
struct Files {
    std::filesystem::path folder;
    Files() {
        auto pattern=(std::filesystem::temp_directory_path()/"hier-b-c59-XXXXXX").string();
        std::vector<char> bytes(pattern.begin(),pattern.end());bytes.push_back('\0');
        const auto* made=mkdtemp(bytes.data());REQUIRE(made!=nullptr);folder=made;
    }
    ~Files() {std::error_code error;std::filesystem::remove_all(folder,error);}
};
std::string input(size_t n,bool array) {
    std::string out="`define B_C59_DECLS \\\n";
    for(size_t i=0;i<n;++i) {
        out+="  wire b"+std::to_string(i)+";";
        out+=(i+1<n ? " \\\n" : "\n");
    }
    out+="module b_c59_leaf;\n  `B_C59_DECLS\nendmodule\n";
    if(array) out+="module b_c59_top;\n  b_c59_leaf u[0:11]();\nendmodule\n";
    return out;
}
void put(const std::filesystem::path& path,const std::string& text) {
    std::ofstream out(path,std::ios::binary|std::ios::trunc);
    REQUIRE(out.is_open());out<<text;out.close();REQUIRE(out.good());
}
model::SourcePos pos(const std::string& text,size_t offset) {
    REQUIRE(offset<=text.size());
    const auto last=text.rfind('\n',offset==0 ? 0 : offset-1);
    return {offset,1+static_cast<size_t>(std::count(text.begin(),text.begin()+
            static_cast<std::string::difference_type>(offset),'\n')),
            last==std::string::npos ? offset+1 : offset-last};
}
void samePos(const model::SourcePos& actual,const model::SourcePos& expected) {
    CHECK(actual.offset==expected.offset);CHECK(actual.line==expected.line);
    CHECK(actual.column==expected.column);
}
struct Expected {
    std::string ref;
    bool macro=false;
};
struct Opened {
    std::unique_ptr<Design> design;
    std::string file,hash;
    model::SourcePos moduleStart,moduleEnd,macroStart,macroEnd;
    std::vector<Expected> expected;
};
Opened open(const std::filesystem::path& path,const std::string& text,size_t n,
            bool array,bool per,size_t cache) {
    model::OpenOptions options;options.files={path.string()};
    options.tops={array ? "b_c59_top" : "b_c59_leaf"};
    options.forcePerInstanceBodies=per;options.connectionCacheBytes=cache;
    auto result=Design::open(options);REQUIRE(result.ok());
    Opened o;o.design=std::move(result.value());
    REQUIRE(o.design->diagnostics().errorCount==0);
    const auto module=text.find("module b_c59_leaf;");
    const auto macro=text.find(Macro,module);
    REQUIRE(module!=std::string::npos);REQUIRE(macro!=std::string::npos);
    o.moduleStart=pos(text,module);o.moduleEnd=pos(text,text.find("endmodule",module)+9);
    o.macroStart=pos(text,macro);o.macroEnd=pos(text,macro+std::string(Macro).size());
    auto defs=o.design->definitions();REQUIRE(defs.ok());
    for(const auto& def:defs->items) if(def.name=="b_c59_leaf") {
        o.expected.push_back({def.ref,false});
        auto span=o.design->source(def.ref,model::SourceKind::Definition);
        REQUIRE(span.ok());o.file=span->file;o.hash=span->contentHash;
        samePos(span->start,o.moduleStart);samePos(span->end,o.moduleEnd);
    }
    REQUIRE(o.expected.size()==1);
    const auto roots=o.design->roots();REQUIRE(roots.size()==1);
    std::vector<std::string> instances;
    if(array) {
        auto children=o.design->children(roots[0].ref);REQUIRE(children.ok());
        REQUIRE(children->items.size()==12);CHECK(children->next.empty());
        std::map<std::string,std::string> byName;
        for(const auto& child:children->items) byName.emplace(child.name,child.ref);
        for(size_t i=0;i<12;++i) {
            auto found=byName.find("u["+std::to_string(i)+"]");REQUIRE(found!=byName.end());
            instances.push_back(found->second);
        }
    } else instances.push_back(roots[0].ref);
    for(const auto& inst:instances) o.expected.push_back({inst,false});
    for(const auto& inst:instances) {
        PageRequest page;page.limit=static_cast<int>(n+1);
        auto signals=o.design->signals(inst,page);REQUIRE(signals.ok());
        REQUIRE(signals->items.size()==n);CHECK(signals->next.empty());
        std::map<std::string,std::string> byName;
        for(const auto& signal:signals->items) byName.emplace(signal.name,signal.ref);
        for(size_t i=0;i<n;++i) {
            auto found=byName.find("b"+std::to_string(i));REQUIRE(found!=byName.end());
            o.expected.push_back({found->second,true});
        }
    }
    REQUIRE(o.expected.size()==(array ? 13+12*n : n+2));
    return o;
}
std::vector<std::string> collect(Opened& o,size_t firstLimit) {
    std::vector<std::string> refs;
    PageRequest page;page.limit=static_cast<int>(firstLimit);
    std::set<std::string> cursors;
    size_t number=0;
    for(;;) {
        auto r=o.design->resolveSource(o.file,o.macroStart.line,o.macroStart.column,page);
        REQUIRE(r.ok());CHECK(r->completeness.status=="complete");
        REQUIRE(r->result.items.size()<=static_cast<size_t>(page.limit));
        REQUIRE_FALSE(r->result.items.empty());
        for(const auto& hit:r->result.items) {
            REQUIRE(refs.size()<o.expected.size());
            const auto& wanted=o.expected[refs.size()];
            CHECK(hit.ref==wanted.ref);CHECK(hit.kind==model::SourceKind::Definition);
            CHECK(hit.span.file==o.file);CHECK(hit.span.contentHash==o.hash);
            samePos(hit.span.start,wanted.macro ? o.macroStart : o.moduleStart);
            samePos(hit.span.end,wanted.macro ? o.macroEnd : o.moduleEnd);
            refs.push_back(hit.ref);
        }
        if(r->result.next.empty()) break;
        CHECK(r->result.next!=page.cursor);
        REQUIRE(cursors.insert(r->result.next).second);
        page.cursor=r->result.next;
        page.limit=(++number%2==0) ? 509 : 211;
        REQUIRE(number<=o.expected.size());
    }
    REQUIRE(refs.size()==o.expected.size());
    CHECK(std::set<std::string>(refs.begin(),refs.end()).size()==refs.size());
    return refs;
}
void cancelRetry(const std::filesystem::path& path,const std::string& text,size_t n,
                 bool array,bool per,size_t cache,obs::Kind stage,size_t at) {
    auto o=open(path,text,n,array,per,cache);
    std::stop_source stop;State stopped;stopped.stop=&stop;stopped.trigger=stage;
    stopped.at=at;auto observer=sink(stopped);
    {
        obs::Scope scope(observer);PageRequest page;page.limit=97;
        auto r=o.design->resolveSource(o.file,o.macroStart.line,o.macroStart.column,
                                      page,stop.get_token());
        REQUIRE(stop.stop_requested());
        REQUIRE_FALSE(r.ok());CHECK(r.error().code==ErrorCode::Cancelled);
        CHECK_FALSE(r.error().message.empty());
    }
    CHECK(stopped.atStop==at);CHECK(stopped.afterCandidates<=256);
    CHECK_FALSE(stopped.badPayload);CHECK_FALSE(stopped.badKind);
    CHECK(stopped.count(obs::Kind::SourceIndexPublish)==0);
    CHECK(stopped.count(obs::Kind::SourceCandidate)==0);
    CHECK(stopped.count(obs::Kind::SourceHitMaterialize)==0);
    CHECK(stopped.count(obs::Kind::SourceHitEmit)==0);
    State cold;auto coldSink=sink(cold);
    std::vector<std::string> all;
    {
        obs::Scope scope(coldSink);all=collect(o,73);
    }
    CHECK(cold.count(obs::Kind::SourceIndexRange)>0);
    CHECK(cold.count(obs::Kind::SourceIndexSortCompare)>0);
    CHECK(cold.count(obs::Kind::SourceIndexDedupCandidate)>0);
    CHECK(cold.count(obs::Kind::SourceIndexPublish)==1);
    CHECK_FALSE(cold.badPayload);CHECK_FALSE(cold.badKind);
    State hot;auto hotSink=sink(hot);
    {
        obs::Scope scope(hotSink);CHECK(collect(o,127)==all);
    }
    CHECK(hot.count(obs::Kind::SourceIndexRange)==0);
    CHECK(hot.count(obs::Kind::SourceIndexSortCompare)==0);
    CHECK(hot.count(obs::Kind::SourceIndexDedupCandidate)==0);
    CHECK(hot.count(obs::Kind::SourceIndexPublish)==0);
    CHECK_FALSE(hot.badKind);CHECK_FALSE(hot.badPayload);
}
}
TEST_CASE("B C59: macro range sort and dedupe cancel within 256 candidates and retry cold",
          "[b-m3-source-sort]") {
    for(size_t n:{769U,2305U}) for(bool per:{false,true}) for(size_t cache:{0U,67108864U})
    for(const auto stage:{obs::Kind::SourceIndexSortCompare,obs::Kind::SourceIndexDedupCandidate})
    for(size_t at:{1U,256U,257U,513U})
    DYNAMIC_SECTION("n="<<n<<" per="<<per<<" cache="<<cache<<" stage="<<static_cast<int>(stage)<<" at="<<at) {
        Files files;const auto text=input(n,false);const auto path=files.folder/"bulk.sv";
        put(path,text);cancelRetry(path,text,n,false,per,cache,stage,at);
    }
}
TEST_CASE("B C59: range interruption preserves all twelve numerical occurrences on retry",
          "[b-m3-source-sort]") {
    constexpr size_t n=513;
    for(bool per:{false,true}) for(size_t cache:{0U,67108864U})
    for(const auto stage:{obs::Kind::SourceIndexSortCompare,obs::Kind::SourceIndexDedupCandidate})
    DYNAMIC_SECTION("array per="<<per<<" cache="<<cache<<" stage="<<static_cast<int>(stage)) {
        Files files;const auto text=input(n,true);const auto path=files.folder/"array.sv";
        put(path,text);cancelRetry(path,text,n,true,per,cache,stage,257);
    }
}
