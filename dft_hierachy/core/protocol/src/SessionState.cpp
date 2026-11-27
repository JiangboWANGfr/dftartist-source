#include "SessionContract.h"

#include <algorithm>
#include <condition_variable>
#include <deque>
#include <mutex>

namespace hier::protocol::session {

struct SessionState::Impl {
    struct Running {
        uint64_t id;
        std::stop_source stop;
        bool cancelled = false;
    };
    mutable std::mutex mutex;
    std::condition_variable_any changed;
    std::deque<Request> queued;
    std::optional<Running> running;
    std::deque<Output> output;
    size_t reserved = 0;
    bool closed = false;

    size_t unsettled() const { return queued.size() + (running ? 1u : 0u); }
};

SessionState::SessionState() : impl_(std::make_unique<Impl>()) {}
SessionState::~SessionState() { close(); }

AdmitStatus SessionState::admit(Request &&request) {
    auto &s = *impl_;
    {
        std::lock_guard lock(s.mutex);
        if (s.closed)
            return AdmitStatus::closed;
        if (s.unsettled() == 256)
            return AdmitStatus::queue_full;
        if (s.output.size() + s.reserved + 3 > 768)
            return AdmitStatus::backpressured;
        s.queued.push_back(std::move(request));
        s.reserved += 3;
    }
    s.changed.notify_all();
    return AdmitStatus::accepted;
}

std::optional<uint64_t> SessionState::waitFront(std::stop_token closing) {
    auto &s = *impl_;
    std::unique_lock lock(s.mutex);
    s.changed.wait(lock, closing, [&] { return s.closed || (!s.running && !s.queued.empty()); });
    if (s.closed || closing.stop_requested())
        return {};
    return s.queued.front().id;
}

std::optional<RunningTask> SessionState::take() {
    auto &s = *impl_;
    std::unique_lock lock(s.mutex);
    if (s.closed || s.running || s.queued.empty())
        return {};
    const auto id = s.queued.front().id;
    s.running.emplace(Impl::Running{id, {}, false});
    s.output.emplace_back(Progress{id, 0, 1});
    --s.reserved;
    RunningTask task{std::move(s.queued.front()), s.running->stop.get_token()};
    s.queued.pop_front();
    lock.unlock();
    s.changed.notify_all();
    return task;
}

std::optional<std::stop_source> SessionState::cancel(uint64_t target) {
    auto &s = *impl_;
    std::unique_lock lock(s.mutex);
    if (s.closed)
        return {};
    if (s.running && s.running->id == target) {
        s.running->cancelled = true;
        return s.running->stop;
    }
    const auto found = std::find_if(s.queued.begin(), s.queued.end(),
                                    [target](const Request &r) { return r.id == target; });
    if (found == s.queued.end())
        return {};
    s.output.emplace_back(Terminal{target, Cancelled{}});
    s.queued.erase(found);
    s.reserved -= 3;
    lock.unlock();
    s.changed.notify_all();
    return {};
}

FinishStatus SessionState::finish(uint64_t target, ReplyFrame candidate) {
    auto &s = *impl_;
    {
        std::lock_guard lock(s.mutex);
        if (s.closed)
            return FinishStatus::closed;
        if (!s.running || s.running->id != target)
            return FinishStatus::not_running;
        Terminal terminal{target, std::move(candidate)};
        if (s.running->cancelled || s.running->stop.stop_requested())
            terminal.outcome = Cancelled{};
        s.output.emplace_back(Progress{target, 1, 1});
        s.output.emplace_back(std::move(terminal));
        s.reserved -= 2;
        s.running.reset();
    }
    s.changed.notify_all();
    return FinishStatus::published;
}

std::optional<Output> SessionState::tryPop() {
    auto &s = *impl_;
    std::lock_guard lock(s.mutex);
    if (s.closed || s.output.empty())
        return {};
    auto result = std::move(s.output.front());
    s.output.pop_front();
    return result;
}

std::optional<Output> SessionState::waitPop(std::stop_token closing) {
    auto &s = *impl_;
    std::unique_lock lock(s.mutex);
    s.changed.wait(lock, closing, [&] { return s.closed || !s.output.empty(); });
    if (s.closed || closing.stop_requested())
        return {};
    auto result = std::move(s.output.front());
    s.output.pop_front();
    return result;
}

void SessionState::close() {
    auto &s = *impl_;
    std::optional<std::stop_source> stop;
    {
        std::lock_guard lock(s.mutex);
        if (s.closed)
            return;
        s.closed = true;
        if (s.running) {
            s.running->cancelled = true;
            stop = s.running->stop;
        }
        s.queued.clear();
        s.output.clear();
        s.reserved = 0;
    }
    s.changed.notify_all();
    if (stop)
        stop->request_stop();
}

bool SessionState::isClosed() const {
    std::lock_guard lock(impl_->mutex);
    return impl_->closed;
}

size_t SessionState::unsettled() const {
    std::lock_guard lock(impl_->mutex);
    return impl_->unsettled();
}

} // namespace hier::protocol::session
