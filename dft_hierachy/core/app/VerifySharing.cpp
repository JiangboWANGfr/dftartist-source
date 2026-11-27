#include "VerifySharing.h"
#include "SharingReference.h"
#include "hier/protocol/Json.h"
#include <cstdio>
#include <exception>

namespace hier::app {
namespace {
int print(const Error &error) {
    protocol::JsonWriter writer;
    protocol::write(writer, error);
    std::puts(writer.str().c_str());
    return 1;
}
int fail(const std::string &why) {
    std::printf("verify-sharing FAILED: %s\n", why.c_str());
    return 1;
}
} // namespace

// Capture exact replies, release the first Compilation, then compare every
// instance/process against the second. Temporary storage failures fail closed.
int verifySharing(model::OpenOptions options) try {
    options.forcePerInstanceBodies = false;
    auto shared = Design::open(options);
    if (!shared)
        return print(shared.error());
    const auto info = shared.value()->snapshot();
    if (!info.frontend.sharedBodies)
        return fail("body sharing is off (" + info.frontend.sharedBodiesReason + ")");
    const auto diags = shared.value()->diagnostics(1);
    if (diags.errorCount)
        return fail("the design has " + std::to_string(diags.errorCount) +
                    " compile error(s); first: " + diags.items.front().message);
    if (shared.value()->roots().empty())
        return fail("the design has no top instance");

    SharingReference reference(SharingReference::File(std::tmpfile(), &std::fclose));
    reference.capture(*shared.value());
    shared.value().reset(); // No first Design / AST survives the second open.

    options.forcePerInstanceBodies = true;
    auto separate = Design::open(options);
    if (!separate)
        return print(separate.error());
    const auto roots = separate.value()->roots();
    if (roots.empty())
        return fail("the design has no top instance");
    if (!reference.sameInputs(*separate.value()))
        return fail("the design inputs changed between comparison snapshots");
    if (!reference.sameRoots(roots))
        return fail("the two designs disagree on the top instances");
    const auto comparison = reference.compare(*separate.value(), stdout);
    std::printf(
        "instances compared %zu, bodies shared %zu, bodies per instance %zu, different %zu, "
        "failed queries %zu\n",
        comparison.compared, reference.bodyCount(), separate.value()->snapshot().bodyCount,
        comparison.different, comparison.failedQueries);
    if (comparison.compared == 0)
        return fail("nothing was compared");
    return comparison.different || comparison.failedQueries ? 1 : 0;
} catch (const std::exception &error) {
    return fail(error.what());
}
} // namespace hier::app
