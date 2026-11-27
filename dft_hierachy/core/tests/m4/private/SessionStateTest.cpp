// B direct tests of the real production State declaration, not a replacement.
#include "PrivateTestSupport.h"
using namespace b_m4_private;

TEST_CASE("B private S01 S02: 256 unsettled includes running and queue_full preserves rejected input", "[b-m4-state]") {
    SessionState state;
    for (uint64_t id=1;id<=256;++id) REQUIRE(state.admit(request(id))==AdmitStatus::accepted);
    CHECK(state.unsettled()==256);
    auto rejected=request(257);
    CHECK(state.admit(std::move(rejected))==AdmitStatus::queue_full); unchanged(rejected,257);
    const auto running=state.take(); REQUIRE(running.has_value()); CHECK(running->request.id==1);
    CHECK(state.unsettled()==256); CHECK_FALSE(state.take().has_value());
    CHECK(state.admit(std::move(rejected))==AdmitStatus::queue_full); unchanged(rejected,257);
    const auto out=drain(state); REQUIRE(out.size()==1); progress(out[0],1,0);
}
TEST_CASE("B private State ownership: admitted request and taken result do not borrow caller buffers", "[b-m4-state]") {
    SessionState state; auto input=request(1);
    REQUIRE(state.admit(std::move(input))==AdmitStatus::accepted);
    input.method="B-mutated"; input.params.clear(); input.snapshot="B-wrong";
    auto running=state.take(); REQUIRE(running.has_value()); unchanged(running->request,1);
    auto candidate=reply(1); const auto expected=candidate.json;
    REQUIRE(state.finish(1,std::move(candidate))==FinishStatus::published);
    candidate.json="B-mutated-reply";
    const auto out=drain(state); REQUIRE(out.size()==3);
    progress(out[0],1,0); progress(out[1],1,1); terminal(out[2],1,false);
    CHECK(std::get<ReplyFrame>(std::get<Terminal>(out[2]).outcome).json==expected);
}
TEST_CASE("B private S03: queued cancel once releases a slot and does not emit progress", "[b-m4-state]") {
    SessionState state;
    for (uint64_t id=1;id<=3;++id) REQUIRE(state.admit(request(id))==AdmitStatus::accepted);
    CHECK_FALSE(state.cancel(2).has_value()); CHECK_FALSE(state.cancel(2).has_value());
    CHECK(state.unsettled()==2); REQUIRE(state.admit(request(4))==AdmitStatus::accepted);
    auto cancelled=drain(state); REQUIRE(cancelled.size()==1); terminal(cancelled[0],2,true);
    for (uint64_t id:{uint64_t{1},uint64_t{3},uint64_t{4}}) {
        auto next=state.take(); REQUIRE(next.has_value()); CHECK(next->request.id==id);
        CHECK(state.finish(id,reply(id))==FinishStatus::published);
        const auto out=drain(state); REQUIRE(out.size()==3);
        progress(out[0],id,0); progress(out[1],id,1); terminal(out[2],id,false);
    }
    CHECK(state.unsettled()==0); CHECK_FALSE(state.take().has_value());
}
TEST_CASE("B private S04: unknown and ended cancel or finish do not emit a second result", "[b-m4-state]") {
    SessionState state; CHECK_FALSE(state.cancel(999).has_value()); CHECK(drain(state).empty());
    REQUIRE(state.admit(request(1))==AdmitStatus::accepted);
    REQUIRE(state.take().has_value());
    CHECK(state.finish(999,reply(999))==FinishStatus::not_running); CHECK(state.unsettled()==1);
    REQUIRE(state.finish(1,reply(1))==FinishStatus::published);
    REQUIRE(drain(state).size()==3);
    CHECK_FALSE(state.cancel(1).has_value()); CHECK(state.finish(1,reply(1))==FinishStatus::not_running);
    CHECK(state.finish(999,reply(999))==FinishStatus::not_running);
    CHECK(drain(state).empty()); CHECK(state.unsettled()==0);
}
TEST_CASE("B private S08: intent before request_stop beats candidate without token already stopped", "[b-m4-state]") {
    SessionState state; REQUIRE(state.admit(request(1))==AdmitStatus::accepted);
    auto running=state.take(); REQUIRE(running.has_value()); CHECK_FALSE(running->cancel.stop_requested());
    auto action=state.cancel(1); REQUIRE(action.has_value());
    CHECK_FALSE(action->stop_requested()); CHECK_FALSE(running->cancel.stop_requested());
    REQUIRE(state.finish(1,reply(1))==FinishStatus::published);
    const auto out=drain(state); REQUIRE(out.size()==3);
    progress(out[0],1,0); progress(out[1],1,1); terminal(out[2],1,true);
    CHECK(state.unsettled()==0);
    action->request_stop(); CHECK(running->cancel.stop_requested());
    CHECK_FALSE(state.cancel(1).has_value()); CHECK(drain(state).empty());
}
TEST_CASE("B private S07: terminal first wins even when late cancellation targets same id", "[b-m4-state]") {
    SessionState state; REQUIRE(state.admit(request(1))==AdmitStatus::accepted);
    auto running=state.take(); REQUIRE(running.has_value());
    CHECK(state.finish(1,reply(1))==FinishStatus::published);
    CHECK_FALSE(state.cancel(1).has_value());
    const auto out=drain(state); REQUIRE(out.size()==3); terminal(out[2],1,false);
    CHECK(state.finish(1,reply(1))==FinishStatus::not_running); CHECK(drain(state).empty());
}
TEST_CASE("B private stop action: request_stop callback can query State without lock reentry", "[b-m4-state]") {
    SessionState state; REQUIRE(state.admit(request(1))==AdmitStatus::accepted);
    auto running=state.take(); REQUIRE(running.has_value());
    size_t seen=0; unsigned calls=0;
    std::stop_callback callback(running->cancel,[&] { seen=state.unsettled(); ++calls; });
    auto action=state.cancel(1); REQUIRE(action.has_value()); CHECK(calls==0);
    CHECK(action->request_stop()); CHECK(calls==1); CHECK(seen==1);
    CHECK(state.finish(1,reply(1))==FinishStatus::published);
    const auto out=drain(state); REQUIRE(out.size()==3); terminal(out[2],1,true);
}
TEST_CASE("B private S09: close discards queue/output stops running and rejects without moving", "[b-m4-state]") {
    SessionState state; REQUIRE(state.admit(request(1))==AdmitStatus::accepted);
    REQUIRE(state.admit(request(2))==AdmitStatus::accepted);
    auto running=state.take(); REQUIRE(running.has_value());
    bool sawClosed=false; unsigned calls=0;
    std::stop_callback callback(running->cancel,[&] { sawClosed=state.isClosed(); ++calls; });
    state.close(); state.close();
    CHECK(state.isClosed()); CHECK(running->cancel.stop_requested()); CHECK(sawClosed); CHECK(calls==1);
    CHECK_FALSE(state.take().has_value()); CHECK_FALSE(state.tryPop().has_value());
    CHECK_FALSE(state.cancel(1).has_value()); CHECK_FALSE(state.cancel(2).has_value());
    CHECK(state.finish(1,reply(1))==FinishStatus::closed);
    auto rejected=request(3); CHECK(state.admit(std::move(rejected))==AdmitStatus::closed); unchanged(rejected,3);
    CHECK_FALSE(state.waitFront({}).has_value()); CHECK_FALSE(state.waitPop({}).has_value());
}
TEST_CASE("B private outputs: progress consumes reservation and slot release alone cannot defeat backpressure", "[b-m4-state]") {
    SessionState state;
    for (uint64_t id=1;id<=256;++id) REQUIRE(state.admit(request(id))==AdmitStatus::accepted);
    REQUIRE(state.take().has_value()); REQUIRE(state.finish(1,reply(1))==FinishStatus::published);
    CHECK(state.unsettled()==255);
    auto retry=request(257);
    CHECK(state.admit(std::move(retry))==AdmitStatus::backpressured); unchanged(retry,257);
    auto item=state.tryPop(); REQUIRE(item.has_value()); progress(*item,1,0);
    CHECK(state.admit(std::move(retry))==AdmitStatus::backpressured); unchanged(retry,257);
    item=state.tryPop(); REQUIRE(item.has_value()); progress(*item,1,1);
    CHECK(state.admit(std::move(retry))==AdmitStatus::backpressured); unchanged(retry,257);
    item=state.tryPop(); REQUIRE(item.has_value()); terminal(*item,1,false);
    CHECK(state.admit(std::move(retry))==AdmitStatus::accepted); CHECK(state.unsettled()==256);
}
TEST_CASE("B private outputs: 768 queued plus reserved records bound retries below256 tasks", "[b-m4-state]") {
    SessionState state;
    for (uint64_t id=1;id<=256;++id) REQUIRE(state.admit(request(id))==AdmitStatus::accepted);
    for (uint64_t id=1;id<=256;++id) CHECK_FALSE(state.cancel(id).has_value());
    CHECK(state.unsettled()==0); // 256 queued Terminal, no reserved records remain.
    for (uint64_t id=257;id<=426;++id) REQUIRE(state.admit(request(id))==AdmitStatus::accepted);
    CHECK(state.unsettled()==170); // 256 + 170*3 = 766.
    auto retry=request(427);
    CHECK(state.admit(std::move(retry))==AdmitStatus::backpressured); unchanged(retry,427);
    const auto item=state.tryPop(); REQUIRE(item.has_value()); terminal(*item,1,true);
    // 255 + 170*3 + 3 = 768. One popped record is exactly sufficient.
    CHECK(state.admit(std::move(retry))==AdmitStatus::accepted); CHECK(state.unsettled()==171);
    auto next=request(428);
    CHECK(state.admit(std::move(next))==AdmitStatus::backpressured); unchanged(next,428);
}
TEST_CASE("B private outputs: start progress replaces its reservation instead of double charging", "[b-m4-state]") {
    SessionState state;
    for (uint64_t id=1;id<=256;++id) REQUIRE(state.admit(request(id))==AdmitStatus::accepted);
    REQUIRE(state.take().has_value()); CHECK_FALSE(state.cancel(2).has_value());
    CHECK(state.unsettled()==255);
    auto retry=request(257);
    CHECK(state.admit(std::move(retry))==AdmitStatus::backpressured); unchanged(retry,257);
    auto item=state.tryPop(); REQUIRE(item.has_value()); progress(*item,1,0);
    // 254 queued tasks*3 + running remaining2 + cancelled terminal1 + new3 =768.
    CHECK(state.admit(std::move(retry))==AdmitStatus::accepted); CHECK(state.unsettled()==256);
}
TEST_CASE("B private wait APIs: stopped token and closing never require a business reply", "[b-m4-state]") {
    SessionState state; std::stop_source stopped; stopped.request_stop();
    CHECK_FALSE(state.waitFront(stopped.get_token()).has_value());
    CHECK_FALSE(state.waitPop(stopped.get_token()).has_value());
    std::promise<void> entered; auto notified=entered.get_future();
    std::promise<bool> completed; auto result=completed.get_future();
    std::jthread waiting([&](std::stop_token token) {
        entered.set_value(); completed.set_value(!state.waitFront(token).has_value());
    });
    REQUIRE(notified.wait_for(5s)==std::future_status::ready);
    state.close(); REQUIRE(result.wait_for(5s)==std::future_status::ready); CHECK(result.get());
}
