#include "ObjectCatalogInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <deque>
#include <set>
#include <type_traits>
#include <utility>

namespace dft::objects {
namespace {
using namespace hier;
using namespace hier::model;
using Time=std::chrono::steady_clock::time_point;
void checkpoint(Cancel c) { if(c.stop_requested()) throw Error{ErrorCode::Cancelled,"Object catalog cancelled"}; }
template<class T> T take(Result<T> r) { if(!r) throw r.error(); return std::move(r.value()); }
class Scan {
    Design &design_;
    ObjectCatalog out_;
    Time deadline_;
    Cancel cancel_;
    bool stopped_=false;
    std::deque<InstInfo> pending_;
    std::set<std::string> instances_;
    void partial(const std::string &reason) {
        out_.complete=false;
        if(std::find(out_.reasons.begin(),out_.reasons.end(),reason)==out_.reasons.end()) out_.reasons.push_back(reason);
    }
    bool stop(const char *reason) { partial(reason);stopped_=true;return false; }
    bool time() {
        checkpoint(cancel_);
        if(stopped_) return false;
        return std::chrono::steady_clock::now()<deadline_ || stop("budget_time");
    }
    bool spend() {
        if(!time()) return false;
        if(out_.work>=out_.request.limits.maxWork) return stop("budget_work");
        ++out_.work;return true;
    }
    template<class F> auto query(F f) {
        using T=std::remove_cvref_t<decltype(f().value())>;
        if(!time()) return std::optional<T>{};
        if(out_.queries>=out_.request.limits.maxQueries) {stop("budget_queries");return std::optional<T>{};}
        if(!spend()) return std::optional<T>{};
        ++out_.queries;auto value=take(f());
        if(!time()) return std::optional<T>{};
        return std::optional<T>{std::move(value)};
    }
    bool wants(Kind k) const { return std::find(out_.request.kinds.begin(),out_.request.kinds.end(),k)!=out_.request.kinds.end(); }
    bool emit(CatalogObject row,const std::string &ref) {
        if(!spend()) return false;
        ++out_.visitedObjects;
        auto object=query([&]{return design_.object(ref,cancel_);});if(!object) return false;
        const auto &owner=out_.instances[row.instance].info;
        if(object->ref!=ref || object->inst!=owner.ref || object->kind!=kindName(row.kind))
            throw Error{ErrorCode::Internal,"Catalog object does not match its original owner/kind"};
        if(object->name.find(out_.request.text)==std::string::npos && object->pathText.find(out_.request.text)==std::string::npos) return true;
        if(out_.objects.size()>=out_.request.limits.maxObjects) return stop("budget_objects");
        row.object=std::move(*object);out_.objects.push_back(std::move(row));return true;
    }
    bool objects(size_t i) {
        const auto &info=out_.instances[i].info;
        if(wants(Kind::Instance) && !emit({Kind::Instance,i,{},{},{}},info.ref)) return false;
        if(wants(Kind::Port)) {
            auto ports=query([&]{return design_.ports(info.ref,cancel_);});if(!ports) return false;
            for(auto &port:*ports) {const auto ref=port.ref;if(!emit({Kind::Port,i,{},std::move(port),{}},ref)) return false;}
        }
        if(wants(Kind::Signal)) {
            if(info.kind==InstKind::Blackbox || info.kind==InstKind::Primitive) {
                out_.instances[i].signalStatus=Completeness{"partial",{{info.kind==InstKind::Blackbox?"blackbox":"unsupported",info.ref,"Internal signals are not modeled"}}};
                partial("opaque_instance");
            } else {
                auto status=query([&]{return design_.connectionStatus(info.ref,cancel_);});if(!status) return false;
                out_.instances[i].signalStatus=std::move(*status);
                if(out_.instances[i].signalStatus->status!="complete") partial("core_signals_partial");
                PageRequest page;page.limit=int(out_.request.limits.pageSize);std::set<std::string> cursors;
                do {
                    auto signals=query([&]{return design_.signals(info.ref,page,{},cancel_);});if(!signals) return false;
                    if(signals->items.size()>size_t(page.limit)) throw Error{ErrorCode::Internal,"Signal page exceeds requested capacity"};
                    for(auto &signal:signals->items) {const auto ref=signal.ref;if(!emit({Kind::Signal,i,{},{},std::move(signal)},ref)) return false;}
                    page.cursor=std::move(signals->next);
                    if(!page.cursor.empty()&&!cursors.insert(page.cursor).second) throw Error{ErrorCode::Internal,"Repeated signal cursor"};
                } while(!page.cursor.empty());
            }
        }
        out_.instances[i].objectsComplete=!out_.instances[i].signalStatus || out_.instances[i].signalStatus->status=="complete";return true;
    }
    bool children(size_t i) {
        const auto &info=out_.instances[i].info;
        if(out_.request.recursive && info.childCount) {
            PageRequest page;std::set<std::string> cursors;
            do {
                const auto capacity=out_.request.limits.maxInstances-out_.instances.size()-pending_.size();
                page.limit=int(std::min(out_.request.limits.pageSize,capacity+1));
                auto children=query([&]{return design_.children(info.ref,page,cancel_);});if(!children) return false;
                if(children->items.size()>size_t(page.limit)) throw Error{ErrorCode::Internal,"Child page exceeds requested capacity"};
                for(auto &child:children->items) {
                    if(out_.instances.size()+pending_.size()>=out_.request.limits.maxInstances) return stop("budget_instances");
                    if(!instances_.insert(child.ref).second) throw Error{ErrorCode::Internal,"Repeated instance occurrence"};
                    pending_.push_back(std::move(child));
                }
                page.cursor=std::move(children->next);
                if(!page.cursor.empty()&&!cursors.insert(page.cursor).second) throw Error{ErrorCode::Internal,"Repeated child cursor"};
            } while(!page.cursor.empty());
        }
        out_.instances[i].childrenComplete=true;return true;
    }
public:
    Scan(Design &d,const CatalogRequest &r,Time deadline,Cancel c):design_(d),deadline_(deadline),cancel_(c) {out_.request=r;}
    ObjectCatalog run() {
        checkpoint(cancel_);++out_.queries;out_.snapshot=take(design_.snapshot(cancel_));
        ++out_.queries;auto resolved=take(design_.resolvePath(out_.request.scope,cancel_));
        if(resolved.completeness.status!="complete") throw Error{ErrorCode::Unsupported,"Scope resolution is incomplete"};
        if(resolved.result.empty()) throw Error{ErrorCode::NotFound,"Scope instance was not found"};
        if(resolved.result.size()!=1) throw Error{ErrorCode::BadRequest,"Scope must resolve to exactly one instance"};
        ++out_.queries;out_.scope=take(design_.instance(resolved.result.front(),cancel_));
        if(!time()) return std::move(out_);
        instances_.insert(out_.scope.ref);pending_.push_back(out_.scope);
        while(!pending_.empty()) {
            if(!spend()) break;
            const size_t i=out_.instances.size();out_.instances.push_back({std::move(pending_.front()),false,false,{}});pending_.pop_front();
            if(!objects(i) || !children(i)) break;
        }
        (void)time();return std::move(out_);
    }
};
Result<ObjectCatalog> execute(Design &d,const CatalogRequest &r,std::optional<Time> end,Cancel c) try {
    checkpoint(c);detail::validateCatalogRequest(r);
    return Scan(d,r,end.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(int64_t(r.limits.maxMillis))),c).run();
} catch(const Error &e) {return e;}
}
std::string_view kindName(Kind k) {
    switch(k) {case Kind::Instance:return "instance";case Kind::Port:return "port";case Kind::Signal:return "signal";}
    return "invalid";
}
void detail::validateCatalogRequest(const CatalogRequest &r) {
    const auto text=[](const std::string &s) {return s.size()<=4096 && s.find('\0')==std::string::npos && dft::detail::validUtf8(s);};
    const auto &l=r.limits;std::set<Kind> seen;
    if(r.scope.empty() || !text(r.scope) || !text(r.text) || r.kinds.empty() || r.kinds.size()>3 ||
       !l.maxInstances || l.maxInstances>100000 || !l.maxObjects || l.maxObjects>1000000 ||
       l.maxQueries<3 || l.maxQueries>1000000 || !l.maxWork || l.maxWork>10000000 ||
       !l.maxMillis || l.maxMillis>60000 || !l.pageSize || l.pageSize>2000)
        throw Error{ErrorCode::BadRequest,"Invalid catalog scope, filter or budget"};
    for(auto k:r.kinds) if(kindName(k)=="invalid" || !seen.insert(k).second)
        throw Error{ErrorCode::BadRequest,"Catalog kinds must be unique instance, port or signal values"};
}
Result<ObjectCatalog> enumerateObjects(Design &d,const CatalogRequest &r,Cancel c) {return execute(d,r,{},c);}
Result<ObjectCatalog> detail::enumerateObjectsWithDeadline(Design &d,const CatalogRequest &r,Time t,Cancel c) {return execute(d,r,t,c);}
}
