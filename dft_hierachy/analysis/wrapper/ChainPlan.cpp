#include "ChainPlanInternal.h"
#include "../common/Utf8.h"
#include <algorithm>
#include <map>
#include <set>
namespace dft::wrapper {
namespace {
using namespace hier;
using namespace hier::model;
constexpr uint64_t safe=9007199254740991ULL;
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper chain planning cancelled"};}
void bad(const char *message){throw Error{ErrorCode::BadRequest,message};}
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
uint64_t add(uint64_t a,uint64_t b){if(a>safe || b>safe-a)bad("Wrapper chain count exceeds safe integer range");return a+b;}
void validate(const ChainPlanRequest &r,Cancel c) {
    cancelled(c);take(validateCellPlanRequest(r.cells,c));
    if(r.chains.empty() || r.chains.size()>1024)bad("Declare 1..1024 wrapper chains");
    if(r.assignments.size()>10000)bad("Too many chain assignments");
    if(!r.limits.maxRows || r.limits.maxRows>100000 || !r.limits.maxSegments || r.limits.maxSegments>100000 || !r.limits.maxWork || r.limits.maxWork>10000000 || !r.limits.maxMillis || r.limits.maxMillis>60000)bad("Chain planning limit out of range");
    size_t bytes=0;std::set<std::string> names;
    const auto name=[&](const std::string &s){cancelled(c);bytes+=s.size();if(s.empty() || s.size()>4096 || bytes>1024*1024 || s.find('\0')!=std::string::npos || !dft::detail::validUtf8(s))bad("Invalid chain name or port");};
    for(const auto &chain:r.chains){name(chain.name);if(!names.insert(chain.name).second)bad("Duplicate chain name");if(!chain.capacity || chain.capacity>safe)bad("Chain capacity must be a positive safe integer");}
    const auto reference=[&](const std::string &s){name(s);if(!names.contains(s))bad("Unknown chain reference");};
    if(r.defaultChain)reference(*r.defaultChain);
    // Reuse the published direction/bit-range overlap validation; no Design access here.
    CellPlanRequest selectors;selectors.boundary=r.cells.boundary;
    for(const auto &a:r.assignments){name(a.port);reference(a.chain);selectors.rules.push_back({a.port,a.direction,CellAction::Share,a.bits});}
    take(validateCellPlanRequest(selectors,c));cancelled(c);
}
struct Stop {std::string reason;};
struct Owner {uint64_t end=0;size_t chain=0,segment=0;};
struct PendingOwner {std::string signal;uint64_t start=0;Owner owner;};
class Organizer {
    const BoundaryReport &source_;
    const CellPlan &plan_;
    ChainLayout out_;
    Cancel cancel_;
    std::chrono::steady_clock::time_point deadline_;
    std::map<std::string,size_t> names_;
    std::map<std::string,std::vector<size_t>> assignments_;
    std::map<std::string,std::map<uint64_t,Owner>> owners_;
    std::vector<bool> used_;
    uint64_t segments_=0;
    void checkpoint(){cancelled(cancel_);if(std::chrono::steady_clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work==out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void partial(const std::string &s){out_.complete=false;if(std::find(out_.reasons.begin(),out_.reasons.end(),s)==out_.reasons.end())out_.reasons.push_back(s);}
    void process(size_t index) {
        tick();ChainRow row;row.sourceRow=index;const auto &cell=plan_.rows[index];
        const auto &boundary=source_.rows.at(cell.sourceRow);const auto &port=source_.ports.at(boundary.port);
        if(auto it=assignments_.find(port.name);it!=assignments_.end())for(auto i:it->second) {
            tick();const auto &a=out_.assignments[i];
            if(a.direction!=CellDirection::Both && boundary.upstream!=(a.direction==CellDirection::Output))continue;
            if(a.bits && (boundary.bit<a.bits->lsb || boundary.bit-a.bits->lsb>=a.bits->width))continue;
            row.assignment=i;row.chain=names_.at(a.chain);break;
        }
        if(!row.chain && out_.defaultChain)row.chain=names_.at(*out_.defaultChain);
        std::vector<ChainSegment> pending;std::vector<PendingOwner> ownership;
        const auto block=[&](const char *why){row.status="blocked";row.reason=why;row.newBits=row.reusedBits=0;row.uses.clear();pending.clear();ownership.clear();};
        const auto append=[&](ChainSegment segment){
            if(segments_+pending.size()==out_.limits.maxSegments)throw Stop{"budget_segments"};
            segment.offset=add(out_.chains[*row.chain].length,row.newBits);segment.sourceRow=index;
            const auto segmentIndex=out_.chains[*row.chain].segments.size()+pending.size();
            row.uses.push_back({segmentIndex,0,segment.length});row.newBits=add(row.newBits,segment.length);
            if(segment.signal)ownership.push_back({*segment.signal,segment.bits->lsb,{add(segment.bits->lsb,segment.bits->width),*row.chain,segmentIndex}});
            pending.push_back(std::move(segment));
        };
        if(cell.decision=="excluded"){row.status="excluded";row.reason="excluded";}
        else if(cell.decision=="blocked")block("source_blocked");
        else if(!row.chain)block("unassigned");
        else {
            row.status="placed";row.reason="allocated";
            if(cell.decision=="dedicated") {tick();ChainSegment s;s.kind="dedicated";s.length=1;append(std::move(s));}
            else {
                for(const auto &candidate:cell.candidates) {
                    const auto found=owners_.find(candidate.signal);
                    const std::map<uint64_t,Owner> empty;
                    const auto &intervals=found==owners_.end()?empty:found->second;
                    for(const auto &range:candidate.ranges) {
                        tick();uint64_t pos=range.lsb;const auto end=add(range.lsb,range.width);auto it=intervals.lower_bound(pos);
                        if(it!=intervals.begin()){auto previous=std::prev(it);if(previous->second.end>pos)it=previous;}
                        while(pos<end) {
                            tick();
                            if(it!=intervals.end() && it->first<=pos) {
                                const auto &owner=it->second;
                                if(owner.chain!=*row.chain){block("chain_conflict");break;}
                                const auto width=std::min(end,owner.end)-pos;
                                row.uses.push_back({owner.segment,pos-it->first,width});row.reusedBits=add(row.reusedBits,width);pos+=width;
                                if(pos==owner.end)++it;
                            } else {
                                const auto next=it==intervals.end()?end:std::min(end,it->first);
                                ChainSegment s;s.kind="shared";s.length=next-pos;s.signal=candidate.signal;s.bits=BitRange{pos,next-pos};append(std::move(s));pos=next;
                            }
                        }
                        if(row.status=="blocked")break;
                    }
                    if(row.status=="blocked")break;
                }
            }
            if(row.status=="placed" && row.newBits>out_.chains[*row.chain].capacity-out_.chains[*row.chain].length)block("capacity");
        }
        // No externally visible rows, rule use, chain positions or ownership until this point.
        checkpoint();auto counts=out_.counts;++counts.rows;
        if(row.status=="placed") {
            ++counts.placed;counts.reusedBits=add(counts.reusedBits,row.reusedBits);counts.totalBits=add(counts.totalBits,row.newBits);
            for(const auto &s:pending)if(s.kind=="dedicated")counts.dedicatedBits=add(counts.dedicatedBits,s.length);else counts.sharedBits=add(counts.sharedBits,s.length);
            auto &chain=out_.chains[*row.chain];chain.length=add(chain.length,row.newBits);segments_+=pending.size();
            for(auto &s:pending)chain.segments.push_back(std::move(s));
            for(auto &p:ownership)owners_[p.signal].emplace(p.start,p.owner);
        } else if(row.status=="excluded")++counts.excluded;
        else {++counts.blocked;partial("blocked_row");}
        if(row.assignment)used_[*row.assignment]=true;
        out_.counts=counts;out_.rows.push_back(std::move(row));
    }
  public:
    Organizer(const BoundaryReport &source,const CellPlan &plan,const ChainPlanRequest &r,std::chrono::steady_clock::time_point deadline,Cancel c)
        :source_(source),plan_(plan),cancel_(c),deadline_(deadline),used_(r.assignments.size(),false) {
        out_.assignments=r.assignments;out_.defaultChain=r.defaultChain;out_.limits=r.limits;
        for(const auto &chain:r.chains)out_.chains.push_back({chain.name,chain.capacity,0,{}});
        if(!plan.complete)partial("source_partial");
    }
    ChainLayout run() {
        // Semantic range errors take precedence over the runtime planning deadline.
        std::map<std::string,uint64_t> widths;
        for(const auto &p:source_.ports){cancelled(cancel_);widths.emplace(p.name,p.width);}
        for(const auto &a:out_.assignments){cancelled(cancel_);auto it=widths.find(a.port);if(a.bits && it!=widths.end() && add(a.bits->lsb,a.bits->width)>it->second)bad("Chain assignment exceeds selected port width");}
        size_t at=0;
        try {
            checkpoint();for(size_t i=0;i<out_.chains.size();++i){checkpoint();names_.emplace(out_.chains[i].name,i);}
            for(size_t i=0;i<out_.assignments.size();++i){checkpoint();assignments_[out_.assignments[i].port].push_back(i);}
            for(;at<plan_.rows.size();++at){checkpoint();if(out_.rows.size()==out_.limits.maxRows)throw Stop{"budget_rows"};process(at);}
        }catch(const Stop &s){partial(s.reason);out_.stop=ChainStop{s.reason,at};}
        for(size_t i=0;i<used_.size();++i){cancelled(cancel_);if(!used_[i])out_.unusedAssignments.push_back(i);}
        if(!out_.unusedAssignments.empty())partial("unused_assignment");
        if(!out_.stop && std::chrono::steady_clock::now()>=deadline_){partial("budget_time");out_.stop=ChainStop{"budget_time",at};}
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainPlanReport> execute(Design &d,const ChainPlanRequest &r,Cancel c,std::optional<std::chrono::steady_clock::time_point> deadline={})try {
    validate(r,c);auto source=take(planWrapperCells(d,r.cells,c));
    auto layout=detail::organizeChainsFromCells(source.source,source.plan,r,deadline.value_or(std::chrono::steady_clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c);
    return ChainPlanReport{std::move(source),std::move(layout)};
}catch(const Error &e){return e;}
}
hier::Result<bool> validateChainPlanRequest(const ChainPlanRequest &r,hier::Cancel c)try{validate(r,c);return true;}catch(const hier::Error &e){return e;}
hier::Result<ChainPlanReport> planWrapperChains(hier::Design &d,const ChainPlanRequest &r,hier::Cancel c){return execute(d,r,c);}
namespace detail {
ChainLayout organizeChainsFromCells(const BoundaryReport &source,const CellPlan &plan,const ChainPlanRequest &r,std::chrono::steady_clock::time_point deadline,Cancel c){return Organizer(source,plan,r,deadline,c).run();}
hier::Result<ChainPlanReport> planWrapperChainsWithDeadline(hier::Design &d,const ChainPlanRequest &r,std::chrono::steady_clock::time_point deadline,hier::Cancel c){return execute(d,r,c,deadline);}
}
}
