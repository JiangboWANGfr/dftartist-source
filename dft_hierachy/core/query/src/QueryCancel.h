#pragma once
#include "hier/model/Result.h"

namespace hier::detail {
// Private unwinding for nested legacy query loops. Public Result-returning
// overloads catch this at the Core boundary; no exception crosses the API.
inline void checkpoint(Cancel cancel) {
    if (cancel.stop_requested())
        throw Error{ErrorCode::Cancelled, "query cancelled"};
}
template <class T> T checked(Result<T> result) {
    if (!result)
        throw result.error();
    return std::move(result.value());
}
} // namespace hier::detail
