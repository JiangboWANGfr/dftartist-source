#include "ScenariosInternal.h"
#include <iostream>
#include <stdexcept>

int main() try {
    hier::model::OpenOptions open; open.files = {DFT_FIXTURE}; open.tops = {"empty"};
    auto d = hier::Design::open(open); if (!d) throw std::runtime_error("fixture open");
    dft::sequential::ScenarioRequest r; r.common.scope = "empty"; r.common.resolveLogic = true;
    const std::vector<std::string> invalid = {"\x80", "\xbf", "\xc0\x80", "\xc1\xbf", "\xc2", "\xe0\x9f\xbf",
        "\xed\xa0\x80", "\xe1\x80", "\xf0\x8f\xbf\xbf", "\xf4\x90\x80\x80", "\xf1\x80\x80", "\xf5\x80\x80\x80", "\xfe", "\xff"};
    for (const auto &name : invalid) {
        r.scenarios = {{name, {}}, {"ok", {}}};
        auto result = dft::sequential::compareScenarios(**d, r);
        if (result || result.error().code != hier::ErrorCode::BadRequest || result.error().message.find(name) != std::string::npos)
            throw std::runtime_error("Invalid scalar encoding accepted or echoed");
        auto expired = dft::sequential::detail::compareScenariosWithDeadline(**d, r, {}, {});
        if (expired || expired.error().code != hier::ErrorCode::BadRequest) throw std::runtime_error("Expired request bypasses name validation");
    }
    for (const auto &name : std::vector<std::string>{"中文🧪", "\xc2\x80", "\xe0\xa0\x80", "\xed\x9f\xbf", "\xf0\x90\x80\x80", "\xf4\x8f\xbf\xbf", std::string("a\0b", 3), std::string(128, 'x')}) {
        r.scenarios = {{name, {}}, {"ok", {}}};
        if (!dft::sequential::compareScenarios(**d, r)) throw std::runtime_error("Valid UTF-8 scalar encoding rejected");
    }
    std::cout << "UTF-8 scalar validity, request boundary and legal names passed\n";
    return 0;
} catch (const std::exception &e) { std::cerr << e.what() << '\n'; return 1; }
