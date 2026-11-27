#pragma once
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

namespace hdl::json {

// Minimal streaming JSON writer. Compact output; differential test normalizes anyway.
class JsonWriter {
public:
    void beginObject() { pre(); buf_ += '{'; first_.push_back(true); }
    void endObject() { buf_ += '}'; first_.pop_back(); }
    void beginArray() { pre(); buf_ += '['; first_.push_back(true); }
    void endArray() { buf_ += ']'; first_.pop_back(); }

    void key(const std::string& k) {
        pre();
        writeStr(k);
        buf_ += ':';
        pendingKey_ = true;
    }

    void value(const std::string& v) { pre(); writeStr(v); }
    void value(const char* v) { pre(); writeStr(v); }
    void value(int v) { pre(); buf_ += std::to_string(v); }
    void value(size_t v) { pre(); buf_ += std::to_string(v); }
    void value(double v) {   // finite only; NaN/Inf have no JSON encoding -> null
        pre();
        if (std::isfinite(v)) { char b[32]; std::snprintf(b, sizeof b, "%.10g", v); buf_ += b; }
        else buf_ += "null";
    }
    void value(bool v) { pre(); buf_ += (v ? "true" : "false"); }
    void valueNull() { pre(); buf_ += "null"; }

    const std::string& str() const { return buf_; }

private:
    // Emit separator before a key or a value, unless this value directly follows a key.
    void pre() {
        if (pendingKey_) { pendingKey_ = false; return; }
        if (!first_.empty()) {
            if (!first_.back()) buf_ += ',';
            first_.back() = false;
        }
    }
    void writeStr(const std::string& s) {
        buf_ += '"';
        for (char c : s) {
            switch (c) {
                case '"': buf_ += "\\\""; break;
                case '\\': buf_ += "\\\\"; break;
                case '\n': buf_ += "\\n"; break;
                case '\r': buf_ += "\\r"; break;
                case '\t': buf_ += "\\t"; break;
                default:
                    if (static_cast<unsigned char>(c) < 0x20) {
                        char b[8];
                        std::snprintf(b, sizeof b, "\\u%04x", static_cast<unsigned char>(c));
                        buf_ += b;
                    } else {
                        buf_ += c;
                    }
            }
        }
        buf_ += '"';
    }

    std::string buf_;
    std::vector<bool> first_;
    bool pendingKey_ = false;
};

}  // namespace hdl::json
