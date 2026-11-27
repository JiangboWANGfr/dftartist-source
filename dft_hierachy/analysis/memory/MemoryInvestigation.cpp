#include "MemoryInvestigationInternal.h"
#include "MacroInterfacesInternal.h"
#include "MemoryMapInternal.h"
namespace dft::memory {
namespace {
void checkpoint(hier::Cancel c) {
    if(c.stop_requested())throw hier::Error{hier::ErrorCode::Cancelled,"Memory investigation cancelled"};
}
template<class T> T take(hier::Result<T> result) {
    if(!result)throw result.error();
    return std::move(result.value());
}
}
MacroRequest detail::prepareMemoryInvestigation(const MemoryInvestigationRequest &r) {
    detail::validateMemoryMapRequest(r.mapping);
    MacroRequest request;
    request.scope=r.scope;request.recursive=r.recursive;request.clockPins=r.clockPins;
    request.traversal=r.traversal;request.limits=r.interfaces;
    for(const auto &model:r.mapping.models)request.definitionNames.push_back(model.definitionName);
    detail::validateMacroRequest(request);
    return request;
}
hier::Result<MemoryInvestigation> investigateMemories(hier::Design &design,
    const MemoryInvestigationRequest &request,hier::Cancel c) try {
    checkpoint(c);
    const auto macro=detail::prepareMemoryInvestigation(request);
    checkpoint(c);
    MemoryInvestigation out;
    out.interfaces=take(inspectMacroInterfaces(design,macro,c));
    checkpoint(c);
    out.mapping=take(mapMemories(out.interfaces,request.mapping,c));
    checkpoint(c);
    return out;
}catch(const hier::Error &e){return e;}
}
