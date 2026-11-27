#pragma once
#include <optional>
#include <stop_token>
#include <string>
#include <utility>
#include <vector>

namespace hier {

// Error codes shared by the C++ API and the wire protocol (docs/DESIGN.md 5.2).
enum class ErrorCode { BadRequest, NotFound, StaleCursor, Unsupported, Internal, Cancelled };

using Cancel = std::stop_token;

struct Error {
    ErrorCode code;
    std::string message;
};

// Either a value or an error.
template<class T>
class Result {
public:
    Result(T value) : value_(std::move(value)) {}
    Result(Error error) : error_(std::move(error)) {}

    bool ok() const { return value_.has_value(); }
    explicit operator bool() const { return ok(); }
    const T& value() const { return *value_; }
    T& value() { return *value_; }
    const T& operator*() const { return *value_; }
    const T* operator->() const { return &*value_; }
    const Error& error() const { return *error_; }

private:
    std::optional<T> value_;
    std::optional<Error> error_;
};

struct PageRequest {
    std::string cursor;  // empty = first page
    int limit = 200;
};

template<class T>
struct Page {
    std::vector<T> items;
    std::string next;  // empty = no more
};

}  // namespace hier
