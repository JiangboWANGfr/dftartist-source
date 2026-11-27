#include "MemoryTestRulesInternal.h"
#include "MemoryTestPlanInternal.h"
#include "../common/Utf8.h"
#include <map>
#include <set>
namespace dft::memory {
namespace {
void checkpoint(hier::Cancel c){if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory rule planning cancelled"};}
void require(bool ok,const char *why){if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,why};}
struct Node {std::map<std::string,size_t,std::less<>> children;std::optional<size_t> exact,subtree;};
class Rules {
    std::vector<Node> nodes_{1};
    size_t maxDepth_=0;
    hier::Cancel cancel_;
public:
    Rules(const std::vector<MemoryTestRule> &rules,hier::Cancel c):cancel_(c) {
        for(size_t i=0;i<rules.size();++i){checkpoint(c);size_t node=0;
            if(rules[i].path.size()>maxDepth_)maxDepth_=rules[i].path.size();
            for(const auto &segment:rules[i].path){checkpoint(c);auto found=nodes_[node].children.find(segment);
                if(found==nodes_[node].children.end()){const size_t next=nodes_.size();nodes_[node].children.emplace(segment,next);nodes_.emplace_back();node=next;}
                else node=found->second;
            }
            (rules[i].recursive?nodes_[node].subtree:nodes_[node].exact)=i;
        }
    }
    std::optional<size_t> match(const std::vector<std::string> &path,uint64_t &visited) const {
        size_t node=0;std::optional<size_t> winner;
        for(size_t i=0;i<path.size()&&i<maxDepth_;++i){checkpoint(cancel_);++visited;auto next=nodes_[node].children.find(path[i]);if(next==nodes_[node].children.end())break;
            node=next->second;if(nodes_[node].subtree)winner=nodes_[node].subtree;
            if(i+1==path.size()&&nodes_[node].exact)winner=nodes_[node].exact;
        }
        return winner;
    }
};
}
void detail::validateMemoryTestRules(const std::vector<MemoryTestRule> &rules) {
    require(!rules.empty()&&rules.size()<=1024,"Provide 1..1024 memory test rules");size_t bytes=0;
    auto text=[&](const std::string &s,bool empty=false){require((empty||!s.empty())&&s.size()<=4096&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s),"Invalid memory test rule string");bytes+=s.size();require(bytes<=16777216,"Memory test rule strings exceed 16 MiB");};
    std::set<std::pair<std::vector<std::string>,bool>> selectors;
    for(const auto &rule:rules){require(!rule.path.empty()&&rule.path.size()<=256,"Memory test rule path needs 1..256 segments");for(const auto &s:rule.path)text(s);text(rule.clockDomain);text(rule.partition,true);require(selectors.emplace(rule.path,rule.recursive).second,"Duplicate memory test rule selector");}
}
void detail::validateMemoryTestRuleRequest(const MemoryTestRuleRequest &r) {
    require(r.test.planning.assignments.empty(),"Do not combine memory test rules with explicit assignments");
    validateMemoryTestRequest(r.test);validateMemoryTestRules(r.rules);
}
MemoryTestRulePlan detail::planInvestigatedMemoriesByRules(MemoryInvestigation facts,const MemoryTestPlanning &input,const std::vector<MemoryTestRule> &rules,hier::Cancel c) {
    checkpoint(c);Rules index(rules,c);MemoryTestRulePlan out;out.rules=rules;out.report.investigation=std::move(facts);auto planning=input;
    const auto &source=out.report.investigation;std::vector<bool> used(rules.size(),false);
    for(size_t i=0;i<source.mapping.memories.size();++i){checkpoint(c);const auto &macro=source.interfaces.macros[source.mapping.memories[i].macro];const auto &instance=source.interfaces.catalog.instances[macro.instance].info;
        MemoryTestRuleChoice choice;choice.memory=i;choice.rule=index.match(instance.path,out.visitedSegments);
        if(choice.rule){const auto &rule=rules[*choice.rule];choice.assignment=planning.assignments.size();planning.assignments.push_back({instance.pathText,rule.clockDomain,rule.partition});used[*choice.rule]=true;}
        out.choices.push_back(std::move(choice));
    }
    for(size_t i=0;i<used.size();++i){checkpoint(c);if(!used[i])out.unusedRules.push_back(i);}
    out.report.plan=detail::planInvestigatedMemories(source,planning,c);checkpoint(c);return out;
}
hier::Result<MemoryTestRulePlan> planMemoryTestsByRules(hier::Design &design,const MemoryTestRuleRequest &r,hier::Cancel c)try {
    checkpoint(c);detail::validateMemoryTestRuleRequest(r);checkpoint(c);
    auto investigation=investigateMemories(design,r.test.investigation,c);if(!investigation)return investigation.error();
    return detail::planInvestigatedMemoriesByRules(std::move(investigation.value()),r.test.planning,r.rules,c);
}catch(const hier::Error &e){return e;}
}
