#include "WrapperConfigInput.h"
#include "ChainPlanJson.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
namespace {
using namespace dft::wrapper;
size_t checks=0;
void need(bool ok,const char *why){++checks;if(!ok)throw std::runtime_error(why);}
std::string replace(std::string s,std::string_view from,std::string_view to) {
    const auto i=s.find(from);need(i!=std::string::npos,"mutation source");s.replace(i,from.size(),to);return s;
}
const std::filesystem::path dir=DFT_WRAPPER_CONFIG_DIR;
std::string wire(const ChainPlanReport &r){hier::protocol::JsonWriter w;writeChainPlan(w,r);return w.str();}
}
int main()try {
    const std::string minimal=R"({"formatVersion":1,"kind":"wrapper-config","mode":"boundary","boundary":{"scope":"chain_top"}})";
    auto parsed=parseWrapperConfig(minimal);need(parsed&&std::holds_alternative<BoundaryRequest>(*parsed),"boundary mode");
    need(std::get<BoundaryRequest>(*parsed).limits.maxWork==1000000,"boundary defaults");
    auto cells=parseWrapperConfig(replace(minimal,"boundary\"","cells\""));need(cells&&std::holds_alternative<CellPlanRequest>(*cells),"cells default mode");
    need(std::get<CellPlanRequest>(*cells).policy.maxInputCandidates==4,"cell defaults");
    std::ifstream f(dir/"wrapper-config.json");std::string bytes{std::istreambuf_iterator<char>(f),{}};
    auto loaded=loadWrapperConfig(dir/"wrapper-config.json");need(loaded&&std::holds_alternative<ChainPlanRequest>(*loaded),"load chain request");
    auto r=std::get<ChainPlanRequest>(*loaded);need(r.chains[0].capacity==4&&r.cells.boundary.ports.size()==2,"declarations loaded");
    for(const auto &s:{replace(minimal,"Version\":1","Version\":1.0"),replace(minimal,"Version\":1","Version\":1e0"),replace(bytes,"\"capacity\": 4","\"capacity\": 4.00")})need(bool(parseWrapperConfig(s)),"exact integer spellings");
    for(const auto &s:{std::string("[]"),std::string("null"),minimal+"x",replace(minimal,"Version\":1","Version\":2"),replace(minimal,"Version\":1","Version\":true"),replace(minimal,"Version\":1","Version\":1.0000000000000001"),replace(minimal,"Version\":1","Version\":1,\"f\\u006frmatVersion\":1"),replace(minimal,"wrapper-config","unknown"),replace(minimal,"boundary\"","unknown\""),replace(minimal,"chain_top",""),replace(minimal,"chain_top","\\u0000"),replace(minimal,"chain_top","\\uD800"),replace(minimal,"chain_top",std::string(4097,'x')),replace(minimal,"chain_top",std::string(2049*2,'x')),minimal+std::string(1,char(0xff)),replace(bytes,"\"capacity\": 4","\"capacity\": 9007199254740992"),replace(bytes,"\"capacity\": 4","\"capacity\": 0"),replace(bytes,"\"capacity\": 4","\"capacity\": -1"),replace(bytes,"\"capacity\": 4","\"capacity\": 1e9999"),replace(bytes,"\"defaultChain\": \"scan\"","\"defaultChain\": \"absent\""),replace(bytes,"\"ports\": [","\"ports\": null,\"unexpected\": [")}) {
        auto invalid=parseWrapperConfig(s);need(!invalid&&invalid.error().code==hier::ErrorCode::BadRequest,"strict invalid config");
    }
    auto exact=minimal+std::string(1048576-minimal.size(),' ');need(bool(parseWrapperConfig(exact)),"one MiB input");need(!parseWrapperConfig(exact+" "),"oversize");
    need(!loadWrapperConfig(dir),"directory rejected");need(!loadWrapperConfig(dir/"absent-config"),"missing rejected");need(!loadWrapperConfig(""),"empty path rejected");need(!loadWrapperConfig(std::string("x\0y",3)),"NUL path rejected");
    std::stop_source stop;stop.request_stop();need(parseWrapperConfig("bad",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel parse");need(loadWrapperConfig("/absent",stop.get_token()).error().code==hier::ErrorCode::Cancelled,"pre-cancel IO");
    bytes.clear();need(r.cells.boundary.scope=="chain_top"&&r.defaultChain=="scan","input ownership");
    hier::model::OpenOptions open;open.tops={"chain_top"};open.files={dir/"wrapper-chains.sv"};auto d=hier::Design::open(open);need(d&&d.value()->diagnostics(100).errorCount==0,"actual design");
    auto actual=planWrapperChains(*d.value(),r);need(actual&&actual->layout.complete&&actual->layout.counts.totalBits==4&&actual->layout.counts.reusedBits==4,"actual configured chain");
    ChainPlanRequest manual;manual.cells.boundary.scope="chain_top";manual.cells.boundary.ports={"q","alias_q"};manual.chains={{"scan",4}};manual.defaultChain="scan";
    auto expected=planWrapperChains(*d.value(),manual);need(expected&&wire(*actual)==wire(*expected),"same snapshot original API identical");
    auto original=wire(*actual);d.value().reset();r={};loaded=hier::Error{hier::ErrorCode::Internal,"released"};need(wire(*actual)==original,"owning report");
    std::cout<<checks<<" wrapper config assertions passed\n";return 0;
}catch(const std::exception &e){std::cerr<<e.what()<<'\n';return 1;}
