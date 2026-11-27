#include "RegisterSourceHierarchyMatrix.h"
#include "RegisterStatisticsInternal.h"
#include <iostream>
using namespace dft::sequential;
int main(int argc,char** argv){
 if(argc!=2)return 2;hier::model::OpenOptions o;o.files={argv[1]};o.tops={"W_tree"};auto d=hier::Design::open(o);if(!d)return 2;
 StatisticsRequest q;q.scope="W_tree";q.recursive=true;
 // Existing producer deadline seam, no altered DTO, new hook, sleep or implementation-derived expected value.
 auto st=detail::statisticsWithDeadline(**d,q,std::chrono::steady_clock::time_point{},{});
 if(!st||st->complete||!st->instances.empty()||st->scope!="W_tree"){std::cerr<<"legitimate expired-producer precondition not met\n";return 2;}
 RegisterScenarioRequest r;r.common.resolveLogic=true;r.scenarios={{"A",{{{"W_tree.mode",0},false}}},{"B",{{{"W_tree.mode",0},true}}}};
 auto im=compareRegisterSourceImpact(**d,*st,r);auto h=compareRegisterSourceHierarchy(**d,*st,r);auto m=compareRegisterSourceHierarchyMatrix(**d,*st,r);
 bool ip=im&& !im->complete&&im->comparisons.size()==1&&im->comparisons[0].instances.empty();
 bool hp=h&& !h->complete&&h->comparisons.size()==1&&h->comparisons[0].nodes.empty();
 bool mp=m&& !m->complete&&m->comparisons.size()==1&&m->comparisons[0].rows.empty();
 if(h&&h->scope){auto core=(*d)->instance(h->scope->ref);hp=hp&&core&&core->pathText==st->scope&&h->scope->pathText==core->pathText;}
 if(!im)std::cerr<<"impact: "<<im.error().message<<'\n';if(!h)std::cerr<<"hierarchy: "<<h.error().message<<'\n';if(!m)std::cerr<<"matrix: "<<m.error().message<<'\n';
 auto normal=registerStatistics(**d,q);bool reuse=false;if(normal){auto hh=compareRegisterSourceHierarchy(**d,*normal,r);auto mm=compareRegisterSourceHierarchyMatrix(**d,*normal,r);reuse=hh&&hh->complete&&mm&&mm->complete;}
 unsigned passed=unsigned(ip)+unsigned(hp)+unsigned(mp);
 std::cout<<"{\"planned\":3,\"executed\":3,\"passed\":"<<passed<<",\"failed\":"<<3-passed<<",\"skipped\":0,\"producerOk\":true,\"producerComplete\":false,\"producerInstances\":0,\"impactPartialAccepted\":"<<(ip?"true":"false")<<",\"hierarchyPartialAccepted\":"<<(hp?"true":"false")<<",\"matrixPartialAccepted\":"<<(mp?"true":"false")<<",\"hierarchyBadRequest\":"<<(!h&&h.error().code==hier::ErrorCode::BadRequest?"true":"false")<<",\"matrixBadRequest\":"<<(!m&&m.error().code==hier::ErrorCode::BadRequest?"true":"false")<<",\"normalReuse\":"<<(reuse?"true":"false")<<"}\n";
 return passed==3&&reuse?0:1;
}
