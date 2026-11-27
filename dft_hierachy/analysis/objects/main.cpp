#include "../common/CliOutput.h"
#include "ObjectCatalogInternal.h"
#include "ObjectCatalogJson.h"
#include "hier/protocol/Json.h"
#include <charconv>
#include <iostream>
#include <set>
namespace {
using hier::protocol::JsonWriter;
using hier::protocol::write;
using namespace dft::objects;
struct Failure {std::string code,message;int exit;};
void bad(const char *message) {throw Failure{"invalid_arguments",message,2};}
template<class T> T take(hier::Result<T> r) {
    if(r) return std::move(r.value());
    const auto &e=r.error();
    switch(e.code) {
        case hier::ErrorCode::BadRequest:throw Failure{"invalid_arguments",e.message,2};
        case hier::ErrorCode::NotFound:throw Failure{"not_found",e.message,3};
        case hier::ErrorCode::Cancelled:throw Failure{"cancelled",e.message,130};
        default:throw Failure{"analysis_failed",e.message,5};
    }
}
uint64_t number(const std::string &text) {
    uint64_t value=0;const auto [end,error]=std::from_chars(text.data(),text.data()+text.size(),value);
    if(error!=std::errc{} || end!=text.data()+text.size()) bad("Expected an unsigned decimal integer");
    return value;
}

int run(int argc,char **argv) {
    if(argc==2 && std::string_view(argv[1])=="--version") {std::cout<<"{\"formatVersion\":1,\"algorithm\":\"rtl-object-catalog-v1\"}\n";return 0;}
    if(argc==2 && std::string_view(argv[1])=="--help") {
        std::cout<<"dft-objects --top TOP --scope INSTANCE [--recursive] FILE...\n"
            "  Inputs: FILE... | -f FILELIST | -F FILELIST; -I DIR; -D NAME[=VALUE]\n"
            "  --kind instance|port|signal (repeatable; default all three)\n"
            "  --text TEXT: literal case-sensitive name or canonical path substring\n"
            "  --max-instances 10000 --max-objects 100000 --max-queries 100000\n"
            "  --max-work 1000000 --max-millis 30000 --page-size 200\n"
            "  --require-complete: partial exit4; no SDC/Tcl/glob evaluation or physical cell inference\n";return 0;
    }
    hier::model::OpenOptions open;CatalogRequest request;bool requireComplete=false,explicitKinds=false;
    std::set<std::string> seen;
    for(int i=1;i<argc;++i) {
        const std::string arg=argv[i];
        if(!arg.empty()&&arg.front()!='-') {open.files.push_back(arg);continue;}
        if(arg!="-f"&&arg!="-F"&&arg!="-I"&&arg!="-D"&&arg!="--kind"&&!seen.insert(arg).second) bad("Duplicate option");
        if(arg=="--recursive") {request.recursive=true;continue;}
        if(arg=="--require-complete") {requireComplete=true;continue;}
        if(i+1>=argc) bad("Option needs a value");
        const std::string value=argv[++i];
        if(arg=="--top") open.tops.push_back(value);
        else if(arg=="--scope") request.scope=value;
        else if(arg=="--text") request.text=value;
        else if(arg=="-f") open.filelists.push_back(value);
        else if(arg=="-F") open.filelistsRelativeToFile.push_back(value);
        else if(arg=="-I") open.includeDirs.push_back(value);
        else if(arg=="-D") open.defines.push_back(value);
        else if(arg=="--kind") {
            if(!explicitKinds) {request.kinds.clear();explicitKinds=true;}
            if(value=="instance") request.kinds.push_back(Kind::Instance);
            else if(value=="port") request.kinds.push_back(Kind::Port);
            else if(value=="signal") request.kinds.push_back(Kind::Signal);
            else bad("Kind must be instance, port or signal");
        }
        else if(arg=="--max-instances") request.limits.maxInstances=number(value);
        else if(arg=="--max-objects") request.limits.maxObjects=number(value);
        else if(arg=="--max-queries") request.limits.maxQueries=number(value);
        else if(arg=="--max-work") request.limits.maxWork=number(value);
        else if(arg=="--max-millis") request.limits.maxMillis=number(value);
        else if(arg=="--page-size") request.limits.pageSize=number(value);
        else bad("Unknown option");
    }
    if(open.tops.size()!=1 || (open.files.empty()&&open.filelists.empty()&&open.filelistsRelativeToFile.empty())) bad("Provide inputs, one --top and explicit --scope");
    try {detail::validateCatalogRequest(request);} catch(const hier::Error &e) {throw Failure{"invalid_arguments",e.message,2};}
    auto design=take(hier::Design::open(open));
    if(design->diagnostics(1).errorCount || design->roots().empty()) throw Failure{"design_invalid","Design has compile errors or no top",3};
    const auto report=take(enumerateObjects(*design,request));JsonWriter writer(true);writeCatalog(writer,report);std::cout<<writer.str()<<'\n';std::cout.flush();
    if(!std::cout) throw Failure{"output_failed","Could not write object catalog",5};
    return requireComplete&&!report.complete?4:0;
}
}
static int mainWithoutOutput(int argc,char **argv) {
    try {return run(argc,argv);}
    catch(const Failure &e) {JsonWriter w;w.beginObject().key("formatVersion").value(1).key("error").beginObject().key("code").value(e.code).key("message").value(e.message).endObject().endObject();std::cout<<w.str()<<'\n';return e.exit;}
    catch(const std::exception &) {std::cout<<"{\"formatVersion\":1,\"error\":{\"code\":\"analysis_failed\",\"message\":\"Object catalog execution failed\"}}\n";return 5;}
}

int main(int argc, char **argv) {
    return dft::cli::withReportOutput(argc, argv, mainWithoutOutput, true);
}
