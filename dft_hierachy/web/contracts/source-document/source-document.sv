// A SourceDocument capability witness: copied before any mutation.
`include "source-document-leaf.svh"
module source_document_top(input logic a, output wire y);
  wire middle;
  source_document_leaf left(.a(a), .y(middle));
  source_document_leaf right(.a(middle), .y(y));
endmodule
