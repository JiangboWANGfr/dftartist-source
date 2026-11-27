#include "MemoryTestAssessmentComparisonJson.h"
#include "MemoryTestAssessmentJson.h"
#include "MemoryLibraryInput.h"
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::memory;
size_t assertions=0;
void need(bool ok,const char *why){++assertions;if(!ok)throw std::runtime_error(why);}
std::string json(const MemoryTestAssessmentComparison &r){hier::protocol::JsonWriter w;writeMemoryTestAssessmentComparison(w,r);return w.str();}
void equivalent(hier::Design &design,const MemoryTestAssessmentComparisonRequest &q,const MemoryTestAssessmentComparison &r) {
    auto original=compareMemoryTestConfigurations(design,q.tests);need(bool(original),"original comparison");
    hier::protocol::JsonWriter a,b;writeMemoryTestComparison(a,*original);writeMemoryTestComparison(b,r.source);need(a.str()==b.str(),"unchanged original timing comparison");
    for(size_t i=0;i<q.tests.configurations.size();++i) {
        const auto &v=q.tests.configurations[i].configuration;
        MemoryTestAssessmentRequest one{{{{q.tests.investigation,v.planning},v.rules,v.scheduling},v.timing},q.clockLimits,q.expectations[i]};
        auto old=assessMemoryTests(design,one);need(bool(old),"single assessment");const auto &entry=r.configurations[i];
        MemoryTestAssessmentReport restored{{r.source.configurations[i].report,entry.coverage},r.clockLimits,r.clocks,entry.domains,entry.check,entry.assessment};
        hier::protocol::JsonWriter c,d;writeMemoryTestAssessment(c,*old);writeMemoryTestAssessment(d,restored);need(c.str()==d.str(),"all original facts and derived fields exactly equal");
        const auto &row=r.rows[i];need(row.comparable==row.delta.has_value(),"delta presence");need(row.transitions.size()==entry.assessment.rows.size(),"one transition per observed macro");
        for(size_t j=0;j<row.transitions.size();++j){const auto &t=row.transitions[j];need(t.macro==j&&t.referenceStatus==r.configurations[0].assessment.rows[j].status&&t.status==entry.assessment.rows[j].status,"same macro transition");}
    }
}
}
int main()try {
    const auto dir=std::filesystem::path(DFT_MEMORY_ASSESSMENT_COMPARISON_DIR);
    auto lib=loadMemoryLibrary(dir/"memory-clock-library.json");need(bool(lib),"library");
    MemoryTestAssessmentComparisonRequest q;q.tests.investigation.scope="domain_resolved";q.tests.investigation.recursive=true;q.tests.investigation.mapping.models=lib->models;
    MemoryTestConfiguration config;for(const auto &m:lib->models)config.planning.profiles.push_back({m.definitionName,2,10});
    config.rules=std::vector<MemoryTestRule>{{{"domain_resolved"},true,"D",""}};config.timing.clocks={{"D",1000}};config.timing.policy.waveOverheadPicoseconds=7;
    q.tests.configurations={{"base",config},{"candidate",config}};
    std::vector<MemoryClockExpectation> allowed={{"D",{{"domain_resolved.clk",0,"posedge"},{"domain_resolved.clk",1,"posedge"},{"domain_resolved.clk",0,"negedge"}}}};q.expectations={allowed,allowed};
    hier::model::OpenOptions opts;opts.tops={"domain_resolved"};opts.files={dir/"memory-clock-sources.sv",dir/"memory-test-domains.sv"};auto design=hier::Design::open(opts);need(design&&design.value()->diagnostics(100).errorCount==0,"real RTL");
    auto good=compareMemoryTestAssessments(*design.value(),q);need(good&&good->complete&&good->configurations[0].assessment.satisfiedInstances==6,"both fully satisfied");need(good->source.configurations[0].report.timeline.durationPicoseconds==32014,"hand computed two-wave duration");equivalent(*design.value(),q,*good);
    auto x=q;x.expectations[1][0].sources.resize(1);auto changed=compareMemoryTestAssessments(*design.value(),x);need(changed&&changed->complete&&changed->configurations[1].assessment.verdict=="fail","complete violation is comparable");need(changed->rows[1].delta->satisfiedInstances==-2&&changed->rows[1].delta->blockedInstances==2&&changed->rows[1].delta->pendingInstances==0,"two bit/edge violations");size_t differences=0;for(const auto &t:changed->rows[1].transitions)differences+=t.referenceStatus!=t.status;need(differences==2,"two concrete status changes");equivalent(*design.value(),x,*changed);
    std::swap(x.expectations[0],x.expectations[1]);changed=compareMemoryTestAssessments(*design.value(),x);need(changed&&changed->rows[1].delta->satisfiedInstances==2&&changed->rows[1].delta->blockedInstances==-2,"reverse signed changes");
    x=q;x.expectations[1].clear();auto partial=compareMemoryTestAssessments(*design.value(),x);need(partial&&!partial->complete&&partial->source.complete&&partial->rows[0].comparable&&!partial->rows[1].delta,"joint completeness differs from timing completeness");need(partial->configurations[1].assessment.pendingInstances==6&&partial->rows[1].transitions.size()==6,"retain observed pending states");equivalent(*design.value(),x,*partial);
    std::swap(x.expectations[0],x.expectations[1]);partial=compareMemoryTestAssessments(*design.value(),x);need(partial&&!partial->rows[0].delta&&!partial->rows[1].delta,"partial reference disables all deltas");
    x=q;x.clockLimits.maxWork=1;partial=compareMemoryTestAssessments(*design.value(),x);need(partial&&!partial->complete&&partial->clocks.work<=1&&partial->configurations[0].assessment.pendingInstances==6&&partial->configurations[1].assessment.pendingInstances==6,"one shared clock prefix");equivalent(*design.value(),x,*partial);
    x=q;x.tests.investigation.mapping.limits.maxMacros=2;partial=compareMemoryTestAssessments(*design.value(),x);need(partial&&partial->rows[1].transitions.size()==6&&partial->configurations[1].assessment.pendingInstances==4,"all observed macros despite mapping prefix");equivalent(*design.value(),x,*partial);
    x=q;x.tests.configurations[1].configuration.timing.limits.maxWork=1;partial=compareMemoryTestAssessments(*design.value(),x);need(partial&&!partial->complete&&partial->configurations[1].assessment.pendingInstances==6&&partial->configurations[0].assessment.satisfiedInstances==6,"independent timing budgets");
    x=q;x.tests.configurations[1].configuration.planning.policy.maxPowerMicrowatts=1;partial=compareMemoryTestAssessments(*design.value(),x);need(partial&&partial->configurations[1].assessment.blockedInstances==6&&partial->configurations[1].check.matchedInstances==6,"planning obstacles preserved");
    x=q;x.tests.configurations[1].configuration.timing.clocks[0].periodPicoseconds=100;changed=compareMemoryTestAssessments(*design.value(),x);need(changed&&changed->complete&&changed->source.rows[1].delta->durationPicoseconds==-28800&&changed->rows[1].delta->satisfiedInstances==0,"time changes without status changes");
    x=q;x.tests.investigation.recursive=false;x.expectations={{},{}};auto empty=compareMemoryTestAssessments(*design.value(),x);need(empty&&empty->complete&&empty->rows[1].transitions.empty()&&empty->rows[1].delta->pendingInstances==0,"complete empty comparison");
    x=q;while(x.tests.configurations.size()<8){x.tests.configurations.push_back({"case"+std::to_string(x.tests.configurations.size()),config});x.expectations.push_back(allowed);}auto eight=compareMemoryTestAssessments(*design.value(),x);need(eight&&eight->complete&&eight->configurations.size()==8,"eight configurations accepted");
    for(int kind=0;kind<8;++kind){x=q;x.tests.investigation.scope="absent";switch(kind){case 0:x.expectations.pop_back();break;case 1:x.expectations.push_back(allowed);break;case 2:x.expectations[1][0].sources[0].edge="both";break;case 3:x.tests.configurations[1].name="base";break;case 4:x.clockLimits.maxWork=0;break;case 5:x.tests.configurations[1].configuration.timing.limits.maxWork=0;break;case 6:x.tests.configurations.pop_back();x.expectations.pop_back();break;default:x.tests.configurations[1].configuration.scheduling.policy.maxParallelControllers=0;break;}auto bad=compareMemoryTestAssessments(*design.value(),x);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"validate complete batch before query");}
    std::stop_source stop;stop.request_stop();auto cancelled=compareMemoryTestAssessments(*design.value(),x,stop.get_token());need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel priority");const auto encoded=json(*good);design.value().reset();q={};need(encoded==json(*good),"owned after release");std::cout<<assertions<<" memory assessment comparison assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
