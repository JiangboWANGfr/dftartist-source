// B-only functional replay of the existing private validation declaration.
// Same production decodeFrame/validateDefinition/normalize, no alternative parser.
#include "WireSchema.h"
#include "hier/protocol/Json.h"
#include <iostream>
#include <stdexcept>
#include <type_traits>
using namespace hier::protocol::session;
namespace {
std::string quoted(std::string_view text) {
    hier::protocol::JsonWriter writer; writer.value(text); return writer.str();
}
std::string json(const JsonValue& value) {
    return std::visit([](const auto& v)->std::string {
        using T=std::decay_t<decltype(v)>;
        if constexpr(std::is_same_v<T,std::nullptr_t>) return "null";
        else if constexpr(std::is_same_v<T,bool>) return v?"true":"false";
        else if constexpr(std::is_same_v<T,JsonNumber>) return v.token;
        else if constexpr(std::is_same_v<T,std::string>) return quoted(v);
        else {
            std::string out=std::is_same_v<T,JsonValue::Array>?"[":"{";
            bool first=true;
            for(const auto& item:v) {
                if(!first)
                    out+=',';
                first=false;
                if constexpr(std::is_same_v<T,JsonValue::Array>) out+=json(item);
                else out+=quoted(item.first)+":"+json(item.second);
            }
            return out+(std::is_same_v<T,JsonValue::Array>?"]":"}");
        }
    },value.value);
}
}
int main() {
    try {
        for(std::string line;std::getline(std::cin,line);) {
            auto decoded=decodeFrame(line);
            if(auto* fault=std::get_if<DecodeFault>(&decoded)) {
                std::cout<<"{\"decodeFault\":true,\"offset\":"<<fault->byteOffset<<"}\n";continue;
            }
            const auto& row=std::get<JsonValue::Object>(decoded);
            const auto& action=std::get<std::string>(row.at("action").value);
            const auto& name=std::get<std::string>(row.at("name").value);
            if(action=="validate") {
                std::cout<<"{\"accept\":"<<(validateDefinition(name,row.at("value"))?"true":"false")<<"}\n";
            }else {
                const auto* method=findMethod(name);
                if(!method){std::cout<<"{\"found\":false}\n";continue;}
                if(action=="metadata") {
                    hier::protocol::JsonWriter w;
                    w.beginObject().key("found").value(true).key("clientMethod").value(method->clientName)
                     .key("allowsPartial").value(method->allowsPartial).key("cacheComplete").value(method->cacheComplete)
                     .key("params").value(method->params).key("response").value(method->response).endObject();
                    std::cout<<w.str()<<'\n';
                }else if(action=="normalize")std::cout<<json(method->normalize(row.at("value")))<<'\n';
                else throw std::runtime_error("unknown B replay action");
            }
        }
        return 0;
    }catch(const std::exception& error){std::cerr<<"B replay assembly: "<<error.what()<<'\n';return 1;}
}
