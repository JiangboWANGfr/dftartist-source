#include "JsonInputInternal.h"
#include <array>
#include <fstream>
namespace dft::analysis::input {
namespace {
void checkpoint(hier::Cancel c,const std::string &label){if(c.stop_requested()){auto message=label;message[0]=char(message[0]-'a'+'A');throw hier::Error{hier::ErrorCode::Cancelled,message+" loading cancelled"};}}
constexpr size_t maxBytes=1048576;
}
Object decode(std::string_view input,const std::string &label,hier::Cancel c) {
    checkpoint(c,label);if(input.size()>maxBytes)bad(label,"input exceeds 1 MiB");auto decoded=hier::protocol::decodeJsonObject(input);checkpoint(c,label);
    if(const auto *fault=std::get_if<hier::protocol::JsonDecodeFault>(&decoded)){
        constexpr std::array<const char *,5> names={"invalid_utf8","invalid_json","duplicate_key","depth_limit","non_object"};
        bad(label,std::string(names[static_cast<size_t>(fault->code)])+" at byte "+std::to_string(fault->byteOffset));
    }
    return std::get<Object>(std::move(decoded));
}
std::string readFile(const std::filesystem::path &path,const std::string &label,hier::Cancel c) {
    checkpoint(c,label);const auto name=path.string();if(name.empty()||name.find('\0')!=std::string::npos)bad(label+" path","empty or contains NUL");
    std::error_code error;if(!std::filesystem::is_regular_file(path,error)||error)bad(label+" path","expected readable regular file");
    std::ifstream file(path,std::ios::binary);if(!file)bad(label+" path","could not open file");std::string bytes;std::array<char,65536> chunk{};
    for(;;){checkpoint(c,label);file.read(chunk.data(),std::streamsize(chunk.size()));const auto count=file.gcount();if(count<0||file.bad()||(!file.eof()&&file.fail()))bad(label+" path","could not read file");
        const auto size=static_cast<size_t>(count);if(size>maxBytes-bytes.size())bad(label,"input exceeds 1 MiB");bytes.append(chunk.data(),size);if(file.eof())break;}
    checkpoint(c,label);return bytes;
}
}
