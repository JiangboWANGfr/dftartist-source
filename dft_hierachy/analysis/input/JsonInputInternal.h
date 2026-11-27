#pragma once
#include "hier/protocol/JsonDecode.h"
#include "hier/model/Result.h"
#include <filesystem>
#include <initializer_list>
namespace dft::analysis::input {
using Value=hier::protocol::JsonValue;
using Object=Value::Object;
[[noreturn]] inline void bad(const std::string &where,const std::string &why){throw hier::Error{hier::ErrorCode::BadRequest,where+": "+why};}
inline const Object &object(const Value &v,const std::string &where){const auto *p=std::get_if<Object>(&v.value);if(!p)bad(where,"expected object");return *p;}
inline void fields(const Object &o,const std::string &where,std::initializer_list<std::string_view> required,std::initializer_list<std::string_view> optional={}) {
    for(auto key:required)if(!o.contains(key))bad(where,"missing field "+std::string(key));
    for(const auto &[key,value]:o){(void)value;bool known=false;for(auto k:required)known=known||key==k;for(auto k:optional)known=known||key==k;if(!known)bad(where,"unknown field "+key);}
}
inline const Value::Array &array(const Value &v,const std::string &where,size_t min,size_t max){const auto *p=std::get_if<Value::Array>(&v.value);if(!p||p->size()<min||p->size()>max)bad(where,"array size/type outside allowed range");return *p;}
inline std::string text(const Value &v,const std::string &where){const auto *p=std::get_if<std::string>(&v.value);if(!p)bad(where,"expected string");return *p;}
inline uint64_t number(const Value &v,const std::string &where,uint64_t min,uint64_t max){const auto n=hier::protocol::jsonSafeInteger(v);if(!n||*n<0||uint64_t(*n)<min||uint64_t(*n)>max)bad(where,"expected exact integer in range");return uint64_t(*n);}
inline std::string at(const std::string &name,size_t i){return name+"["+std::to_string(i)+"]";}
Object decode(std::string_view,const std::string &label,hier::Cancel);
std::string readFile(const std::filesystem::path &,const std::string &label,hier::Cancel);
}
