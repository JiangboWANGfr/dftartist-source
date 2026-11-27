#pragma once
#include <memory>
#include <vector>

#include "hier/model/Model.h"
#include "hier/model/CompilationInputs.h"
#include "hier/model/Result.h"

// L1: turns HDL into model facts. The ONLY layer that touches the HDL frontend library;
// everything in this interface is an L0 type (docs/DESIGN.md 3.2).
namespace hier::frontend {

class Frontend {
  public:
    virtual ~Frontend() = default;

    virtual const model::FrontendInfo &info() const = 0;

    // Tops in name order. Body ids are dense, 0 .. bodyCount()-1, and are assigned in a
    // fixed order (depth-first from the tops), so they do not depend on what was queried.
    virtual const std::vector<model::TopInfo> &tops() const = 0;
    virtual size_t bodyCount() const = 0;

    // Every definition of every kind in one fixed order: by name, then file, then line.
    // Blackboxes and primitives have no file and sort among the rest by name.
    virtual const std::vector<model::DefInfo> &definitions() const = 0;

    // Extracts the skeleton of one body. A pure function of the opened design and the
    // id: extracting twice gives identical results (docs/DESIGN.md 4.2).
    virtual model::BodySkeleton skeleton(model::BodyId body) const = 0;
    virtual model::BodyConnections connections(model::BodyId body) const = 0;

    virtual std::vector<model::SourceFileInput> sourceFiles() const { return {}; }
    virtual model::CompilationInputs compilationInputs() const { return {}; }
    virtual std::vector<std::optional<model::SourceRange>> definitionSources() const { return {}; }

    virtual model::Diagnostics diagnostics(size_t maxItems) const = 0;
    virtual Result<model::Diagnostics> diagnostics(size_t maxItems, Cancel cancel) const {
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "diagnostics cancelled"};
        auto result = diagnostics(maxItems);
        if (cancel.stop_requested())
            return Error{ErrorCode::Cancelled, "diagnostics cancelled"};
        return result;
    }
};

// Compiles and fully elaborates the design.
Result<std::unique_ptr<Frontend>> openDesign(const model::OpenOptions &options);

// Version of the HDL frontend this build links, e.g. "12.0.0".
std::string frontendVersion();

// What identifies a build of the HDL frontend for the purpose of body sharing.
struct FrontendIdentity {
    std::string version;    // full version, "12.0.0"
    std::string prerelease; // empty for a release
    std::string sourceId;   // hash of the sources that implement instance caching
};

// The frontend this build links, and the one whose caching conditions were verified
// (SHARING_VERIFIED.md).
FrontendIdentity linkedFrontend();
FrontendIdentity verifiedFrontend();

// Why body sharing must stay off for `actual`, or empty if it may be enabled. Sharing
// is allowed only when every part of the identity equals the verified one; anything
// missing or different turns it off.
std::string sharingBlockedReason(const FrontendIdentity &actual, const FrontendIdentity &verified);

} // namespace hier::frontend
