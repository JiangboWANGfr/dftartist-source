#pragma once
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <vector>
namespace hier::model {
enum class Direction { In, Out, InOut, Ref, Unknown };
struct PinInfo {
    std::string name;
    Direction dir = Direction::Unknown;
    std::optional<uint32_t> width;
    std::map<std::string, std::string> attrs;
};
struct CellInfo {
    std::vector<PinInfo> pins;
    std::map<std::string, std::string> attrs;
};
struct LibraryProvider {
    virtual ~LibraryProvider() = default;
    virtual std::optional<CellInfo> cell(std::string_view definitionName) const = 0;
};
struct EmptyLibrary final : LibraryProvider {
    std::optional<CellInfo> cell(std::string_view) const override { return {}; }
};
} // namespace hier::model
