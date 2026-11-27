#pragma once
#include "hier/Design.h"
namespace dft::memory {
struct LibraryDeclaration {
    std::string source;
    std::map<std::string, hier::model::CellInfo> cells;
};
std::string_view libraryDirectionName(hier::model::Direction);
std::optional<hier::model::Direction> parseLibraryDirection(std::string_view);
// Immutable, owned input for Design::open. No memory roles or file loading here.
class PinLibrary final : public hier::model::LibraryProvider {
public:
    static hier::Result<std::shared_ptr<const PinLibrary>> create(const LibraryDeclaration &,
                                                                 hier::Cancel = {});
    std::optional<hier::model::CellInfo> cell(std::string_view) const override;
    // Borrow valid for this provider's lifetime; includes the injected source attr.
    const LibraryDeclaration &declaration() const { return declaration_; }
private:
    explicit PinLibrary(LibraryDeclaration input) : declaration_(std::move(input)) {}
    LibraryDeclaration declaration_;
};
}
