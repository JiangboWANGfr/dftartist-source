#pragma once
#include "SessionContract.h"
#include "hier/Design.h"

namespace hier::protocol::session {
ReplyFrame errorReply(uint64_t id, std::string_view code, std::string_view message,
                      const std::map<std::string, std::string> &data = {});
ReplyFrame errorReply(uint64_t id, const Error &error);
ReplyFrame execute(Design &, const Request &, Cancel);
} // namespace hier::protocol::session
