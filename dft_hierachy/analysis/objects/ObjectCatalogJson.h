#pragma once
#include "ObjectCatalog.h"
#include "hier/protocol/Json.h"
namespace dft::objects {
void writeCatalog(hier::protocol::JsonWriter &,const ObjectCatalog &);
}
