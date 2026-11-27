#include "hier/protocol/Serve.h"
#include "hier/protocol/Json.h"
#include "Dispatch.h"
#include "SchemaPrimitives.h"
#include "WireSchema.h"

#include <array>
#include <cerrno>
#include <csignal>
#include <cstdio>
#include <fcntl.h>
#include <poll.h>
#include <system_error>
#include <unistd.h>

namespace hier::protocol {
namespace {
using namespace session;
#if defined(POLLRDHUP)
// Linux sockets report a peer write-half close separately from full POLLHUP.
constexpr short inputEvents = POLLIN | POLLRDHUP;
constexpr short inputEnded = POLLHUP | POLLRDHUP;
#else
constexpr short inputEvents = POLLIN;
constexpr short inputEnded = POLLHUP;
#endif

class Nonblocking {
  public:
    explicit Nonblocking(int fd) : fd_(fd), original_(::fcntl(fd, F_GETFL)) {
        if (original_ < 0 || ::fcntl(fd_, F_SETFL, original_ | O_NONBLOCK) < 0)
            throw std::system_error(errno, std::generic_category(), "stdio nonblocking setup");
    }
    ~Nonblocking() { (void)::fcntl(fd_, F_SETFL, original_); }
    Nonblocking(const Nonblocking &) = delete;
    Nonblocking &operator=(const Nonblocking &) = delete;

  private:
    int fd_, original_;
};
class IgnorePipeSignal {
  public:
    IgnorePipeSignal() {
        struct sigaction action{};
        action.sa_handler = SIG_IGN;
        (void)sigemptyset(&action.sa_mask);
        if (::sigaction(SIGPIPE, &action, &original_) != 0)
            throw std::system_error(errno, std::generic_category(), "SIGPIPE setup");
    }
    ~IgnorePipeSignal() { (void)::sigaction(SIGPIPE, &original_, nullptr); }

  private:
    struct sigaction original_{};
};

std::string encode(Output output) {
    if (const auto progress = std::get_if<Progress>(&output)) {
        JsonWriter w(true);
        w.beginObject().key("event").value("progress").key("target").value(progress->target);
        w.key("done").value(progress->done).key("total").value(progress->total).endObject();
        return w.str() + '\n';
    }
    auto &terminal = std::get<Terminal>(output);
    if (const auto frame = std::get_if<ReplyFrame>(&terminal.outcome))
        return std::move(frame->json) + '\n';
    return errorReply(terminal.target, "cancelled", "query cancelled").json + '\n';
}

class StdioSession {
  public:
    explicit StdioSession(SessionWorker &worker, model::SnapshotInfo snapshot)
        : worker_(worker), snapshot_(std::move(snapshot)) {}
    int run() {
        Nonblocking input(STDIN_FILENO), output(STDOUT_FILENO);
        IgnorePipeSignal ignored;
        JsonWriter hello(true);
        hello.beginObject()
            .key("event")
            .value("hello")
            .key("protocol")
            .value(kProtocolVersion)
            .key("snapshot");
        write(hello, snapshot_);
        hello.key("capabilities")
            .beginArray()
            .value("cancel")
            .value("progress")
            .endArray()
            .endObject();
        pending_ = hello.str() + '\n';
        for (;;) {
            // Termination is independent of request admission. In particular,
            // do not wait for a slow stdout consumer before observing pipe EOF.
            // Probe POLLIN even while paused: Darwin can omit HUP for events=0.
            pollfd inputPeer{STDIN_FILENO, inputEvents, 0};
            const int inputStatus = ::poll(&inputPeer, 1, 0);
            if (inputStatus < 0 && errno != EINTR)
                throw std::system_error(errno, std::generic_category(), "stdin peer poll");
            if (inputStatus > 0 && (inputPeer.revents & (POLLERR | POLLNVAL)))
                return 1;
            if (inputStatus > 0 && (inputPeer.revents & inputEnded))
                return finishClosedInput();
            if (pending_.empty()) {
                if (faulted_)
                    return 1;
                if (worker_.state().isClosed()) {
                    std::fputs("hier serve: worker closed unexpectedly\n", stderr);
                    return 1;
                }
                if (auto record = worker_.state().tryPop())
                    pending_ = encode(std::move(*record));
            }
            if (pending_.empty() && retry_)
                admit();
            if (pending_.empty() && !retry_ && inputBegin_ < inputEnd_)
                consume();
            // One current output frame, one bounded read block, one reader line,
            // and at most one deferred admission. Live input is not read ahead
            // under backpressure; closed input is drained only for EOF checking.
            // The state separately bounds queued/reserved records.
            const bool canRead =
                pending_.empty() && !retry_ && !faulted_ && inputBegin_ == inputEnd_;
            // Darwin does not report a pipe peer closing when events == 0.
            // Probe writable/error once, then omit an idle writable descriptor
            // from the timed wait so it cannot turn the loop into a busy spin.
            if (pending_.empty()) {
                pollfd peer{STDOUT_FILENO, POLLOUT, 0};
                const int status = ::poll(&peer, 1, 0);
                if (status < 0 && errno != EINTR)
                    throw std::system_error(errno, std::generic_category(), "stdout peer poll");
                if (status > 0 && (peer.revents & (POLLERR | POLLHUP | POLLNVAL)))
                    return 1;
            }
            std::array<pollfd, 2> descriptors{
                {{canRead ? STDIN_FILENO : -1, POLLIN, 0},
                 {pending_.empty() ? -1 : STDOUT_FILENO, POLLOUT, 0}}};
            // State's public private-test contract has no I/O callback. A bounded
            // poll interval observes worker output without another thread or a
            // callback under its mutex. This is transport latency, not a timeout.
            const int timeout = pending_.empty() && !retry_ && inputBegin_ < inputEnd_ ? 0 : 10;
            const int ready = ::poll(descriptors.data(), descriptors.size(), timeout);
            if (ready < 0) {
                if (errno == EINTR)
                    continue;
                throw std::system_error(errno, std::generic_category(), "stdio poll");
            }
            if (descriptors[1].revents & (POLLERR | POLLHUP | POLLNVAL))
                return 1;
            if (!pending_.empty() && (descriptors[1].revents & POLLOUT)) {
                const auto written =
                    ::write(STDOUT_FILENO, pending_.data() + written_, pending_.size() - written_);
                if (written < 0) {
                    if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)
                        continue;
                    throw std::system_error(errno, std::generic_category(), "stdout write");
                }
                if (written == 0)
                    return 1;
                written_ += static_cast<size_t>(written);
                if (written_ == pending_.size()) {
                    pending_.clear();
                    written_ = 0;
                }
            }
            if (canRead && (descriptors[0].revents & (POLLIN | POLLHUP))) {
                const auto count = ::read(STDIN_FILENO, input_.data(), input_.size());
                if (count < 0) {
                    if (errno == EINTR || errno == EAGAIN || errno == EWOULDBLOCK)
                        continue;
                    throw std::system_error(errno, std::generic_category(), "stdin read");
                }
                if (count == 0) {
                    return endInput();
                } else {
                    inputBegin_ = 0;
                    inputEnd_ = static_cast<size_t>(count);
                }
            }
            if (descriptors[0].revents & (POLLERR | POLLNVAL))
                return 1;
        }
    }

  private:
    SessionWorker &worker_;
    model::SnapshotInfo snapshot_;
    FrameReader reader_;
    std::array<std::byte, 65536> input_{};
    size_t inputBegin_ = 0, inputEnd_ = 0;
    std::string pending_;
    size_t written_ = 0;
    uint64_t highestId_ = 0;
    std::optional<Request> retry_;
    bool faulted_ = false;

    int endInput() {
        worker_.close();
        if (!faulted_ && reader_.finish() == EndStatus::clean)
            return 0;
        // A previous response may already have been partly written. Do not
        // append a new JSON object into that incomplete line or wait for space.
        const bool canReport = written_ == 0;
        fault("invalid or incomplete frame at EOF");
        std::fputs("hier serve: invalid or incomplete frame at EOF\n", stderr);
        if (canReport) {
            const auto result = ::write(STDOUT_FILENO, pending_.data(), pending_.size());
            (void)result; // EOF cleanup proceeds even if the peer cannot receive the notice.
        }
        return 1;
    }

    int finishClosedInput() {
        worker_.close();
        retry_.reset();
        // All writers have closed. Consume finite remaining bytes in the same
        // bounded reader, validating complete JSON frames but admitting no work.
        for (;;) {
            while (inputBegin_ < inputEnd_) {
                const auto step =
                    reader_.feed(std::span(input_).subspan(inputBegin_, inputEnd_ - inputBegin_));
                inputBegin_ += step.consumed;
                if (step.status == ReadStatus::fault ||
                    (step.status == ReadStatus::frame &&
                     std::holds_alternative<DecodeFault>(decodeFrame(step.frame)))) {
                    faulted_ = true;
                    return endInput();
                }
            }
            const auto count = ::read(STDIN_FILENO, input_.data(), input_.size());
            if (count < 0) {
                if (errno == EINTR)
                    continue;
                throw std::system_error(errno, std::generic_category(), "closed stdin read");
            }
            if (count == 0)
                return endInput();
            inputBegin_ = 0;
            inputEnd_ = static_cast<size_t>(count);
        }
    }

    void fault(std::string_view message) {
        worker_.close();
        faulted_ = true;
        JsonWriter w;
        w.beginObject().key("event").value("protocol_error").key("error").beginObject();
        w.key("code").value("bad_request").key("message").value(message).key("data").beginObject();
        w.endObject().endObject().endObject();
        pending_ = w.str() + '\n';
    }
    void admit() {
        const auto status = worker_.state().admit(std::move(*retry_));
        if (status == AdmitStatus::accepted)
            retry_.reset();
        else if (status == AdmitStatus::queue_full) {
            pending_ = errorReply(retry_->id, "bad_request", "too many unsettled requests",
                                  {{"reason", "queue_full"}})
                           .json +
                       '\n';
            retry_.reset();
        }
        // backpressured retains precisely this owning request, with its ID
        // already consumed. Retrying must not re-register or move rejected data.
    }
    void consume() {
        const auto step =
            reader_.feed(std::span(input_).subspan(inputBegin_, inputEnd_ - inputBegin_));
        inputBegin_ += step.consumed;
        if (step.status == ReadStatus::fault) {
            fault("empty or oversized input frame");
            return;
        }
        if (step.status != ReadStatus::frame)
            return;
        auto decoded = decodeFrame(step.frame);
        if (std::holds_alternative<DecodeFault>(decoded)) {
            fault("invalid UTF-8 or JSON frame");
            return;
        }
        JsonValue value{std::get<JsonValue::Object>(std::move(decoded))};
        auto &fields = std::get<JsonValue::Object>(value.value);
        const auto methodField = fields.find("method");
        if (methodField != fields.end() && schema::equalString(methodField->second, "cancel")) {
            if (!validateDefinition("Cancel", value)) {
                fault("invalid cancel frame");
                return;
            }
            const auto &params = std::get<JsonValue::Object>(fields.at("params").value);
            const auto target = static_cast<uint64_t>(*schema::integer(params.at("target")));
            if (auto action = worker_.state().cancel(target))
                action->request_stop();
            return;
        }
        const auto idField = fields.find("id");
        const auto id =
            idField == fields.end() ? std::optional<int64_t>{} : schema::integer(idField->second);
        if (!id || *id < 1 || static_cast<uint64_t>(*id) <= highestId_) {
            fault("invalid or reused request id");
            return;
        }
        highestId_ = static_cast<uint64_t>(*id);
        auto reject = [&](std::string_view code, std::string_view message,
                          const std::map<std::string, std::string> &data = {}) {
            pending_ = errorReply(highestId_, code, message, data).json + '\n';
        };
        if (!validateDefinition("RequestEnvelope", value)) {
            reject("bad_request", "invalid request envelope");
            return;
        }
        const auto &snapshot = std::get<std::string>(fields.at("snapshot").value);
        if (snapshot != snapshot_.snapshotId) {
            reject("stale_snapshot", "request belongs to another snapshot",
                   {{"expected", snapshot_.snapshotId}, {"received", snapshot}});
            return;
        }
        const auto &methodName = std::get<std::string>(fields.at("method").value);
        const auto method = findMethod(methodName);
        if (!method) {
            reject("unknown_method", "unknown method");
            return;
        }
        if (!validateDefinition(method->params, fields.at("params"))) {
            reject("bad_request", "invalid method params");
            return;
        }
        retry_ = Request{highestId_, methodName, snapshot,
                         std::get<JsonValue::Object>(std::move(fields.at("params").value))};
        admit();
    }
};
} // namespace

int serve(model::OpenOptions options) {
    try {
        SessionWorker worker(std::move(options));
        worker.start();
        const auto opened = worker.waitOpened();
        if (const auto snapshot = std::get_if<model::SnapshotInfo>(&opened)) {
            const int result = StdioSession(worker, *snapshot).run();
            worker.close();
            worker.join();
            return result;
        }
        if (const auto error = std::get_if<Error>(&opened))
            std::fprintf(stderr, "hier serve: %s\n", error->message.c_str());
        return 1;
    } catch (const std::exception &error) {
        std::fprintf(stderr, "hier serve: %s\n", error.what());
        return 1;
    }
}
} // namespace hier::protocol
