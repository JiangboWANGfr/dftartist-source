#pragma once

// B-15 declaration proposal only: no runtime definitions or CMake target yet.
// Private L4 vocabulary for the same reader/decoder/state/worker used by serve.
// Do not install this header or add this directory to PUBLIC include paths.
#include "hier/model/Model.h"
#include "hier/model/Result.h"
#include "hier/protocol/JsonDecode.h"

#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <span>
#include <stop_token>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace hier::protocol::session {

enum class ReadStatus { need_more, frame, fault };
struct ReadStep {
    size_t consumed;
    ReadStatus status;
    std::string frame;
};
enum class EndStatus { clean, fault };

class FrameReader {
  public:
    FrameReader();
    ~FrameReader();
    FrameReader(const FrameReader &) = delete;
    FrameReader &operator=(const FrameReader &) = delete;
    ReadStep feed(std::span<const std::byte> bytes);
    EndStatus finish();

  private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

// Shared owned JSON vocabulary. Session state remains private.
using JsonNumber=hier::protocol::JsonNumber;
using JsonValue=hier::protocol::JsonValue;
using DecodeFaultCode=hier::protocol::JsonDecodeFaultCode;
using DecodeFault=hier::protocol::JsonDecodeFault;
using DecodeResult=hier::protocol::JsonDecodeResult;
DecodeResult decodeFrame(std::string_view bytes);

// Envelope/schema validation precedes admission. No spans into the decoder,
// frontend resources or borrowed buffers may be retained in these values.
struct Request {
    uint64_t id;
    std::string method;
    std::string snapshot;
    JsonValue::Object params;
};
struct RunningTask { Request request; std::stop_token cancel; };
struct ReplyFrame { std::string json; }; // complete validated success/error, no LF
struct Cancelled {};
struct Progress { uint64_t target; uint64_t done; uint64_t total; };
struct Terminal { uint64_t target; std::variant<ReplyFrame, Cancelled> outcome; };
using Output = std::variant<Progress, Terminal>;
enum class AdmitStatus { accepted, queue_full, backpressured, closed };
enum class FinishStatus { published, not_running, closed };

class SessionState {
  public:
    SessionState();
    ~SessionState();
    SessionState(const SessionState &) = delete;
    SessionState &operator=(const SessionState &) = delete;

    AdmitStatus admit(Request &&request); // moved only on accepted; retry retains it
    // waitFront returns only an ID candidate. take rechecks after a probe resumes.
    std::optional<uint64_t> waitFront(std::stop_token closing);
    std::optional<RunningTask> take();
    // The optional owns a stop_source copy. Production I/O immediately invokes
    // request_stop outside the state lock; tests can hold it to expose the gap.
    std::optional<std::stop_source> cancel(uint64_t target);
    FinishStatus finish(uint64_t target, ReplyFrame candidate);
    std::optional<Output> tryPop();
    std::optional<Output> waitPop(std::stop_token closing);
    void close(); // disable publication, then request stop and notify OUTSIDE lock
    bool isClosed() const;
    size_t unsettled() const;

  private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
enum class SessionPhase { before_take, before_core, after_core, after_terminal };
struct SessionProbe {
    virtual ~SessionProbe() = default;
    virtual void reach(SessionPhase phase, uint64_t requestId,
                       std::stop_token closing) noexcept = 0;
};
#endif

struct Closed {};
using Opened = std::variant<model::SnapshotInfo, Error, Closed>;
enum class StartStatus { started, already_started, closed };
class SessionWorker {
  public:
    explicit SessionWorker(model::OpenOptions options
#if defined(HIER_TEST_OBSERVER) && HIER_TEST_OBSERVER
                           , std::shared_ptr<SessionProbe> probe = {}
#endif
    );
    ~SessionWorker(); // close + join; Design destroyed by the worker
    SessionWorker(const SessionWorker &) = delete;
    SessionWorker &operator=(const SessionWorker &) = delete;
    StartStatus start();
    Opened waitOpened();
    SessionState &state() noexcept; // borrowed until this worker is destroyed
    void close();
    void join(); // idempotent, never holds the state/output lock while joining
    bool joined() const;

  private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace hier::protocol::session
