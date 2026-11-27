#include "MemoryTestConfigInput.h"
#include "MemoryLibraryInput.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::memory;size_t checks=0;
void need(bool b,const char *why){++checks;if(!b)throw std::runtime_error(why);}
std::string replace(std::string s,const std::string &from,const std::string &to){auto i=s.find(from);need(i!=std::string::npos,"mutation source");s.replace(i,from.size(),to);return s;}
const auto dir=std::filesystem::path(DFT_MEMORY_CONFIG_DIR);
}
int main()try {
 auto lib=loadMemoryLibrary(dir/"memory-test-schedule-library.json");need(bool(lib),"load models/costs");MemoryInvestigationRequest investigation;investigation.scope="schedule_top";investigation.recursive=true;investigation.mapping.models=lib->models;
 auto profiles=lib->testProfiles;std::ifstream file(dir/"memory-test-config.json");std::string bytes{std::istreambuf_iterator<char>(file),{}};
 auto loaded=loadMemoryTestConfig(dir/"memory-test-config.json",investigation,profiles);need(loaded&&loaded->schedule.rules&&loaded->schedule.rules->size()==5,"load rule config");
 auto parse=[&](const std::string &s){return parseMemoryTestConfig(s,investigation,profiles);};
 need(loaded->schedule.test.planning.policy.maxMemoriesPerController==64&&loaded->schedule.test.planning.policy.maxParallelMemories==2,"default plus explicit policy");
 need(loaded->schedule.scheduling.policy.maxPowerMicrowatts==300000&&loaded->timing.clocks[3].periodPicoseconds==4000,"scheduling and clocks");
 for(const auto &s:{replace(bytes,"\"formatVersion\": 1","\"formatVersion\": 1e0"),replace(bytes,"\"maxParallelMemories\": 2","\"maxParallelMemories\": 2.00"),replace(bytes,"\"periodPicoseconds\": 1000","\"periodPicoseconds\": 1e3")})need(bool(parse(s)),"exact integer spellings");
 const std::string minimal=R"({"formatVersion":1,"kind":"memory-test-config","assignments":[]})";
 auto defaults=parse(minimal);need(defaults&&!defaults->schedule.rules&&defaults->timing.clocks.empty()&&defaults->schedule.scheduling.policy.maxParallelControllers==4,"minimal assignments and defaults");
 for(const auto &s:{std::string("[]"),std::string("null"),bytes+"x",replace(bytes,"\"formatVersion\": 1","\"formatVersion\":2"),replace(bytes,"\"rules\": [","\"assignments\": [],\"rules\": ["),replace(bytes,"\"rules\": [","\"unexpected\": 0,\"rules\": ["),replace(minimal,"\"assignments\":[]","\"assignments\":null"),replace(bytes,"\"maxParallelMemories\": 2","\"maxParallelMemories\": 2.0000000000000001"),replace(bytes,"\"maxParallelMemories\": 2","\"maxParallelMemories\": true"),replace(bytes,"\"maxParallelMemories\": 2","\"maxParallelMemories\": 0"),replace(bytes,"\"maxParallelControllers\": 2","\"maxParallelControllers\": 1025"),replace(bytes,"\"periodPicoseconds\": 1000","\"periodPicoseconds\": 0"),replace(bytes,"\"periodPicoseconds\": 1000","\"periodPicoseconds\": 1000000000001"),replace(bytes,"\"waveOverheadPicoseconds\": 7","\"waveOverheadPicoseconds\": -1"),replace(bytes,"\"waveOverheadPicoseconds\": 7","\"maxDurationPicoseconds\": 9007199254740992"),replace(bytes,"\"waveOverheadPicoseconds\": 7","\"maxDurationPicoseconds\": 1e9999"),replace(bytes,"\"clockDomain\": \"b\"","\"clockDomain\": \"\\uD800\""),replace(bytes,"\"clockDomain\": \"b\"","\"clockDomain\": \"\\u0000\""),replace(bytes,"\"formatVersion\": 1","\"formatVersion\":1,\"f\\u006frmatVersion\":1"),bytes+std::string(1,char(0xff))}){auto bad=parse(s);need(!bad&&bad.error().code==hier::ErrorCode::BadRequest,"invalid input fails before analysis");}
 auto exact=bytes+std::string(1024*1024-bytes.size(),' ');need(bool(parse(exact)),"one MiB accepted");need(!parse(exact+" "),"over file cap rejected");
 need(!parseMemoryTestConfig(minimal,investigation,{}),"model costs required even empty assignment");auto invalid=investigation;invalid.scope="";need(!parseMemoryTestConfig(minimal,invalid,profiles),"validate borrowed investigation");
 std::stop_source stop;stop.request_stop();need(parseMemoryTestConfig("invalid",investigation,profiles,stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel parse");need(loadMemoryTestConfig("/absent-config",investigation,profiles,stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel before file IO");
 need(!loadMemoryTestConfig(dir,investigation,profiles),"reject directory");need(!loadMemoryTestConfig(dir/"absent-config",investigation,profiles),"reject missing file");
 investigation.scope="changed";investigation.mapping.models.clear();profiles.clear();bytes.clear();need(loaded->schedule.test.investigation.scope=="schedule_top"&&loaded->schedule.test.planning.profiles.size()==1&&loaded->schedule.test.investigation.mapping.models.size()==1,"request owns external values");
 hier::model::OpenOptions open;open.tops={"schedule_top"};open.files={dir/"memory-test-schedule.sv"};auto design=hier::Design::open(open);need(design&&design.value()->diagnostics(100).errorCount==0,"open actual RTL");auto report=timeMemoryTests(*design.value(),*loaded);need(report&&report->timeline.complete&&report->timeline.waves.size()==3&&report->timeline.durationPicoseconds==144021&&report->timeline.timedInstances==8,"configuration drives actual complete timeline");
 design.value().reset();loaded={hier::Error{hier::ErrorCode::Internal,"released"}};need(report->timeline.waves[1].endPicoseconds==112014,"owning report survives request and Design release");
 std::cout<<checks<<" memory test config assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
