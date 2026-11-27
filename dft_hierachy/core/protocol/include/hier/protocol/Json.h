#pragma once
#include <string>
#include <vector>

#include "hier/Design.h"
#include "hier/model/Model.h"
#include "hier/model/Result.h"

// L4: translation between the kernel API and JSON text. No logic of its own.
namespace hier::protocol {

inline constexpr int kProtocolVersion = 2;

// Minimal JSON text builder. Values are appended in order; the caller is responsible
// for calling begin/end in matching pairs.
class JsonWriter {
  public:
    JsonWriter() = default;
    explicit JsonWriter(bool safeIntegers) : safeIntegers_(safeIntegers) {}
    JsonWriter &beginObject();
    JsonWriter &endObject();
    JsonWriter &beginArray();
    JsonWriter &endArray();
    JsonWriter &key(std::string_view name);
    JsonWriter &value(std::string_view text);
    JsonWriter &value(const char *text) { return value(std::string_view(text)); }
    JsonWriter &value(bool b);
    JsonWriter &null();
    // Overloaded on the built-in types, not on int64_t/uint64_t/size_t: which of those
    // are the same type differs between platforms (size_t is uint64_t on Linux).
    JsonWriter &value(long long n);
    JsonWriter &value(unsigned long long n);
    JsonWriter &value(int n) { return value(static_cast<long long>(n)); }
    JsonWriter &value(long n) { return value(static_cast<long long>(n)); }
    JsonWriter &value(unsigned n) { return value(static_cast<unsigned long long>(n)); }
    JsonWriter &value(unsigned long n) { return value(static_cast<unsigned long long>(n)); }
    const std::string &str() const { return out_; }

  private:
    void separate();
    std::string out_;
    std::vector<bool> first_;
    bool afterKey_ = false;
    bool safeIntegers_ = false;
};

void write(JsonWriter &w, const model::InstInfo &v);
void write(JsonWriter &w, const model::PortInfo &v);
void write(JsonWriter &w, const model::ParamInfo &v);
void write(JsonWriter &w, const model::DefSummary &v);
void write(JsonWriter &w, const model::Diagnostics &v);
void write(JsonWriter &w, const model::SnapshotInfo &v);
void write(JsonWriter &w, const Error &v);

void write(JsonWriter &w, const model::BitRange &v);
void write(JsonWriter &w, const model::MemberInfo &v);
void write(JsonWriter &w, const model::PinInfo &v);
void write(JsonWriter &w, const model::CellInfo &v);
void write(JsonWriter &w, const model::Slice &v);
void write(JsonWriter &w, const model::Reason &v);
void write(JsonWriter &w, const model::Completeness &v);
void write(JsonWriter &w, const model::Dep &v);
void write(JsonWriter &w, const model::Write &v);
void write(JsonWriter &w, const model::ExprMapping &v);
void write(JsonWriter &w, const model::BindTarget &v);
void write(JsonWriter &w, const model::BindSegment &v);
void write(JsonWriter &w, const model::PortInternal &v);
void write(JsonWriter &w, const model::PinBinding &v);
void write(JsonWriter &w, const model::LocalNetlist &v);
void write(JsonWriter &w, const model::SignalInfo &v);
void write(JsonWriter &w, const model::ExternalRef &v);
void write(JsonWriter &w, const model::Expr &v);
void write(JsonWriter &w, const model::ProcessSummary &v);
void write(JsonWriter &w, const model::ProcessInfo &v);
void write(JsonWriter &w, const model::EventInfo &v);
void write(JsonWriter &w, const model::RegisterInfo &v);
void write(JsonWriter &w, const model::ObjectInfo &v);
void write(JsonWriter &w, const model::BitMapSegment &v);
void write(JsonWriter &w, const model::Continuation &v);
void write(JsonWriter &w, const model::TracePoint &v);
void write(JsonWriter &w, const model::Hop &v);
void write(JsonWriter &w, const model::Endpoint &v);
void write(JsonWriter &w, const model::StepResult &v);
void write(JsonWriter &w, const model::TraceNode &v);
void write(JsonWriter &w, const model::TraceEdge &v);
void write(JsonWriter &w, const model::TraceFrontier &v);
void write(JsonWriter &w, const model::TraceResult &v);
void write(JsonWriter &w, const model::ObjectHit &v);
void write(JsonWriter &w, const model::SourcePos &v);
void write(JsonWriter &w, const model::SourceSpan &v);
void write(JsonWriter &w, const model::SourceHit &v);
void write(JsonWriter &w, const model::SourceRead &v);
void write(JsonWriter &w, const model::InputCheck &v);
std::optional<model::SourceKind> parseSourceKind(std::string_view text);
void write(JsonWriter &w, const std::string &v);
std::optional<model::HitKind> parseHitKind(std::string_view text);

template <class T> void write(JsonWriter &w, const std::vector<T> &items) {
    w.beginArray();
    for (auto &item : items)
        write(w, item);
    w.endArray();
}

template <class T> void write(JsonWriter &w, const Page<T> &page) {
    w.beginObject().key("items");
    write(w, page.items);
    if (!page.next.empty())
        w.key("next").value(page.next);
    w.endObject();
}

template <class T> void write(JsonWriter &w, const model::QueryResult<T> &query) {
    w.beginObject().key("result");
    write(w, query.result);
    w.key("completeness");
    write(w, query.completeness);
    w.endObject();
}

// One-line JSON describing this build.
std::string buildInfoJson();

} // namespace hier::protocol
