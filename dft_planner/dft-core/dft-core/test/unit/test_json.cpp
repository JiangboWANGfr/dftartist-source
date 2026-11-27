#include "json/JsonWriter.h"

#include <cassert>
#include <cstdio>
#include <string>

using hdl::json::JsonWriter;

int main() {
    JsonWriter w;
    w.beginObject();
    w.key("a");
    w.value(1);
    w.key("s");
    w.value(std::string("x\"y\\z"));
    w.key("arr");
    w.beginArray();
    w.value(std::string("p"));
    w.value(true);
    w.endArray();
    w.key("n");
    w.valueNull();
    w.endObject();
    std::string out = w.str();

    assert(out.find("\"a\":1") != std::string::npos);
    assert(out.find("\"x\\\"y\\\\z\"") != std::string::npos);  // escaping
    assert(out.find("\"arr\":[\"p\",true]") != std::string::npos);
    assert(out.find("\"n\":null") != std::string::npos);
    assert(out.front() == '{' && out.back() == '}');

    std::printf("test_json OK\n");
    return 0;
}
