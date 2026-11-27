#include "json/JsonValue.h"

#include <cassert>
#include <cstdio>

using namespace hdl::json;

int main() {
    Value v = parse(R"({"id": 7, "method": "get-ports", "params": {"nodeId": "top.u_cpu[3].x", "n": null}})");
    assert(v.type == Value::Type::Object);
    const Value* id = v.find("id");
    assert(id && id->type == Value::Type::Int && id->i == 7);
    assert(v.str("method") == "get-ports");
    const Value* p = v.find("params");
    assert(p && p->type == Value::Type::Object);
    assert(p->str("nodeId") == "top.u_cpu[3].x");
    const Value* n = p->find("n");
    assert(n && n->isNull());

    // escapes + array + bool
    Value a = parse(R"({"s":"a\"b\\c\n", "arr":[1,true,"x"]})");
    assert(a.str("s") == "a\"b\\c\n");
    const Value* arr = a.find("arr");
    assert(arr && arr->type == Value::Type::Array && arr->arr.size() == 3);
    assert(arr->arr[1].type == Value::Type::Bool && arr->arr[1].b == true);

    // null id (notification-style)
    Value nid = parse(R"({"id": null, "method": "ping"})");
    assert(nid.find("id")->isNull());

    std::printf("test_jsonvalue OK\n");
    return 0;
}
