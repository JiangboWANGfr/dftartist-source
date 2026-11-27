// `union soft` is an IEEE 1800-2023 addition: slang rejects it with "language feature is not
// supported in version 1800-2017" and accepts it under 1800-2023. A construct the LEXER/PARSER
// gate on, so it proves the version reached them and not just the elaborator.
module probe;
  typedef union soft { logic [7:0] a; logic [3:0] b; } u_t;
  u_t u;
endmodule
