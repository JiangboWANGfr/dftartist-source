#include "ChainActivityScheduleInternal.h"
namespace dft::wrapper {
namespace {
using namespace hier;using Clock=std::chrono::steady_clock;constexpr uint64_t Safe=9007199254740991ULL;
template<class T>T take(Result<T> r){if(!r)throw r.error();return std::move(r.value());}
void cancelled(Cancel c){if(c.stop_requested())throw Error{ErrorCode::Cancelled,"Wrapper activity scheduling cancelled"};}
[[noreturn]]void bad(const char *s){throw Error{ErrorCode::BadRequest,s};}
struct Timing {uint64_t period=0,duration=0;};
Timing validate(const ChainActivityScheduleRequest &r,Cancel c){
    cancelled(c);take(validateChainActivityPlanRequest(r.activity,c));const auto &p=r.pulse;const auto &l=r.limits;
    if(p.setupTicks>Safe||!p.highTicks||p.highTicks>Safe||!p.lowTicks||p.lowTicks>Safe||!p.pulses||p.pulses>Safe)bad("Wrapper pulse parameter out of range");
    if(p.highTicks>Safe-p.lowTicks)bad("Wrapper pulse period exceeds safe integer range");
    const auto period=p.highTicks+p.lowTicks;
    if(p.pulses>(Safe-p.setupTicks)/period)bad("Wrapper pulse duration exceeds safe integer range");
    if(!l.maxRows||l.maxRows>1024||!l.maxTicks||l.maxTicks>Safe||!l.maxWork||l.maxWork>10000000||!l.maxMillis||l.maxMillis>60000)bad("Wrapper schedule limit out of range");
    return {period,p.setupTicks+p.pulses*period};
}
struct Stop {std::string reason;};
class Scheduler {
    const ChainActivityPlanReport &source_; // Borrowed synchronously; never stored outside run().
    ChainActivitySchedule out_;Clock::time_point deadline_;Cancel cancel_;
    void checkpoint(){cancelled(cancel_);if(Clock::now()>=deadline_)throw Stop{"budget_time"};}
    void tick(){checkpoint();if(out_.work==out_.limits.maxWork)throw Stop{"budget_work"};++out_.work;}
    ChainActivityScheduleRow row(size_t index){
        tick();const auto &batch=source_.activity.batches[index];ChainActivityScheduleRow r;r.batch=index;r.clockGroup=batch.clockGroup;
        const auto &clock=source_.source.source.source.clocks.groups.at(batch.clockGroup);
        if(clock.edge!="posedge"&&clock.edge!="negedge")throw Error{ErrorCode::Internal,"Invalid Wrapper activity clock edge"};
        r.idleHigh=clock.edge=="negedge";r.activeHigh=!r.idleHigh;
        r.activeTicks=r.activeHigh?out_.pulse.highTicks:out_.pulse.lowTicks;r.idleTicks=r.idleHigh?out_.pulse.highTicks:out_.pulse.lowTicks;
        r.start=out_.counts.elapsedTicks;r.end=r.start+out_.batchTicks;r.firstEdge=r.start+out_.pulse.setupTicks;
        r.lastEdge=r.firstEdge+(out_.pulse.pulses-1)*out_.periodTicks;r.lastReturn=r.lastEdge+r.activeTicks;
        for(auto chain:batch.chains){tick();(void)chain;}
        for(const auto &h:batch.holds){tick();if(h.low==h.high)throw Error{ErrorCode::Internal,"Invalid Wrapper activity hold"};r.holds.push_back({h.input,h.high});}
        return r;
    }
public:
    Scheduler(const ChainActivityPlanReport &s,const ChainActivityScheduleRequest &r,Timing t,Clock::time_point deadline,Cancel c)
        :source_(s),deadline_(deadline),cancel_(c){out_.pulse=r.pulse;out_.periodTicks=t.period;out_.batchTicks=t.duration;out_.limits=r.limits;if(!s.activity.complete){out_.complete=false;out_.reasons.push_back("source_partial");}}
    ChainActivitySchedule run(){
        size_t index=0;
        try {
            for(;index<source_.activity.batches.size();++index){
                checkpoint();if(out_.rows.size()==out_.limits.maxRows)throw Stop{"budget_rows"};
                if(out_.batchTicks>out_.limits.maxTicks-out_.counts.elapsedTicks)throw Stop{"budget_ticks"};
                auto r=row(index);checkpoint();const auto &b=source_.activity.batches[index];
                auto &c=out_.counts;++c.batches;c.chains+=b.chains.size();c.sharedBits+=b.sharedBits;c.elapsedTicks=r.end;
                out_.rows.push_back(std::move(r));
            }
            checkpoint();
        }catch(const Stop &s){out_.complete=false;out_.reasons.push_back(s.reason);out_.stop=ChainActivityScheduleStop{s.reason,index};}
        cancelled(cancel_);return std::move(out_);
    }
};
Result<ChainActivityScheduleReport> execute(Design &d,const ChainActivityScheduleRequest &r,Cancel c,std::optional<Clock::time_point> deadline={})try{
    auto timing=validate(r,c);auto source=take(planWrapperChainActivity(d,r.activity,c));
    auto schedule=Scheduler(source,r,timing,deadline.value_or(Clock::now()+std::chrono::milliseconds(r.limits.maxMillis)),c).run();
    return ChainActivityScheduleReport{std::move(source),std::move(schedule)};
}catch(const Error &e){return e;}
}
Result<bool> validateChainActivityScheduleRequest(const ChainActivityScheduleRequest &r,Cancel c)try{validate(r,c);return true;}catch(const Error &e){return e;}
Result<ChainActivityScheduleReport> scheduleWrapperChainActivity(Design &d,const ChainActivityScheduleRequest &r,Cancel c){return execute(d,r,c);}
namespace detail {
Result<ChainActivityScheduleReport> scheduleWrapperChainActivityWithDeadline(Design &d,const ChainActivityScheduleRequest &r,Clock::time_point deadline,Cancel c){return execute(d,r,c,deadline);}
}
}
