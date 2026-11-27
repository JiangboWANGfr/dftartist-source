import { SourceView, VIEWS_PROTOCOL_VERSION } from "@hier/views";
import { SourceNavigationModel, SelectionModel } from "@hier/viewmodel";
import { HierClient } from "@hier/client";
const version: 2 = VIEWS_PROTOCOL_VERSION;
void [SourceView, SourceNavigationModel, SelectionModel, HierClient, version];
