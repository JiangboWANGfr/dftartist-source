#pragma once
#include "hier/db/DesignDb.h"

namespace hier::detail {
Result<db::Located> locateInstance(const db::DesignDb &, std::string_view,
                                    model::InstKey &, Cancel);
Result<model::InstInfo> instance(const db::DesignDb &, std::string_view, Cancel);
Result<std::vector<model::PortInfo>> ports(const db::DesignDb &, std::string_view, Cancel);
Result<std::vector<model::ParamInfo>> params(const db::DesignDb &, std::string_view, Cancel);
Result<model::ObjectInfo> object(const db::DesignDb &, std::string_view, Cancel);
} // namespace hier::detail
