#pragma once
#include "hier/Design.h"
#include <cstdint>
#include <cstdio>
#include <memory>
#include <unordered_map>

namespace hier::app {
struct SharingComparison {
    size_t compared = 0;
    size_t different = 0;
    size_t failedQueries = 0;
};

// Private, invocation-local reference. Owns an anonymous temporary stream and
// serialized results, never a Design / AST or a persistent engineering format.
class SharingReference {
  public:
    using File = std::unique_ptr<std::FILE, int (*)(std::FILE *)>;
    explicit SharingReference(File);
    void capture(const Design &shared);
    bool sameRoots(const std::vector<model::InstInfo> &) const;
    bool sameInputs(const Design &) const;
    size_t bodyCount() const { return bodyCount_; }
    // Borrows the diagnostics stream for this synchronous comparison only.
    SharingComparison compare(const Design &separate, std::FILE *diagnostics);
  private:
    struct ComparedReply {
        bool success;
        bool equal;
    };
    File file_;
    std::unordered_map<std::string, std::fpos_t> instances_;
    std::string roots_;
    std::string inputHash_;
    size_t bodyCount_ = 0;
    void putCount(uint64_t);
    uint64_t getCount();
    void putText(std::string_view);
    std::string getText();
    void putReply(bool success, std::string_view json);
    bool compareText(std::string_view);
    ComparedReply compareReply(bool success, std::string_view json);
    std::fpos_t position();
    void seek(const std::fpos_t &);
    void captureInstance(const Design &, const std::string &);
    void compareInstance(const Design &, const std::string &, SharingComparison &, std::FILE *);
};
} // namespace hier::app
