#include "SessionContract.h"
#include "Dispatch.h"

#include <condition_variable>
#include <mutex>
#include <stdexcept>
#include <thread>

namespace hier::protocol::session {
struct SessionWorker::Impl {
    model::OpenOptions options;
    SessionState state;
    std::stop_source closing;
    mutable std::mutex lifecycle;
    std::mutex joinMutex;
    std::condition_variable openedChanged;
    std::optional<Opened> opened;
    std::thread thread;
    bool started = false, closed = false, joined = false;
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
    std::shared_ptr<SessionProbe> probe;
    void reach(SessionPhase phase, uint64_t id) {
        if (probe)
            probe->reach(phase, id, closing.get_token());
    }
#endif
    void publish(Opened value) {
        {
            std::lock_guard lock(lifecycle);
            if (!opened)
                opened = closed ? Opened{Closed{}} : std::move(value);
        }
        openedChanged.notify_all();
    }
    void run() {
        try {
            auto openedDesign = Design::open(options);
            if (!openedDesign) {
                publish(openedDesign.error());
                state.close();
                return;
            }
            // The Design is created, queried, and destroyed only on this thread.
            auto design = std::move(openedDesign.value());
            publish(design->snapshot());
            while (const auto front = state.waitFront(closing.get_token())) {
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
                reach(SessionPhase::before_take, *front);
#else
                (void)front;
#endif
                auto task = state.take();
                if (!task)
                    continue;
                const auto id = task->request.id;
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
                reach(SessionPhase::before_core, id);
#endif
                ReplyFrame candidate;
                try {
                    candidate = execute(*design, task->request, task->cancel);
                } catch (const std::exception &e) {
                    candidate = errorReply(id, "internal", e.what());
                }
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
                reach(SessionPhase::after_core, id);
#endif
                const auto finished = state.finish(id, std::move(candidate));
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
                if (finished == FinishStatus::published)
                    reach(SessionPhase::after_terminal, id);
#else
                (void)finished;
#endif
            }
        } catch (const std::exception &e) {
            publish(Error{ErrorCode::Internal, e.what()});
            state.close();
        }
    }
};

SessionWorker::SessionWorker(model::OpenOptions options
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
                             ,
                             std::shared_ptr<SessionProbe> probe
#endif
                             )
    : impl_(std::make_unique<Impl>()) {
    impl_->options = std::move(options);
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
    impl_->probe = std::move(probe);
#endif
}
SessionWorker::~SessionWorker() {
    close();
    join();
}
StartStatus SessionWorker::start() {
    std::lock_guard lock(impl_->lifecycle);
    if (impl_->closed)
        return StartStatus::closed;
    if (impl_->started)
        return StartStatus::already_started;
    impl_->thread = std::thread([this] { impl_->run(); });
    impl_->started = true;
    return StartStatus::started;
}
Opened SessionWorker::waitOpened() {
    std::unique_lock lock(impl_->lifecycle);
    if (!impl_->started && !impl_->closed)
        throw std::logic_error("worker has not started");
    impl_->openedChanged.wait(lock, [&] { return impl_->opened.has_value(); });
    return *impl_->opened;
}
SessionState &SessionWorker::state() noexcept { return impl_->state; }
void SessionWorker::close() {
    {
        std::lock_guard lock(impl_->lifecycle);
        impl_->closed = true;
        if (!impl_->opened)
            impl_->opened = Closed{};
    }
    impl_->openedChanged.notify_all();
    impl_->closing.request_stop();
    impl_->state.close();
}
void SessionWorker::join() {
    std::lock_guard joinLock(impl_->joinMutex);
    // start holds lifecycle while installing the thread. Never hold it for join.
    {
        std::lock_guard lock(impl_->lifecycle);
        if (!impl_->started)
            return;
    }
    if (impl_->thread.joinable())
        impl_->thread.join();
    std::lock_guard lock(impl_->lifecycle);
    impl_->joined = true;
}
bool SessionWorker::joined() const {
    std::lock_guard lock(impl_->lifecycle);
    return impl_->joined;
}
} // namespace hier::protocol::session
