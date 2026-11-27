// B real worker tests, DESIGN5.6.4/5.6.8/5.6.9. No fake query/provider.
#include "PrivateTestSupport.h"
#include <algorithm>
#include <atomic>
using namespace b_m4_private;

static_assert(std::is_same_v<decltype(std::declval<SessionState&>().admit(std::declval<Request&&>())),AdmitStatus>);
static_assert(std::is_same_v<decltype(std::declval<SessionState&>().cancel(1)),std::optional<std::stop_source>>);
static_assert(std::is_same_v<decltype(std::declval<SessionState&>().tryPop()),std::optional<Output>>);
static_assert(std::is_constructible_v<SessionWorker,hier::model::OpenOptions>);
static_assert(!std::is_copy_constructible_v<FrameReader>);
static_assert(!std::is_copy_constructible_v<SessionState>);
static_assert(!std::is_copy_constructible_v<SessionWorker>);

namespace {
hier::model::SnapshotInfo opened(SessionWorker& worker) {
    auto value=worker.waitOpened(); REQUIRE(std::holds_alternative<hier::model::SnapshotInfo>(value));
    auto snapshot=std::get<hier::model::SnapshotInfo>(std::move(value));
    CHECK(snapshot.schemaVersion==7); REQUIRE_FALSE(snapshot.tops.empty());
    CHECK(snapshot.tops[0].name=="top_b"); REQUIRE_FALSE(snapshotId(snapshot).empty()); return snapshot;
}
void realRootReply(const Output& output,const hier::model::SnapshotInfo& snapshot,uint64_t id) {
    REQUIRE(std::holds_alternative<Terminal>(output));
    const auto& final=std::get<Terminal>(output); CHECK(final.target==id);
    REQUIRE(std::holds_alternative<ReplyFrame>(final.outcome));
    auto value=decodeFrame(std::get<ReplyFrame>(final.outcome).json);
    REQUIRE(std::holds_alternative<JsonValue::Object>(value));
    const auto& object=std::get<JsonValue::Object>(value);
    // Wire integer identity is numeric, not lexical: DESIGN permits1 and1.0.
    const auto& token=std::get<JsonNumber>(object.at("id").value).token;
    size_t consumed=0; const double numericId=std::stod(token,&consumed);
    CHECK(consumed==token.size()); CHECK(numericId==static_cast<double>(id)); // fixture IDs1/2 are exact
    CHECK(std::get<bool>(object.at("ok").value));
    const auto& items=std::get<JsonValue::Array>(object.at("result").value);
    REQUIRE(items.size()==snapshot.tops.size());
    for(size_t i=0;i<items.size();++i) {
        const auto& item=std::get<JsonValue::Object>(items[i].value);
        CHECK(std::get<std::string>(item.at("ref").value)==snapshot.tops[i].ref);
    }
    const auto& complete=std::get<JsonValue::Object>(object.at("completeness").value);
    CHECK(std::get<std::string>(complete.at("status").value)=="complete");
    CHECK(std::get<JsonValue::Array>(complete.at("reasons").value).empty());
}
}
TEST_CASE("B private OFF or ON worker: opens real RTL queries roots and owns join", "[b-m4-worker]") {
    SessionWorker worker(options());
    REQUIRE_THROWS_AS(worker.waitOpened(),std::logic_error);
    REQUIRE(worker.start()==StartStatus::started);
    CHECK(worker.start()==StartStatus::already_started);
    const auto snapshot=opened(worker);
    auto again=worker.waitOpened(); REQUIRE(std::holds_alternative<hier::model::SnapshotInfo>(again));
    CHECK(snapshotId(std::get<hier::model::SnapshotInfo>(again))==snapshotId(snapshot));
    REQUIRE(worker.state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
    progress(waitOutput(worker.state()),1,0); progress(waitOutput(worker.state()),1,1);
    realRootReply(waitOutput(worker.state()),snapshot,1);
    worker.close(); worker.close(); worker.join(); worker.join();
    CHECK(worker.joined()); CHECK(worker.state().isClosed()); CHECK(worker.start()==StartStatus::closed);
    CHECK_FALSE(worker.state().tryPop().has_value());
}
TEST_CASE("B private worker: close before start is closed not a fabricated opened snapshot", "[b-m4-worker]") {
    SessionWorker worker(options()); worker.close();
    CHECK(worker.start()==StartStatus::closed);
    CHECK(std::holds_alternative<Closed>(worker.waitOpened()));
    CHECK(std::holds_alternative<Closed>(worker.waitOpened())); worker.join();
}
TEST_CASE("B private worker: failed real open returns stable Error and joins", "[b-m4-worker]") {
    auto value=options(); value.files={"/B_M4_NO_SUCH_RTL/nav.sv"};
    SessionWorker worker(std::move(value)); REQUIRE(worker.start()==StartStatus::started);
    const auto first=worker.waitOpened(); REQUIRE(std::holds_alternative<hier::Error>(first));
    REQUIRE_FALSE(std::get<hier::Error>(first).message.empty());
    const auto second=worker.waitOpened(); REQUIRE(std::holds_alternative<hier::Error>(second));
    CHECK(std::get<hier::Error>(second).code==std::get<hier::Error>(first).code);
    CHECK(std::get<hier::Error>(second).message==std::get<hier::Error>(first).message);
    worker.join(); CHECK(worker.joined()); CHECK_FALSE(worker.state().tryPop().has_value());
}

#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
namespace {
class Gate final : public SessionProbe {
  public:
    Gate(SessionPhase phase,uint64_t id):phase_(phase),id_(id) { records_.reserve(2048); }
    void reach(SessionPhase phase,uint64_t id,std::stop_token closing) noexcept override {
        std::unique_lock lock(mutex_);
        if(records_.size()<2048) records_.emplace_back(phase,id); else overflow_=true;
        if(phase!=phase_ || id!=id_ || reached_) return;
        reached_=true; condition_.notify_all();
        const bool released=condition_.wait_for(lock,closing,5s,[&] { return released_; });
        closed_=closing.stop_requested();
        if(!released && !closed_) timedOut_=true;
    }
    bool waitReached() {
        std::unique_lock lock(mutex_);
        return condition_.wait_for(lock,5s,[&] { return reached_; });
    }
    void release() { std::lock_guard lock(mutex_); released_=true; condition_.notify_all(); }
    bool timedOut() { std::lock_guard lock(mutex_); return timedOut_ || overflow_; }
    bool closed() { std::lock_guard lock(mutex_); return closed_; }
    bool saw(SessionPhase phase,uint64_t id) {
        std::lock_guard lock(mutex_);
        return std::find(records_.begin(),records_.end(),std::pair{phase,id})!=records_.end();
    }
  private:
    SessionPhase phase_; uint64_t id_;
    std::mutex mutex_; std::condition_variable_any condition_;
    std::vector<std::pair<SessionPhase,uint64_t>> records_;
    bool reached_=false,released_=false,closed_=false,timedOut_=false,overflow_=false;
};
}
static_assert(std::is_constructible_v<SessionWorker,hier::model::OpenOptions,std::shared_ptr<SessionProbe>>);

TEST_CASE("B private T01: queued head cancelled at before_take is not borrowed into execution", "[b-m4-worker-on]") {
    auto gate=std::make_shared<Gate>(SessionPhase::before_take,1);
    SessionWorker worker(options(),gate); REQUIRE(worker.start()==StartStatus::started);
    const auto snapshot=opened(worker);
    REQUIRE(worker.state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
    REQUIRE(gate->waitReached());
    REQUIRE(worker.state().admit(rootRequest(2,snapshot))==AdmitStatus::accepted);
    CHECK_FALSE(worker.state().cancel(1).has_value());
    terminal(waitOutput(worker.state()),1,true);
    gate->release();
    progress(waitOutput(worker.state()),2,0); progress(waitOutput(worker.state()),2,1);
    realRootReply(waitOutput(worker.state()),snapshot,2);
    worker.close(); worker.join();
    CHECK_FALSE(gate->saw(SessionPhase::before_core,1));
    CHECK(gate->saw(SessionPhase::before_core,2)); CHECK_FALSE(gate->timedOut()); CHECK(worker.joined());
}
TEST_CASE("B private S05 S06: before or after real Core cancel observes intent with token still false", "[b-m4-worker-on]") {
    for(const auto phase:{SessionPhase::before_core,SessionPhase::after_core}) {
        auto gate=std::make_shared<Gate>(phase,1);
        SessionWorker worker(options(),gate); REQUIRE(worker.start()==StartStatus::started);
        const auto snapshot=opened(worker);
        REQUIRE(worker.state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
        REQUIRE(gate->waitReached()); progress(waitOutput(worker.state()),1,0);
        auto action=worker.state().cancel(1); REQUIRE(action.has_value());
        REQUIRE_FALSE(action->stop_requested()); // No request_stop yet: this is the B15 gap.
        gate->release();
        progress(waitOutput(worker.state()),1,1); terminal(waitOutput(worker.state()),1,true);
        action->request_stop();
        worker.close(); worker.join();
        CHECK_FALSE(worker.state().tryPop().has_value()); CHECK_FALSE(gate->timedOut()); CHECK(worker.joined());
    }
}
TEST_CASE("B private real admission: before_take fixes256 and cancelled output must drain for retry", "[b-m4-worker-on]") {
    auto gate=std::make_shared<Gate>(SessionPhase::before_take,1);
    SessionWorker worker(options(),gate); REQUIRE(worker.start()==StartStatus::started);
    const auto snapshot=opened(worker);
    REQUIRE(worker.state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
    REQUIRE(gate->waitReached());
    for(uint64_t id=2;id<=256;++id) REQUIRE(worker.state().admit(rootRequest(id,snapshot))==AdmitStatus::accepted);
    CHECK(worker.state().unsettled()==256);
    auto retry=rootRequest(257,snapshot);
    CHECK(worker.state().admit(std::move(retry))==AdmitStatus::queue_full);
    CHECK(retry.id==257); CHECK(retry.method=="inst.roots"); CHECK(retry.snapshot==snapshotId(snapshot)); CHECK(retry.params.empty());
    CHECK_FALSE(worker.state().cancel(1).has_value()); CHECK(worker.state().unsettled()==255);
    CHECK(worker.state().admit(std::move(retry))==AdmitStatus::backpressured);
    CHECK(retry.method=="inst.roots"); CHECK(retry.snapshot==snapshotId(snapshot));
    terminal(waitOutput(worker.state()),1,true); // no fake start/completion progress
    CHECK(worker.state().admit(std::move(retry))==AdmitStatus::accepted);
    CHECK(worker.state().unsettled()==256);
    worker.close(); worker.join(); CHECK(worker.joined()); CHECK(gate->closed());
    CHECK_FALSE(gate->saw(SessionPhase::before_core,1)); CHECK_FALSE(gate->timedOut());
    CHECK_FALSE(worker.state().tryPop().has_value());
}
TEST_CASE("B private S07: real success submitted before after_terminal late cancel is unchanged", "[b-m4-worker-on]") {
    auto gate=std::make_shared<Gate>(SessionPhase::after_terminal,1);
    SessionWorker worker(options(),gate); REQUIRE(worker.start()==StartStatus::started);
    const auto snapshot=opened(worker);
    REQUIRE(worker.state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
    REQUIRE(gate->waitReached()); CHECK_FALSE(worker.state().cancel(1).has_value());
    progress(waitOutput(worker.state()),1,0); progress(waitOutput(worker.state()),1,1);
    realRootReply(waitOutput(worker.state()),snapshot,1);
    gate->release(); worker.close(); worker.join();
    CHECK_FALSE(worker.state().tryPop().has_value()); CHECK_FALSE(gate->timedOut());
}
TEST_CASE("B private T02 T05: close wakes probe without external owner and preserves join lifetime", "[b-m4-worker-on]") {
    auto strong=std::make_shared<Gate>(SessionPhase::before_core,1);
    std::weak_ptr<Gate> weak=strong;
    auto worker=std::make_unique<SessionWorker>(options(),strong);
    strong.reset(); REQUIRE_FALSE(weak.expired());
    REQUIRE(worker->start()==StartStatus::started); const auto snapshot=opened(*worker);
    REQUIRE(worker->state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
    auto observed=weak.lock(); REQUIRE(observed); REQUIRE(observed->waitReached());
    worker->close(); worker->join(); CHECK(worker->joined());
    CHECK(observed->closed()); CHECK_FALSE(observed->timedOut());
    CHECK_FALSE(worker->state().tryPop().has_value());
    observed.reset(); worker.reset(); CHECK(weak.expired());
}
TEST_CASE("B private T03: failed harness scope releases closing gate via worker destructor", "[b-m4-worker-on]") {
    auto gate=std::make_shared<Gate>(SessionPhase::after_core,1);
    bool caught=false;
    try {
        SessionWorker worker(options(),gate); REQUIRE(worker.start()==StartStatus::started);
        const auto snapshot=opened(worker);
        REQUIRE(worker.state().admit(rootRequest(1,snapshot))==AdmitStatus::accepted);
        REQUIRE(gate->waitReached());
        throw std::runtime_error("B deliberate harness unwinding");
    } catch(const std::runtime_error& error) {
        CHECK(std::string(error.what())=="B deliberate harness unwinding"); caught=true;
    }
    CHECK(caught); CHECK(gate->closed()); CHECK_FALSE(gate->timedOut());
}
#endif
