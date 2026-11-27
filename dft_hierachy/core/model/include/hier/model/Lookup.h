#pragma once
#include <optional>
#include <string>
#include <vector>

namespace hier::model {

enum class HitKind { Definition, Instance, Port, Signal, Process, Register };

struct SearchQuery {
    std::string text;
    // Absent means all kinds; an explicitly empty vector means none.
    std::optional<std::vector<HitKind>> kinds;
    std::optional<std::string> scope;
};

struct ObjectHit {
    HitKind kind = HitKind::Instance;
    std::string ref, name;
    std::vector<std::string> path;
    std::string pathText;
    std::optional<std::string> inst, def;
};

} // namespace hier::model
