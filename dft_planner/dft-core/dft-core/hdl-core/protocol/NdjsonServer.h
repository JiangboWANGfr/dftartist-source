#pragma once
#include <string>
#include <utility>
#include <vector>

namespace hdl::service {
class DesignDb;
}

namespace hdl::protocol {

// The startup "ready" event line: {"id":null,"event":"ready","candidateTops":[...],"defCount":N}
std::string readyEventLine(hdl::service::DesignDb& db);

// One-shot query (CLI): run a method with string params, return the result-object JSON.
// Throws on dispatch errors. params values are treated as JSON strings.
std::string runQuery(hdl::service::DesignDb& db, const std::string& method,
                     const std::vector<std::pair<std::string, std::string>>& params);

// CLI `roots`: JSON array of candidate tops (ranked, with subtreeSize).
std::string candidateTopsJson(hdl::service::DesignDb& db);

// Handle one NDJSON request line; returns the response line (no trailing newline).
std::string handleRequest(hdl::service::DesignDb& db, const std::string& line);

// Run the daemon: emit ready, then loop over stdin requests writing responses to stdout.
int runStdioServer(hdl::service::DesignDb& db);

}  // namespace hdl::protocol
