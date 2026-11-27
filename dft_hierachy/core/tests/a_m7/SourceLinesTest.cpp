// Original scalar loop is an A compatibility reference; literal line-map KATs
// below are independent expected values, not a new B oracle.
#include "SourceLines.h"
#include "hier/db/DesignDb.h"
#include <catch2/catch_test_macros.hpp>
#include <array>
#include <cstdint>
#include <memory>
#include <string_view>
using namespace hier;
namespace {
bool original(std::string_view bytes,std::vector<size_t> &starts,std::vector<size_t> &ends,Cancel cancel={}) {
    for(size_t i=0;i<bytes.size();++i){
        if((i%65536)==0&&cancel.stop_requested())return false;
        if(bytes[i]=='\r'||bytes[i]=='\n'){
            ends.push_back(i);
            if(bytes[i]=='\r'&&i+1<bytes.size()&&bytes[i+1]=='\n')++i;
            starts.push_back(i+1);
        }
    }
    ends.push_back(bytes.size());return true;
}
void same(std::string_view bytes,Cancel cancel={}) {
    std::vector<size_t> starts{0},ends,expectedStarts{0},expectedEnds;
    CHECK(db::detail::indexSourceLines(bytes,starts,ends,cancel)==original(bytes,expectedStarts,expectedEnds,cancel));
    CHECK(starts==expectedStarts);CHECK(ends==expectedEnds);CHECK(starts.capacity()==expectedStarts.capacity());CHECK(ends.capacity()==expectedEnds.capacity());
}
struct State {
    std::vector<std::pair<std::string,std::string>> files{{"/lines/0.sv","a\r\n\xe6\xb1\x89\n"},{"/lines/1.sv",""},{"/lines/2.sv",std::string(65535,'x')+"\r\nlast\r"}};
    std::stop_source stop;
    bool stopDefinitions=false;
    size_t sourceCalls=0;
};
struct Frontend final:frontend::Frontend {
    std::shared_ptr<State> state;
    model::FrontendInfo identity;
    std::vector<model::TopInfo> roots;
    std::vector<model::DefInfo> defs{{"fake",model::DefKind::Module,"/lines/0.sv",1}};
    explicit Frontend(std::shared_ptr<State> value):state(std::move(value)){}
    const model::FrontendInfo &info() const override{return identity;}
    const std::vector<model::TopInfo> &tops() const override{return roots;}
    const std::vector<model::DefInfo> &definitions() const override{return defs;}
    size_t bodyCount() const override{return 0;}
    model::BodySkeleton skeleton(model::BodyId) const override{return {};}
    model::BodyConnections connections(model::BodyId) const override{return {};}
    model::Diagnostics diagnostics(size_t) const override{return {};}
    std::vector<model::SourceFileInput> sourceFiles() const override {
        ++state->sourceCalls;std::vector<model::SourceFileInput> out;for(const auto &[p,s]:state->files)out.push_back({p,s});return out;
    }
    std::vector<std::optional<model::SourceRange>> definitionSources() const override {
        if(state->stopDefinitions)state->stop.request_stop();return {model::SourceRange{0,0,state->files[0].second.size()}};
    }
};
}
TEST_CASE("A source line maps retain literal CR LF and byte-coordinate KATs", "[a-source-lines]") {
    struct Kat {std::string bytes;std::vector<size_t> starts,ends;};
    for(const auto &kat:std::vector<Kat>{{"",{0},{0}},{"a",{0},{1}},{"\r\n",{0,2},{0,2}},{"a\r\nb",{0,3},{1,4}},{"\n\r",{0,1,2},{0,1,2}},{"a\rb\nc\r\nd",{0,2,4,7},{1,3,5,8}},{"a\n\n",{0,2,3},{1,2,3}},{"\xe6\xb1\x89\r\n\xc3\xa9",{0,5},{3,7}}}){
        std::vector<size_t> starts{0},ends;REQUIRE(db::detail::indexSourceLines(kat.bytes,starts,ends,{}));CHECK(starts==kat.starts);CHECK(ends==kat.ends);
        db::SourceFile file{"","",kat.bytes.size(),starts,ends};for(size_t line=0;line<starts.size();++line){auto p=file.position(starts[line]);CHECK(p.line==line+1);CHECK(p.column==1);CHECK(p.offset==starts[line]);}
    }
}
TEST_CASE("A line scanner matches original scalar combinations and block boundaries", "[a-source-lines]") {
    for(size_t n=0;n<=9;++n){size_t count=1;for(size_t i=0;i<n;++i)count*=3;
        for(size_t bits=0;bits<count;++bits){std::string s(n,'a');auto value=bits;for(auto &c:s){c=std::string_view("a\r\n")[value%3];value/=3;}same(s);}}
    for(size_t width:std::array<size_t,9>{1,2,7,15,16,17,79,127,65536})for(size_t n:std::array<size_t,12>{0,1,127,128,4095,65534,65535,65536,65537,131071,131072,131073}){
        std::string s(n,'x');for(size_t i=width-1;i<n;i+=width)s[i]=(i/width)%2?'\r':'\n';same(s);
        for(size_t at:std::array<size_t,6>{0,15,16,65534,65535,65536})if(at<=s.size()){auto c=s;c.insert(at,"\r\n");same(c);}
    }
    for(uint32_t seed=0;seed<32;++seed){
        uint32_t random=seed+1;std::string s(131073+seed,'x');
        for(size_t i=0;i<s.size();i+=257)s[i]=char((i/257)%2?0:255);
        for(size_t i=17;i+1<s.size();){random=random*1664525U+1013904223U;s[i]=(random&1)?'\r':'\n';if((random&7)==0)s[i+1]='\n';i+=17+random%240;}
        same(s);s.replace(s.size()-127,127,std::string(127,'\r'));same(s);
    }
    std::stop_source stop;stop.request_stop();for(const auto &s:std::vector<std::string>{"","x","\r\n",std::string(131073,'x')}){same(s,stop.get_token());same(s);}
}
TEST_CASE("A source snapshots discard cancelled builders and own complete line metadata", "[a-source-lines]") {
    auto state=std::make_shared<State>();std::shared_ptr<const db::SourceSnapshot> retained;std::vector<std::string> hashes;
    for(const auto &file:state->files)hashes.push_back(db::sourceHash(file.second,{}).value());
    {
        db::DesignDb db(std::make_unique<Frontend>(state),0);CHECK(state->sourceCalls==1);state->stopDefinitions=true;
        auto failed=db.sourceSnapshot(state->stop.get_token());REQUIRE_FALSE(failed);CHECK(failed.error().code==ErrorCode::Cancelled);CHECK(failed.error().message=="source snapshot cancelled");CHECK(state->sourceCalls==2);
        state->stopDefinitions=false;state->stop=std::stop_source{};auto ready=db.sourceSnapshot(state->stop.get_token());REQUIRE(ready);retained=*ready;CHECK(state->sourceCalls==3);
        auto cached=db.sourceSnapshot();REQUIRE(cached);CHECK(*cached==retained);CHECK(state->sourceCalls==3);
        for(size_t i=0;i<state->files.size();++i){std::vector<size_t> starts{0},ends;original(state->files[i].second,starts,ends);CHECK(retained->files[i].lines==starts);CHECK(retained->files[i].lineEnds==ends);CHECK(retained->files[i].hash==hashes[i]);}
    }
    state.reset();CHECK(retained->files.size()==3);CHECK(retained->files[2].lines==std::vector<size_t>{0,65537,65542});CHECK(retained->files[2].hash==hashes[2]);
    auto span=retained->span({0,3,6});CHECK(span.start.line==2);CHECK(span.start.column==1);CHECK(span.end.line==2);CHECK(span.end.column==4);CHECK(span.contentHash==hashes[0]);
}
