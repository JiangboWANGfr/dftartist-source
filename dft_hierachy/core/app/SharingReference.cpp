#include "SharingReference.h"
#include "hier/protocol/Json.h"
#include <algorithm>
#include <array>
#include <cerrno>
#include <cstring>
#include <stdexcept>

namespace hier::app {
namespace {
[[noreturn]] void ioFailure(const char *operation) {
    const auto error = errno;
    throw std::runtime_error(std::string("comparison reference ") + operation +
                             (error ? ": " + std::string(std::strerror(error)) : " failed"));
}
template <class T> protocol::JsonWriter serialize(const Result<T> &reply) {
    protocol::JsonWriter writer;
    if (reply)
        protocol::write(writer, reply.value());
    else
        protocol::write(writer, reply.error());
    return writer;
}
void different(SharingComparison &c, const char *field, const std::string &ref,
               const Design &separate, std::FILE *out) {
    if (c.different++ < 20) {
        const auto inst = separate.instance(ref);
        std::fprintf(out, "DIFFERENT %s of %s (%s)\n", field, ref.c_str(),
                     inst ? inst->pathText.c_str() : "?");
    }
}
} // namespace

SharingReference::SharingReference(File file) : file_(std::move(file)) {
    if (!file_)
        ioFailure("create");
}
void SharingReference::putCount(uint64_t value) {
    if (std::fwrite(&value, sizeof(value), 1, file_.get()) != 1)
        ioFailure("write");
}
uint64_t SharingReference::getCount() {
    uint64_t value;
    if (std::fread(&value, sizeof(value), 1, file_.get()) != 1)
        throw std::runtime_error("comparison reference read failed or truncated");
    return value;
}
void SharingReference::putText(std::string_view value) {
    putCount(value.size());
    if (std::fwrite(value.data(), 1, value.size(), file_.get()) != value.size())
        ioFailure("write");
}
std::string SharingReference::getText() {
    const auto count = getCount();
    std::string value;
    if (count > value.max_size())
        throw std::runtime_error("comparison reference invalid length");
    value.resize(size_t(count));
    if (std::fread(value.data(), 1, value.size(), file_.get()) != value.size())
        throw std::runtime_error("comparison reference read failed or truncated");
    return value;
}
void SharingReference::putReply(bool success, std::string_view json) {
    putCount(success ? 1 : 0);
    putText(json);
}
bool SharingReference::compareText(std::string_view other) {
    const auto count = getCount();
    if (count > std::string().max_size())
        throw std::runtime_error("comparison reference invalid length");
    bool equal = count == other.size();
    std::array<char, 64 * 1024> buffer;
    for (uint64_t offset = 0; offset < count;) {
        const auto chunk = size_t(std::min<uint64_t>(buffer.size(), count - offset));
        if (std::fread(buffer.data(), 1, chunk, file_.get()) != chunk)
            throw std::runtime_error("comparison reference read failed or truncated");
        if (equal && std::memcmp(buffer.data(), other.data() + size_t(offset), chunk))
            equal = false;
        offset += chunk;
    }
    // Consume the whole record even after a mismatch, so later records and
    // truncated storage cannot be silently skipped by an early difference.
    return equal;
}
SharingReference::ComparedReply SharingReference::compareReply(bool actualSuccess,
                                                              std::string_view json) {
    const auto success = getCount();
    if (success > 1)
        throw std::runtime_error("comparison reference invalid status");
    return {success != 0 && actualSuccess, compareText(json)};
}
std::fpos_t SharingReference::position() {
    std::fpos_t result;
    if (std::fgetpos(file_.get(), &result))
        ioFailure("position");
    return result;
}
void SharingReference::seek(const std::fpos_t &position) {
    if (std::fsetpos(file_.get(), &position))
        ioFailure("seek");
}
void SharingReference::capture(const Design &shared) {
    const auto roots = shared.roots();
    roots_ = serialize(Result<std::vector<model::InstInfo>>(roots)).str();
    const auto info = shared.snapshot();
    bodyCount_ = info.bodyCount;
    inputHash_ = info.inputHash;
    for (const auto &root : roots)
        captureInstance(shared, root.ref);
    if (std::fflush(file_.get()))
        ioFailure("flush");
}
void SharingReference::captureInstance(const Design &shared, const std::string &ref) {
    if (!instances_.emplace(ref, position()).second)
        throw std::runtime_error("comparison reference duplicate instance");
    auto store = [&](const auto &reply) { putReply(bool(reply), serialize(reply).str()); };
    {
        const auto inst = shared.instance(ref);
        const auto ports = shared.ports(ref);
        const auto params = shared.params(ref);
        store(inst);
        store(ports);
        store(params);
        if (!inst || !ports || !params)
            return;
        PageRequest all;
        all.limit = 1000000000;
        store(shared.signals(ref, all));
        store(shared.bindings(ref));
        store(shared.registers(ref, all));
        const auto procs = shared.procs(ref, all);
        store(procs);
        putCount(procs ? procs->items.size() : 0);
        if (procs)
            for (const auto &proc : procs->items) {
                putText(proc.ref);
                store(shared.proc(proc.ref));
            }
    } // Release metadata / process summaries before retaining descendant queries.
    // Finish the record before descendants so each record can be read by ref.
    // Only child references are retained; complete reply bytes go to the file.
    std::vector<std::string> children;
    PageRequest page;
    page.limit = 1000;
    while (true) {
        putText(page.cursor);
        const auto kids = shared.children(ref, page);
        store(kids);
        const bool more = kids && !kids->next.empty();
        putCount(more ? 1 : 0);
        if (kids)
            for (const auto &child : kids->items)
                children.push_back(child.ref);
        if (!more)
            break;
        page.cursor = kids->next;
    }
    for (const auto &child : children)
        captureInstance(shared, child);
}
bool SharingReference::sameRoots(const std::vector<model::InstInfo> &roots) const {
    return roots_ == serialize(Result<std::vector<model::InstInfo>>(roots)).str();
}
bool SharingReference::sameInputs(const Design &separate) const {
    // A differing captured hash detects a change; equality does not upgrade
    // inputHashComplete or prove coverage of inputs the frontend cannot capture.
    return inputHash_ == separate.snapshot().inputHash;
}
SharingComparison SharingReference::compare(const Design &separate, std::FILE *out) {
    if (!out)
        throw std::invalid_argument("comparison diagnostics stream is null");
    SharingComparison result;
    for (const auto &root : separate.roots())
        compareInstance(separate, root.ref, result, out);
    return result;
}
void SharingReference::compareInstance(const Design &separate, const std::string &ref,
                                        SharingComparison &c, std::FILE *out) {
    ++c.compared;
    const auto found = instances_.find(ref);
    if (found == instances_.end()) {
        ++c.failedQueries;
        std::fprintf(out, "QUERY FAILED for %s\n", ref.c_str());
        return;
    }
    seek(found->second);
    auto match = [&](const auto &reply) { return compareReply(bool(reply), serialize(reply).str()); };
    {
        const auto a = match(separate.instance(ref));
        const auto pa = match(separate.ports(ref));
        const auto qa = match(separate.params(ref));
        if (!a.success || !pa.success || !qa.success) {
            ++c.failedQueries;
            std::fprintf(out, "QUERY FAILED for %s\n", ref.c_str());
            return;
        }
        const char *what = nullptr;
        if (!a.equal)
            what = "instance";
        else if (!pa.equal)
            what = "ports";
        else if (!qa.equal)
            what = "parameters";
        if (what) {
            different(c, what, ref, separate, out);
            return;
        }
        auto check = [&](ComparedReply result, const char *field) {
            if (!result.success) {
                ++c.failedQueries;
                std::fprintf(out, "QUERY FAILED %s of %s\n", field, ref.c_str());
            } else if (!result.equal)
                different(c, field, ref, separate, out);
        };
        PageRequest all;
        all.limit = 1000000000;
        check(match(separate.signals(ref, all)), "signals");
        check(match(separate.bindings(ref)), "bindings");
        check(match(separate.registers(ref, all)), "registers");
        const auto otherSources = separate.procs(ref, all);
        const auto sources = match(otherSources);
        check(sources, "processes");
        const auto count = getCount();
        for (uint64_t i = 0; i < count; ++i) {
            const auto proc = getText();
            if (sources.success)
                check(match(separate.proc(proc)), "process facts");
            else
                (void)compareReply(false, {});
        }
    } // Release metadata and process summaries before child recursion.
    while (true) {
        PageRequest page;
        page.limit = 1000;
        page.cursor = getText();
        const auto kids = separate.children(ref, page);
        const auto expected = match(kids);
        const auto more = getCount();
        if (more > 1)
            throw std::runtime_error("comparison reference invalid page status");
        if (!expected.success) {
            ++c.failedQueries;
            std::fprintf(out, "QUERY FAILED: children of %s\n", ref.c_str());
            return;
        }
        if (!expected.equal) {
            different(c, "children", ref, separate, out);
            return;
        }
        // Descendant records share the stream. Resume this parent's next page.
        const auto resume = position();
        for (const auto &child : kids->items)
            compareInstance(separate, child.ref, c, out);
        seek(resume);
        if (!more)
            return;
    }
}
} // namespace hier::app
