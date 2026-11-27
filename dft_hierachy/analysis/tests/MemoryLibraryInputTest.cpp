#include "MemoryLibraryInput.h"
#include "MemoryTestPlanJson.h"
#include "hier/protocol/JsonDecode.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool b,const char *why){++checks;if(!b)throw std::runtime_error(why);}
std::string input(){std::ifstream f(DFT_MEMORY_LIBRARY_INPUT_FIXTURE,std::ios::binary);return {std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>()};}
std::string replace(std::string s,const std::string &from,const std::string &to){auto i=s.find(from);need(i!=std::string::npos,"test mutation has source token");s.replace(i,from.size(),to);return s;}
const std::string lib=R"(,"library":{"source":"declared-库","cells":[{"definitionName":"plan_ram","cell":{"pins":[{"name":"CLK","direction":"in","width":1},{"name":"A","direction":"in","width":3},{"name":"D","direction":"in","width":8},{"name":"Q","direction":"out","width":8}],"attrs":{"vendor":"example"}}}]})";
}
int main()try {
 auto bytes=input();auto result=loadMemoryLibrary(DFT_MEMORY_LIBRARY_INPUT_FIXTURE);need(result&&result->models.size()==2&&result->testProfiles.size()==2&&!result->library,"read reusable model/profile file");
 need(result->models[0].maskLaneBits==1&&result->testProfiles[0].operationsPerWord==2,"defaults and explicit costs");auto r=parseMemoryLibrary(bytes);need(r&&r->models[0].roles.size()==4,"parse owning values");
 auto withLib=bytes;withLib.insert(withLib.rfind('}'),lib);auto l=parseMemoryLibrary(withLib);need(l&&l->library&&l->library->cell("plan_ram")->pins[1].name=="A","optional pins retain order");
 need(l->library->cell("plan_ram")->attrs.at("dft.library.source")=="declared-库"&&l->library->cell("plan_ram")->attrs.at("vendor")=="example","source and attributes preserved");
 auto cell=l->library->cell("plan_ram");cell->pins[0].name="changed";need(l->library->cell("plan_ram")->pins[0].name=="CLK","provider remains immutable");
 for(const auto &s:{replace(bytes,"\"formatVersion\": 1","\"formatVersion\": 1e0"),replace(bytes,"\"words\": 8","\"words\": 8.000"),replace(bytes,"\"powerMicrowatts\": 120000","\"powerMicrowatts\": 12e4")})need(bool(parseMemoryLibrary(s)),"exact decimal integer forms accepted");
 for(const auto &s:{std::string("[]"),std::string("null"),std::string("{"),bytes+"x",replace(bytes,"\"formatVersion\": 1","\"formatVersion\": 2"),replace(bytes,"\"kind\": \"memory-library\"","\"kind\": \"other\""),replace(bytes,"\"words\": 8","\"words\": 8.0000000000000001"),replace(bytes,"\"words\": 8","\"words\": true"),replace(bytes,"\"words\": 8","\"words\": \"8\""),replace(bytes,"\"words\": 8","\"words\": 8, \"w\\u006frds\":8"),replace(bytes,"\"words\": 8","\"words\": 8, \"extra\":0"),replace(bytes,"\"words\": 8","\"words\": 1e999999"),replace(bytes,"\"dataBits\": 8","\"dataBits\": 65537"),replace(bytes,"\"definitionName\": \"plan_alt\"","\"definitionName\": \"plan_ram\""),replace(bytes,"\"pin\": \"Q\"","\"pin\": \"D\""),replace(bytes,"\"sense\": \"posedge\"","\"sense\": \"none\""),replace(bytes,"\"operationsPerWord\": 2","\"operationsPerWord\": 0"),replace(withLib,"\"direction\":\"in\"","\"direction\":\"bad\""),replace(withLib,"\"vendor\":\"example\"","\"dft.library.source\":\"forged\""),replace(withLib,"\"width\":1","\"width\":null"),replace(bytes,"\"plan_ram\"","\"\\uD800\""),replace(bytes,"\"plan_ram\"","\"\\u0000\""),bytes+std::string(1,char(0xff))}) {
  auto bad=parseMemoryLibrary(s);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"malformed or semantically invalid input rejected");
 }
 auto dup=parseMemoryLibrary(replace(bytes,"\"formatVersion\": 1","\"formatVersion\":1,\"formatVersion\":1"));need(!dup&&dup.error().message.find("duplicate_key at byte")!=std::string::npos,"offset/category diagnostic");
 auto deep=parseMemoryLibrary("{\"n\":"+std::string(128,'[')+"0"+std::string(128,']')+"}");
 need(!deep&&deep.error().message.find("depth_limit")!=std::string::npos,"bounded decoder depth");
 auto exact=bytes+std::string(memoryLibraryMaxBytes-bytes.size(),' ');need(bool(parseMemoryLibrary(exact)),"exact file byte limit");need(!parseMemoryLibrary(exact+" "),"one byte over limit");
 need(!loadMemoryLibrary("/missing-memory-library-input.json"),"missing path rejected");need(!loadMemoryLibrary(std::filesystem::path(DFT_MEMORY_LIBRARY_INPUT_FIXTURE).parent_path()),"directory rejected");
 std::stop_source stop;stop.request_stop();need(parseMemoryLibrary("invalid",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"parse pre-cancel");need(loadMemoryLibrary("/absent",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"load pre-cancel before IO");
 for(const auto &s:{"", " 1", "1 ", "nan", "1,\"x\":2", "{}", "1.1", "9007199254740991.1", "1e999999"})need(!hier::protocol::jsonSafeInteger(hier::protocol::JsonValue{hier::protocol::JsonNumber{s}}),"public exact-number helper safely rejects hand-built malformed tokens");
 need(hier::protocol::jsonSafeInteger(hier::protocol::JsonValue{hier::protocol::JsonNumber{"9007199254740991"}})==9007199254740991LL,"exact safe integer endpoint");
 need(hier::protocol::jsonSafeInteger(hier::protocol::JsonValue{hier::protocol::JsonNumber{"-0.0"}})==0,"exact signed zero");
 hier::model::OpenOptions open;open.tops={"plan_top"};open.files={DFT_MEMORY_TEST_PLAN_FIXTURE};open.library=l->library;auto d=hier::Design::open(open);need(d&&d.value()->diagnostics(100).errorCount==0,"open after parsed provider");
 MemoryTestRequest q;q.investigation.scope="plan_top.a0";q.investigation.mapping.models=result->models;q.planning.profiles=result->testProfiles;q.planning.assignments={{"plan_top.a0","test-domain",""}};auto planned=planMemoryTests(*d.value(),q);need(planned&&planned->plan.complete&&planned->plan.scheduledInstances==1&&planned->plan.controllers[0].cycles==16,"loaded model/profile drive actual planner");
 bytes.clear();withLib.clear();result={hier::Error{hier::ErrorCode::Internal,"released"}};d.value().reset();need(l->library->cell("plan_ram")->pins[0].name=="CLK"&&planned->plan.scheduledCapacityBits==64,"results own input/provider/plan after original release");
 std::cout<<checks<<" memory library input assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
