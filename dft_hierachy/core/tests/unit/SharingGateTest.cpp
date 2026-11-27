// The gate that decides whether instances may share one extraction (docs/DESIGN.md 4.1,
// frontend/SHARING_VERIFIED.md). Sharing is allowed only for exactly the frontend that
// was verified; these tests feed it identities that differ in each respect.
#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "hier/Design.h"
#include "hier/frontend/Frontend.h"

using namespace hier;
using namespace hier::frontend;
using Catch::Matchers::ContainsSubstring;

TEST_CASE("the linked frontend is exactly the verified one") {
    // If this fails, the pinned slang (or the sources that implement its instance
    // caching) changed. Redo SHARING_VERIFIED.md before updating the verified identity.
    auto linked = linkedFrontend();
    auto verified = verifiedFrontend();
    CHECK(linked.version == verified.version);
    CHECK(linked.prerelease == verified.prerelease);
    CHECK(linked.sourceId == verified.sourceId);
    CHECK(sharingBlockedReason(linked, verified).empty());
    CHECK(buildInfo().sharingBlockedReason.empty());
}

TEST_CASE("sharing is refused for any frontend other than the verified one") {
    const FrontendIdentity verified{"12.0.0", "", "abc123"};
    CHECK(sharingBlockedReason(verified, verified).empty());

    SECTION("a patch release with the same major and minor") {
        auto reason = sharingBlockedReason({"12.0.1", "", "abc123"}, verified);
        CHECK_THAT(reason, ContainsSubstring("version is '12.0.1'"));
        CHECK_THAT(reason, ContainsSubstring("'12.0.0'"));
    }
    SECTION("a different minor or major") {
        CHECK_FALSE(sharingBlockedReason({"12.1.0", "", "abc123"}, verified).empty());
        CHECK_FALSE(sharingBlockedReason({"13.0.0", "", "abc123"}, verified).empty());
    }
    SECTION("a prerelease of the same version") {
        auto reason = sharingBlockedReason({"12.0.0", "rc1", "abc123"}, verified);
        CHECK_THAT(reason, ContainsSubstring("prerelease tag is 'rc1'"));
    }
    SECTION("the same version number built from different caching sources") {
        auto reason = sharingBlockedReason({"12.0.0", "", "def456"}, verified);
        CHECK_THAT(reason, ContainsSubstring("source id is 'def456'"));
        CHECK_THAT(reason, ContainsSubstring("'abc123'"));
    }
    SECTION("an identity that could not be determined") {
        CHECK_THAT(sharingBlockedReason({"12.0.0", "", ""}, verified),
                   ContainsSubstring("unknown"));
    }
}
