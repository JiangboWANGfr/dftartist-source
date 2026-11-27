#include "ObjectCatalogInternal.h"
#include <iostream>
#include <set>
#include <stdexcept>
namespace {
unsigned checks=0;
void need(bool ok,const char *why) {++checks;if(!ok) throw std::runtime_error(why);}
auto open(const char *top) {
    hier::model::OpenOptions o;o.files={DFT_CATALOG_FIXTURE};o.tops={top};
    auto d=hier::Design::open(o);need(bool(d),"open catalog fixture");return std::move(d.value());
}
}
int main() try {
    using namespace dft::objects;
    auto design=open("catalog_top");CatalogRequest r;r.scope="catalog_top";r.recursive=true;r.limits.pageSize=1;
    auto all=enumerateObjects(*design,r);need(bool(all)&&all->complete,"recursive complete");
    need(all->instances.size()==8&&all->objects.size()==60,"hand-counted eight instances and sixty separate RTL objects");
    std::vector<std::string> names={"catalog_top","left","right","u","u","pair[0]","pair[1]","odd.name"};
    for(size_t i=0;i<names.size();++i) need(all->instances[i].info.name==names[i],"Core child order/BFS");
    std::set<std::string> refs;size_t instances=0,ports=0,signals=0;
    for(const auto &row:all->objects) {
        need(row.instance<all->instances.size()&&row.object.inst==all->instances[row.instance].info.ref,"owned index and occurrence");
        need(refs.insert(row.object.ref).second,"never merge or duplicate contextual refs");
        const auto original=design->object(row.object.ref);
        need(bool(original)&&original->pathText==row.object.pathText&&original->name==row.object.name,"original canonical path and name");
        if(row.kind==Kind::Instance) {++instances;need(!row.port&&!row.signal,"instance metadata in owner dictionary");}
        if(row.kind==Kind::Port) {++ports;need(row.port&&row.port->ref==row.object.ref&&!row.signal,"original port ref");}
        if(row.kind==Kind::Signal) {++signals;need(row.signal&&row.signal->ref==row.object.ref&&!row.port,"original signal ref");}
    }
    need(instances==8&&ports==16&&signals==36,"hand-counted kinds, electrical aliases remain separate");
    auto large=r;large.limits.pageSize=2000;auto again=enumerateObjects(*design,large);
    need(bool(again)&&again->complete&&again->objects.size()==60,"large pages same count");
    for(size_t i=0;i<60;++i) need(again->objects[i].object.ref==all->objects[i].object.ref,"page-size-independent order");
    auto local=r;local.recursive=false;auto one=enumerateObjects(*design,local);
    need(bool(one)&&one->complete&&one->instances.size()==1&&one->objects.size()==11,"nonrecursive scope only");
    auto subtree=r;subtree.scope="catalog_top.g[1].u";auto sub=enumerateObjects(*design,subtree);
    need(bool(sub)&&sub->complete&&sub->instances.size()==1&&sub->objects.size()==7,"generated subtree canonical scope");
    for(const auto &row:sub->objects) if(row.port) need(row.port->width==2,"parameterized port width");
    auto selected=r;selected.text="left";selected.kinds={Kind::Port};auto hits=enumerateObjects(*design,selected);
    need(bool(hits)&&hits->complete&&hits->objects.size()==2&&hits->instances.size()==8,"filter does not prune traversal");
    selected.text="*";need(enumerateObjects(*design,selected)->objects.empty(),"literal star is not glob");
    selected.text="\\escaped.sig ";selected.kinds={Kind::Signal};auto escaped=enumerateObjects(*design,selected);
    need(bool(escaped)&&escaped->complete&&escaped->objects.size()==1,"escaped canonical path filter");
    selected=r;selected.text="no-match";selected.limits.maxObjects=1;auto empty=enumerateObjects(*design,selected);
    need(bool(empty)&&empty->complete&&empty->objects.empty(),"zero matches can complete at small object cap");
    auto exact=r;exact.limits.maxInstances=8;exact.limits.maxObjects=60;exact.limits.maxQueries=all->queries;exact.limits.maxWork=all->work;
    need(enumerateObjects(*design,exact)->complete,"exact budgets complete");
    for(unsigned i=0;i<4;++i) {
        auto cut=r;if(i==0)cut.limits.maxObjects=1;if(i==1)cut.limits.maxInstances=1;if(i==2)cut.limits.maxQueries=3;if(i==3)cut.limits.maxWork=1;
        auto prefix=enumerateObjects(*design,cut);need(bool(prefix)&&!prefix->complete&&!prefix->reasons.empty(),"each budget reports partial");
        for(size_t j=0;j<prefix->objects.size();++j) need(prefix->objects[j].object.ref==all->objects[j].object.ref&&prefix->objects[j].instance<prefix->instances.size(),"complete-row prefix and no orphan owner");
    }
    auto expired=detail::enumerateObjectsWithDeadline(*design,r,{},{});
    need(bool(expired)&&!expired->complete&&expired->queries==3&&expired->work==0&&expired->instances.empty()&&expired->objects.empty()&&expired->scope.pathText==r.scope,"deterministic deadline retains real scope, no fake objects");
    std::stop_source stop;stop.request_stop();auto cancelled=enumerateObjects(*design,{},stop.get_token());
    need(!cancelled&&cancelled.error().code==hier::ErrorCode::Cancelled,"pre-cancel before request validation");
    for(unsigned i=0;i<10;++i) {
        auto bad=r;bad.scope="missing_scope";
        if(i==0)bad.kinds={};if(i==1)bad.kinds={Kind::Port,Kind::Port};if(i==2)bad.kinds={static_cast<Kind>(77)};
        if(i==3)bad.limits.maxInstances=0;if(i==4)bad.limits.maxObjects=1000001;if(i==5)bad.limits.maxQueries=2;
        if(i==6)bad.limits.maxWork=0;if(i==7)bad.limits.maxMillis=60001;if(i==8)bad.limits.pageSize=2001;if(i==9)bad.text="\xed\xa0\x80";
        auto error=enumerateObjects(*design,bad);need(!error&&error.error().code==hier::ErrorCode::BadRequest,"all request sections validated before scope lookup");
    }
    auto bad=r;bad.scope="missing_scope";need(enumerateObjects(*design,bad).error().code==hier::ErrorCode::NotFound,"missing scope NotFound");
    bad.scope="catalog_top.a";need(enumerateObjects(*design,bad).error().code==hier::ErrorCode::BadRequest,"noninstance scope rejected");
    need(enumerateObjects(*design,r)->complete,"Design reusable after errors");
    auto opaque=open("catalog_opaque");r.scope="catalog_opaque";auto blackbox=enumerateObjects(*opaque,r);
    need(bool(blackbox)&&!blackbox->complete&&blackbox->instances.size()==2&&!blackbox->instances[1].objectsComplete&&blackbox->instances[1].signalStatus->status=="partial","unknown internal signals do not become complete empty");
    r.kinds={Kind::Instance,Kind::Port};auto skeleton=enumerateObjects(*opaque,r);
    need(bool(skeleton)&&skeleton->complete&&skeleton->objects.size()==6,"known blackbox occurrence and pin skeleton");
    auto owned=std::move(all.value());design.reset();r={};
    need(owned.objects.size()==60&&!owned.objects.back().object.pathText.empty()&&!owned.snapshot.snapshotId.empty(),"owned results after Design and request release");
    std::cout<<checks<<" object catalog assertions passed\n";return 0;
} catch(const std::exception &e) {std::cerr<<e.what()<<'\n';return 1;}
