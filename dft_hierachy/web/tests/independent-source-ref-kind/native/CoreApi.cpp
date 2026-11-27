// Independent B public-API consumer. Must be rebuilt with the matching product libraries.
#include "hier/Design.h"
#include <iostream>
#include <map>
#include <stdexcept>
#include <tuple>
using namespace hier;
using namespace hier::model;
namespace {
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
template<class T> const T& ok(const Result<T>& result) { if (!result) throw std::runtime_error(result.error().message); return result.value(); }
}
int main(int argc, char** argv) {
    try {
        require(argc == 6, "usage: fixture line col shared|per target-kind");
        const std::string targetKind=argv[5];const size_t line=std::stoull(argv[2]),column=std::stoull(argv[3]);
        OpenOptions options; options.files={argv[1]}; options.forcePerInstanceBodies=std::string(argv[4])=="per";
        auto opened=Design::open(options); require(opened.ok(), "fixture must open"); auto design=std::move(opened.value());
        require(design->diagnostics().errorCount==0,"no fixture error");
        std::map<std::string,SourceRefKind> known;std::vector<std::string> targets;
        auto definitions=design->definitions();for(const auto& d:ok(definitions).items){known.emplace(d.ref,SourceRefKind::Definition);if(targetKind=="definition"&&d.name=="b_rk_leaf")targets.push_back(d.ref);}
        const auto roots=design->roots();require(roots.size()==1,"one root");auto children=design->children(roots[0].ref);
        auto instances=ok(children).items;require(instances.size()==2,"all two occurrences");instances.insert(instances.begin(),roots[0]);
        for(const auto& inst:instances){const bool leaf=inst.ref!=roots[0].ref;known.emplace(inst.ref,SourceRefKind::Object);if(leaf&&targetKind=="instance")targets.push_back(inst.ref);
            auto ports=design->ports(inst.ref);for(const auto& p:ok(ports)){known.emplace(p.ref,SourceRefKind::Object);if(leaf&&targetKind=="port"&&p.name=="d")targets.push_back(p.ref);}
            auto signals=design->signals(inst.ref);for(const auto& s:ok(signals).items){known.emplace(s.ref,SourceRefKind::Object);if(leaf&&targetKind=="signal"&&s.name=="stage")targets.push_back(s.ref);}
            auto processes=design->procs(inst.ref);for(const auto& p:ok(processes).items){known.emplace(p.ref,SourceRefKind::Object);if(leaf&&targetKind=="process"){const auto source=design->source(p.ref,SourceKind::Statement);if(source&&source->start.line==line&&source->start.column==column)targets.push_back(p.ref);}}
            auto registers=design->registers(inst.ref);for(const auto& r:ok(registers).result.items){known.emplace(r.ref,SourceRefKind::Object);if(leaf&&targetKind=="register")targets.push_back(r.ref);}
        }
        require(targets.size()==(targetKind=="definition"?1U:2U),"independent public target identities");
        auto location=design->source(instances[1].ref,SourceKind::Definition);const auto file=ok(location).file;
        using Key=std::tuple<std::string,SourceKind,std::string,std::string,size_t,size_t,size_t,size_t,size_t,size_t,std::string,std::optional<std::string>>;
        std::vector<Key> baseline;
        for(const int limit:{1,2,200}){std::vector<Key> projection;std::map<std::string,bool> seen;PageRequest page;page.limit=limit;
            do{auto query=design->resolveSource(file,line,column,page);const auto& value=ok(query);
                require(value.completeness.status=="complete" && value.completeness.reasons.empty(),"ordinary complete paging");
                require(value.result.items.size()<=static_cast<size_t>(limit),"bounded page");
                for(const auto& h:value.result.items){require(known.contains(h.ref),"independently enumerated ref");require(h.refKind.has_value(),"every actual Core hit must carry tag");require(*h.refKind==known.at(h.ref),"authoritative tag, not SourceKind/inst/ref text");seen[h.ref]=true;projection.emplace_back(h.ref,h.kind,h.span.file,h.span.path,h.span.start.offset,h.span.start.line,h.span.start.column,h.span.end.offset,h.span.end.line,h.span.end.column,h.span.contentHash,h.inst);}
                require(value.result.next.empty()||value.result.next!=page.cursor,"cursor progresses");page.cursor=value.result.next;
            }while(!page.cursor.empty());
            for(const auto& ref:targets)require(seen.contains(ref),"every target occurrence must actually be hit");
            require(!projection.empty(),"curated B marker has real hits");if(baseline.empty())baseline=projection;else require(projection==baseline,"old projection and order stable across page sizes");
        }
        std::cout<<"{\"pass\":true,\"hits\":"<<baseline.size()<<"}\n";return 0;
    }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
