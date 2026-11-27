#include "PinLibrary.h"
#include "../common/Utf8.h"
#include <array>
#include <set>
namespace dft::memory {
namespace {
constexpr std::array<std::string_view,5> directions={"in","out","inout","ref","unknown"};
constexpr std::string_view sourceKey="dft.library.source";
void require(bool ok,const char *message) {
    if(!ok)throw hier::Error{hier::ErrorCode::BadRequest,message};
}
void cancelled(hier::Cancel c) {
    if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Library construction cancelled"};
}
class Validation {
    uint64_t bytes_=0;
    hier::Cancel cancel_;
public:
    explicit Validation(hier::Cancel c):cancel_(c){}
    void text(const std::string &s,size_t cap,bool empty=false) {
        cancelled(cancel_);
        require((empty||!s.empty())&&s.size()<=cap&&s.find('\0')==std::string::npos&&dft::detail::validUtf8(s),"Invalid library text");
        require(s.size()<=8*1024*1024-bytes_,"Library text exceeds 8 MiB");bytes_+=s.size();
    }
    void attrs(const std::map<std::string,std::string> &a) {
        require(a.size()<=32,"Too many library attributes");
        for(const auto &[k,v]:a){text(k,256);text(v,4096,true);}
    }
};
}
std::string_view libraryDirectionName(hier::model::Direction d) {
    const auto index=static_cast<size_t>(d);return index<directions.size()?directions[index]:std::string_view{};
}
std::optional<hier::model::Direction> parseLibraryDirection(std::string_view d) {
    for(size_t i=0;i<directions.size();++i)if(directions[i]==d)return static_cast<hier::model::Direction>(i);
    return {};
}
hier::Result<std::shared_ptr<const PinLibrary>> PinLibrary::create(const LibraryDeclaration &input,hier::Cancel c) try {
    cancelled(c);Validation validate(c);validate.text(input.source,4096);
    require(!input.cells.empty()&&input.cells.size()<=256,"Library requires 1..256 cells");
    size_t pins=0;
    for(const auto &[name,cell]:input.cells) {
        validate.text(name,4096);validate.attrs(cell.attrs);
        require(!cell.attrs.contains(std::string(sourceKey)),"Reserved library source attribute");
        require(!cell.pins.empty()&&cell.pins.size()<=256,"Library cell requires 1..256 pins");
        require(cell.pins.size()<=16384-pins,"Too many library pins");pins+=cell.pins.size();
        std::set<std::string> names;
        for(const auto &pin:cell.pins) {
            validate.text(pin.name,4096);validate.attrs(pin.attrs);
            require(names.insert(pin.name).second,"Duplicate library pin");
            require(!libraryDirectionName(pin.dir).empty(),"Invalid library direction");
            require(pin.width&&*pin.width>=1&&*pin.width<=65536,"Library pin width must be 1..65536");
        }
    }
    LibraryDeclaration owned;owned.source=input.source;
    for(const auto &[name,cell]:input.cells) {
        cancelled(c);auto copy=cell;copy.attrs.emplace(sourceKey,input.source);owned.cells.emplace(name,std::move(copy));
    }
    cancelled(c);return std::shared_ptr<const PinLibrary>(new PinLibrary(std::move(owned)));
}catch(const hier::Error &e){return e;}
std::optional<hier::model::CellInfo> PinLibrary::cell(std::string_view name) const {
    auto it=declaration_.cells.find(std::string(name));
    if(it==declaration_.cells.end())return {};
    return it->second;
}
}
