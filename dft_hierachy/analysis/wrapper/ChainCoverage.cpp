#include "ChainCoverageInternal.h"
#include <map>
namespace dft::wrapper {
namespace {
using namespace hier;
using Clock=std::chrono::steady_clock;
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper coverage cancelled"};}
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void validate(const ChainCoverageRequest &r,Cancel c) {
    cancelled(c);take(validateChainPlanRequest(r.chains,c));const auto &l=r.limits;
    if(!l.maxRows || l.maxRows>100000 || !l.maxPositions || l.maxPositions>100000 || !l.maxWork || l.maxWork>10000000 || !l.maxMillis || l.maxMillis>60000)
        throw Error{ErrorCode::BadRequest,"Wrapper coverage limit out of range"};
}
uint64_t add(uint64_t a,uint64_t b) {
    constexpr uint64_t safe=9007199254740991ULL;
    if(a>safe || b>safe-a)throw Error{ErrorCode::BadRequest,"Wrapper coverage range exceeds safe integer range"};return a+b;
}
struct Stop {std::string reason;};
class Inspector {
    const ChainPlanReport &source_; // Borrowed only until run() returns.
    ChainCoverage out_;
    Clock::time_point deadline_;
    Cancel cancel_;
    std::vector<std::optional<size_t>> cells_,chains_;
    std::map<std::pair<size_t,bool>,size_t> ports_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work==out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    void count(ChainCoverageCounts &c,const ChainCoverageRow &r) {
        ++c.rows;c.positions+=r.positions.size();
        if(r.status=="placed")++c.placed;else if(r.status=="excluded")++c.excluded;
        else if(r.status=="blocked")++c.blocked;else ++c.pending;
    }
    ChainCoverageRow row(size_t index) {
        tick();ChainCoverageRow r;r.sourceRow=index;r.cellRow=cells_[index];r.stage="planning";
        if(!r.cellRow){r.status="pending";r.reason="planning_not_reached";return r;}
        const auto &cell=source_.source.plan.rows[*r.cellRow];r.chainRow=chains_[*r.cellRow];
        if(cell.decision=="excluded" || cell.decision=="blocked"){r.status=cell.decision;r.reason=cell.reason;return r;}
        r.stage="chaining";
        if(!r.chainRow){r.status="pending";r.reason="chain_not_reached";return r;}
        const auto &chainRow=source_.layout.rows[*r.chainRow];r.status=chainRow.status;r.reason=chainRow.reason;
        if(r.status!="placed")return r;
        const auto chain=*chainRow.chain;const auto &segments=source_.layout.chains.at(chain).segments;
        for(size_t u=0;u<chainRow.uses.size();++u) {
            checkpoint();if(out_.counts.positions+r.positions.size()==out_.limits.maxPositions)throw Stop{"budget_positions"};tick();
            const auto &use=chainRow.uses[u];const auto &s=segments.at(use.segment);CoveragePosition p;
            p.use=u;p.chain=chain;p.segment=use.segment;p.kind=s.kind;p.chainOffset=add(s.offset,use.offset);p.width=use.width;
            add(p.chainOffset,p.width);
            if(s.kind=="shared") {p.signal=s.signal;p.bits=model::BitRange{add(s.bits->lsb,use.offset),use.width};add(p.bits->lsb,p.bits->width);}
            r.positions.push_back(std::move(p));
        }
        return r;
    }
    void commit(ChainCoverageRow r) {
        const auto &b=source_.source.source.rows[r.sourceRow];const auto key=std::make_pair(b.port,b.upstream);
        checkpoint();auto it=ports_.find(key);
        if(it==ports_.end()){it=ports_.emplace(key,out_.ports.size()).first;out_.ports.push_back({b.port,b.upstream,{}});}
        count(out_.ports[it->second].counts,r);count(out_.counts,r);out_.rows.push_back(std::move(r));
    }
  public:
    Inspector(const ChainPlanReport &source,const ChainCoverageLimits &limits,Clock::time_point deadline,Cancel c)
        :source_(source),deadline_(deadline),cancel_(c) {
        out_.limits=limits;if(!source.layout.complete){out_.complete=false;out_.reasons.push_back("source_partial");}
    }
    ChainCoverage run() {
        size_t at=0;
        try {
            checkpoint();cells_.resize(source_.source.source.rows.size());chains_.resize(source_.source.plan.rows.size());
            for(size_t i=0;i<source_.source.plan.rows.size();++i){checkpoint();cells_.at(source_.source.plan.rows[i].sourceRow)=i;}
            for(size_t i=0;i<source_.layout.rows.size();++i){checkpoint();chains_.at(source_.layout.rows[i].sourceRow)=i;}
            for(;at<cells_.size();++at){checkpoint();if(out_.rows.size()==out_.limits.maxRows)throw Stop{"budget_rows"};commit(row(at));}
            checkpoint();
        }catch(const Stop &s){out_.complete=false;out_.reasons.push_back(s.reason);out_.stop=ChainCoverageStop{s.reason,at};}
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainCoverageReport> execute(Design &d,const ChainCoverageRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try {
    validate(r,c);auto source=take(planWrapperChains(d,r.chains,c));
    auto coverage=Inspector(source,r.limits,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();
    return ChainCoverageReport{std::move(source),std::move(coverage)};
}catch(const Error &e){return e;}
}
hier::Result<bool> validateChainCoverageRequest(const ChainCoverageRequest &r,hier::Cancel c)try{validate(r,c);return true;}catch(const hier::Error &e){return e;}
hier::Result<ChainCoverageReport> inspectWrapperCoverage(hier::Design &d,const ChainCoverageRequest &r,hier::Cancel c){return execute(d,r,c);}
namespace detail {
hier::Result<ChainCoverageReport> inspectWrapperCoverageWithDeadline(hier::Design &d,const ChainCoverageRequest &r,Clock::time_point deadline,hier::Cancel c){return execute(d,r,c,deadline);}
}
}
