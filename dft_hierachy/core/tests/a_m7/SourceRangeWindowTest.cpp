#include "Source.h"
#include "SourceStream.h"
#include "Cursor.h"
#include "Observe.h"
#include "hier/protocol/Json.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <queue>
#include <set>
using namespace hier;
namespace baseline {
using detail::readCursor;
using detail::makeCursor;
using detail::cursorField;
// Frozen pre-optimization range scan and owning child-key projection, A
// compatibility reference only. It does not use the new stream/window.
const Error cancelled{ErrorCode::Cancelled, "source query cancelled"};
std::optional<size_t> referenceIndex(std::string_view ref, std::string_view prefix) {
    if (!ref.starts_with(prefix))
        return {};
    ref.remove_prefix(prefix.size());
    size_t index = 0;
    auto [end, ec] = std::from_chars(ref.data(), ref.data() + ref.size(), index);
    if (ref.empty() || ec != std::errc{} || end != ref.data() + ref.size())
        return {};
    return index;
}
Result<size_t> fileIndex(const db::SourceSnapshot &snapshot, std::string_view ref) {
    auto id = referenceIndex(ref, "f:");
    if (!id || *id >= snapshot.files.size() || ref != "f:" + std::to_string(*id))
        return Error{ErrorCode::NotFound, "source file is not in this snapshot"};
    return *id;
}

// Numeric reference identity; occurrence index has exactly InstKey DFS order.
// Only the selected page's identities are converted to SourceHit / strings.
using Identity = std::array<size_t, 4>; // definition/object, def/occurrence, i/p/s/x/r, local id
struct Stream {
    const db::SourceSequence *sequence;
    const std::vector<size_t> *occurrences = nullptr;
    std::optional<uint32_t> child;
    size_t kind = 0, local = 0;
    size_t size() const { return occurrences ? occurrences->size() : 1; }
    Identity identity(size_t position, const db::Occurrences &index) const {
        if (!occurrences)
            return {0, sequence->id, 0, 0};
        auto occurrence = (*occurrences)[position];
        if (child) {
            auto key = index.items[occurrence].key;
            key.push_back(*child);
            auto it = std::lower_bound(index.items.begin(), index.items.end(), key,
                [](const db::Occurrence &item, const auto &target) { return item.key < target; });
            occurrence = size_t(it - index.items.begin());
        }
        return {1, occurrence, kind, local};
    }
};
Stream streamFor(const db::SourceSequence &sequence, const db::Occurrences &index) {
    Stream stream{&sequence, nullptr, {}, 0, 0};
    using Owner = db::SourceSequence::Owner;
    if (sequence.owner == Owner::Definition)
        return stream;
    stream.occurrences = sequence.owner == Owner::Instances ? &index.byDefinition[sequence.id]
                                                           : &index.byBody[sequence.id];
    stream.kind = std::string_view("ipsxr").find(sequence.ref[0]);
    auto suffix = std::string_view(sequence.ref).substr(2);
    auto colon = suffix.find(':');
    auto child = suffix.substr(0, colon);
    if (!child.empty())
        stream.child = uint32_t(*referenceIndex(child, ""));
    if (colon != std::string_view::npos)
        stream.local = *referenceIndex(suffix.substr(colon+1), "");
    return stream;
}
std::string refFor(const Identity &id, const db::Occurrences &index) {
    if (id[0] == 0)
        return "d:" + std::to_string(id[1]);
    auto key = model::formatInstKey(index.items[id[1]].key);
    if (id[2] == 0)
        return "i:" + key;
    return std::string(1, "ipsxr"[id[2]]) + ":" + key + ":" + std::to_string(id[3]);
}
Result<model::QueryResult<Page<model::SourceHit>>>
resolveSource(const db::DesignDb &db, std::string_view ref, size_t line,
              std::optional<size_t> column, const PageRequest &page, Cancel cancel) {
    if (page.limit <= 0 || line == 0 || (column && *column == 0))
        return Error{ErrorCode::BadRequest, "source line, column and page limit must be positive"};
    std::string binding;
    for (const auto &field : {std::string(ref), std::to_string(line),
                             column ? std::to_string(*column) : std::string("none"), std::string("1")})
        cursorField(binding, field);
    auto cursor = readCursor(page.cursor, "source.resolve", db.snapshotId(), binding, 5);
    if (!cursor)
        return cursor.error();
    if (cancel.stop_requested())
        return cancelled;
    auto snapshot = db.sourceSnapshot(cancel);
    if (!snapshot)
        return snapshot.error();
    auto file = fileIndex(**snapshot, ref);
    if (!file)
        return file.error();
    const auto &input = (*snapshot)->files[*file];
    if (line > input.lines.size())
        return Error{ErrorCode::BadRequest, "source line is outside the snapshot file"};
    const auto begin = input.lines[line-1], end = input.lineEnds[line-1];
    if (column && *column - 1 > end - begin)
        return Error{ErrorCode::BadRequest, "source column is outside the snapshot line"};
    const auto point = begin + (column ? *column - 1 : 0);
    // A line query includes its newline bytes; an empty final line has no bytes.
    const auto lineEnd = line < input.lines.size() ? input.lines[line] : input.size;
    auto sources = db.sourceIndex(cancel);
    if (!sources)
        return sources.error();
    auto occurrences = db.occurrences(cancel);
    if (!occurrences)
        return occurrences.error();
    const auto &groups = (*sources)->groups;
    const auto &positions = **occurrences;
    if ((!page.cursor.empty() && (*cursor)[0] >= groups.size()) || (*cursor)[1] > 1 || (*cursor)[3] > 4)
        return Error{ErrorCode::BadRequest, "invalid source cursor position"};
    if (!page.cursor.empty() && groups[(*cursor)[0]].range.file != *file)
        return Error{ErrorCode::BadRequest, "source cursor does not identify a range in this file"};
    const Identity resume{(*cursor)[1], (*cursor)[2], (*cursor)[3], (*cursor)[4]};
    model::QueryResult<Page<model::SourceHit>> result;
    struct Candidate {
        Identity id;
        size_t stream, position;
        bool operator>(const Candidate &other) const { return id > other.id; }
    };
    for (size_t g = (*cursor)[0]; g < groups.size(); ++g) {
        if (cancel.stop_requested())
            return cancelled;
        const auto &group = groups[g];
        if (group.range.file != *file)
            continue;
        bool matches = column ? group.range.start <= point && point < group.range.end
                              : group.range.start < lineEnd && begin < group.range.end;
        if (!matches) {
            if (!page.cursor.empty() && g == (*cursor)[0])
                return Error{ErrorCode::BadRequest, "source cursor does not identify a matching range"};
            continue;
        }
        std::vector<Stream> streams;
        std::priority_queue<Candidate, std::vector<Candidate>, std::greater<Candidate>> heap;
        for (const auto &sequence : group.sequences) {
            if (cancel.stop_requested())
                return cancelled;
            auto stream = streamFor(sequence, positions);
            size_t low = 0, high = stream.size();
            if (!page.cursor.empty() && g == (*cursor)[0]) {
                while (low < high) {
                    auto mid = low + (high-low)/2;
                    if (stream.identity(mid, positions) < resume)
                        low = mid+1;
                    else
                        high = mid;
                }
            }
            if (low < stream.size())
                heap.push({stream.identity(low, positions), streams.size(), low});
            streams.push_back(std::move(stream));
        }
        if (!page.cursor.empty() && g == (*cursor)[0] && (heap.empty() || heap.top().id != resume))
            return Error{ErrorCode::BadRequest, "source cursor does not identify a hit"};
        std::optional<Identity> previous;
        while (!heap.empty()) {
            auto candidate = heap.top();
            heap.pop();
            auto &stream = streams[candidate.stream];
            const auto next = candidate.position + 1;
            if (next < stream.size())
                heap.push({stream.identity(next, positions), candidate.stream, next});
            if (previous && *previous == candidate.id)
                continue;
            previous = candidate.id;
            observation::emit({observation::Kind::SourceCandidate, g});
            if (cancel.stop_requested())
                return cancelled;
            if (result.result.items.size() == size_t(page.limit)) {
                const auto &id = candidate.id;
                result.result.next = makeCursor("source.resolve", db.snapshotId(), binding,
                                                {g, id[0], id[1], id[2], id[3]});
                return result;
            }
            observation::emit({observation::Kind::SourceHitMaterialize, g});
            if (cancel.stop_requested())
                return cancelled;
            model::SourceHit hit{refFor(candidate.id, positions), group.kind, (*snapshot)->span(group.range), {}};
            hit.refKind = candidate.id[0] == 0 ? model::SourceRefKind::Definition
                                              : model::SourceRefKind::Object;
            if (candidate.id[0] == 1)
                hit.inst = model::instRef(positions.items[candidate.id[1]].key);
            result.result.items.push_back(std::move(hit));
            observation::emit({observation::Kind::SourceHitEmit, g, result.result.items.size()});
            if (cancel.stop_requested())
                return cancelled;
        }
    }
    return result;
}

} // namespace baseline
namespace {
template<class T> std::string json(const T &value) {
    protocol::JsonWriter writer; protocol::write(writer,value); return writer.str();
}
struct Frontend final : frontend::Frontend {
    model::FrontendInfo info_;
    std::vector<model::TopInfo> tops_{{"first",0},{"second",0}};
    std::vector<model::DefInfo> defs_{{"root",model::DefKind::Module,"",0},{"leaf",model::DefKind::Module,"",0},{"missing",model::DefKind::Blackbox,"",0}};
    std::array<model::BodySkeleton,2> bodies;
    std::array<model::BodyConnections,2> facts;
    // SourceFileInput borrows bytes until Frontend destruction, just like L1.
    const std::array<std::string,5> texts{{"early\nfile\n", "ab\r\ncd\nef\n", "", "long lines\nwith spans\n", "last\n"}};
    std::vector<model::SourceFileInput> inputs;
    std::stop_source *stop = nullptr; // Borrowed existing Frontend boundary.
    Frontend() {
        for (const auto body : {model::BodyId(1),model::kNoBody,model::BodyId(1)}) {
            model::ChildSlot slot;slot.name="child";slot.body=body;
            slot.def=body==model::kNoBody?2U:1U;
            slot.kind=body==model::kNoBody?model::InstKind::Blackbox:model::InstKind::Module;
            slot.blackboxPins={"A"};bodies[0].slots.push_back(slot);
        }
        bodies[1].def=1;
        for (const auto &text : texts)
            inputs.push_back({"/source-window/"+std::to_string(inputs.size())+".sv",text});
        auto add=[&](std::string ref,model::SourceKind kind,size_t file,size_t start,size_t end) {
            facts[0].sources.push_back({std::move(ref),kind,{file,start,end}});
        };
        using K=model::SourceKind;
        add("i:0",K::Instantiation,0,2,10);add("p:0:0",K::Instantiation,0,2,10);
        add("i:1",K::Instantiation,1,0,2);add("p:1:0",K::Instantiation,1,0,2);
        add("s::0",K::Definition,1,1,6);add("s::1",K::Definition,1,4,6);
        add("s::2",K::Definition,1,6,6);add("x::0",K::Statement,1,2,8);
        add("i:2",K::Instantiation,3,0,3);add("s::0",K::Definition,2,0,0);
        add("s::0",K::Definition,1,1,6); // Exact duplicate sequence is deduplicated by original L2.
        for (auto &fact : facts) fact.estimatedBytes=1024;
    }
    const model::FrontendInfo &info() const override {return info_;}
    const std::vector<model::TopInfo> &tops() const override {return tops_;}
    const std::vector<model::DefInfo> &definitions() const override {return defs_;}
    size_t bodyCount() const override {return bodies.size();}
    model::Diagnostics diagnostics(size_t) const override {return {};}
    model::BodySkeleton skeleton(model::BodyId b) const override {return bodies.at(b);}
    model::BodyConnections connections(model::BodyId b) const override {
        if(stop)stop->request_stop();return facts.at(b);
    }
    std::vector<model::SourceFileInput> sourceFiles() const override {return inputs;}
    std::vector<std::optional<model::SourceRange>> definitionSources() const override {
        return {model::SourceRange{1,0,inputs[1].text.size()},model::SourceRange{3,0,inputs[3].text.size()},std::nullopt};
    }
};
void same(const Result<model::QueryResult<Page<model::SourceHit>>> &a,
          const Result<model::QueryResult<Page<model::SourceHit>>> &b) {
    REQUIRE(a.ok()==b.ok());if(a)CHECK(json(*a)==json(*b));else CHECK(json(a.error())==json(b.error()));
}
} // namespace

TEST_CASE("source child projection preserves original numeric lower_bound including missing keys", "[a-m7]") {
    db::Occurrences index;
    for (uint32_t top : std::array<uint32_t,3>{0,1,UINT32_MAX}) {
        index.items.push_back({{top},0,0,0});
        for(uint32_t parent=0;parent<32;++parent) {
            index.items.push_back({{top,parent},0,0,0});
            for(uint32_t child : std::array<uint32_t,5>{0,1,7,15,UINT32_MAX}) {
                index.items.push_back({{top,parent,child},0,0,0});
                index.items.push_back({{top,parent,child,0},0,0,0});
            }
        }
    }
    std::sort(index.items.begin(),index.items.end(),[](const auto &a,const auto &b){return a.key<b.key;});
    std::vector<size_t> parents;for(size_t i=0;i<index.items.size();++i)parents.push_back(i);
    db::SourceSequence sequence{db::SourceSequence::Owner::Body,0,"i:0"};
    detail::SourceStream stream{&sequence,&parents,{},3,17};
    for(uint32_t child : std::array<uint32_t,8>{0,1,2,7,8,15,1000,UINT32_MAX}) {
        stream.child=child;
        for(size_t p=0;p<parents.size();++p) {
            auto key=index.items[parents[p]].key;key.push_back(child);
            auto it=std::lower_bound(index.items.begin(),index.items.end(),key,[](const auto &item,const auto &k){return item.key<k;});
            CHECK(stream.identity(p,index)==detail::SourceIdentity{1,size_t(it-index.items.begin()),3,17});
        }
    }
    stream.child.reset();for(size_t p=0;p<parents.size();++p)CHECK(stream.identity(p,index)==detail::SourceIdentity{1,p,3,17});
    detail::SourceStream definition{&sequence,nullptr,{},0,0};CHECK(definition.size()==1);
    CHECK(definition.identity(0,index)==detail::SourceIdentity{0,0,0,0});
}

TEST_CASE("source file start windows equal the full original scan for overlaps CRLF and EOF", "[a-m7]") {
    model::QueryResult<Page<model::SourceHit>> retained;
    for(size_t cache : std::array<size_t,4>{0,1,128,64*1024*1024}) {
        db::DesignDb db(std::make_unique<Frontend>(),cache);auto snapshot=db.sourceSnapshot({});REQUIRE(snapshot);
        REQUIRE((*snapshot)->files.size()==5);
        for(size_t f=0;f<5;++f)CHECK((*snapshot)->files[f].lines.size()==std::array<size_t,5>{3,4,1,3,2}[f]);
        for(size_t f=0;f<(*snapshot)->files.size();++f) {
            const auto &file=(*snapshot)->files[f];const auto ref="f:"+std::to_string(f);
            for(size_t line=0;line<=file.lines.size()+1;++line)
                for(const auto col : std::vector<std::optional<size_t>>{std::nullopt,0,1,2,3,6,100}) {
                    std::string cursor;size_t pages=0;
                    do {
                        PageRequest page{cursor,std::array{1,7,3}[pages++%3]};
                        const auto expected=baseline::resolveSource(db,ref,line,col,page,{});
                        const auto actual=detail::resolveSource(db,ref,line,col,page,{});same(actual,expected);
                        if(!actual)break;cursor=actual->result.next;
                        if(!actual->result.items.empty())retained=*actual;
                        REQUIRE(pages<100);
                    }while(!cursor.empty());
                }
        }
        const auto known=detail::resolveSource(db,"f:0",1,3,{"",100},{});REQUIRE(known);
        std::vector<std::string> refs;for(const auto &hit:known->result.items)refs.push_back(hit.ref);
        CHECK(refs==std::vector<std::string>{"i:0.0","p:0.0:0","i:1.0","p:1.0:0"});
        const auto empty=detail::resolveSource(db,"f:2",1,{}, {},{});REQUIRE(empty);CHECK(empty->result.items.empty());
        const auto unused=detail::resolveSource(db,"f:4",1,{}, {},{});REQUIRE(unused);CHECK(unused->result.items.empty());
    }
    REQUIRE_FALSE(retained.result.items.empty());CHECK_FALSE(retained.result.items[0].span.contentHash.empty());
}

TEST_CASE("source windows preserve cursor range errors cancellation and retry", "[a-m7]") {
    db::DesignDb db(std::make_unique<Frontend>(),0);auto sources=db.sourceIndex({});REQUIRE(sources);
    std::string binding;for(const auto &field : {std::string("f:1"),std::string("1"),std::string("1"),std::string("1")})detail::cursorField(binding,field);
    for(size_t g=0;g<=(*sources)->groups.size();++g) {
        const auto cursor=detail::makeCursor("source.resolve",db.snapshotId(),binding,{g,0,0,0,0});
        same(detail::resolveSource(db,"f:1",1,1,{cursor,1},{}),baseline::resolveSource(db,"f:1",1,1,{cursor,1},{}));
    }
    auto first=detail::resolveSource(db,"f:1",2,1,{"",1},{});INFO((first ? "ok" : json(first.error())));REQUIRE(first);REQUIRE_FALSE(first->result.next.empty());
    same(detail::resolveSource(db,"f:1",2,1,{first->result.next,3},{}),baseline::resolveSource(db,"f:1",2,1,{first->result.next,3},{}));
    for(const auto ref : {"f:0","f:3","f:01","outside"})same(detail::resolveSource(db,ref,2,1,{first->result.next,3},{}),baseline::resolveSource(db,ref,2,1,{first->result.next,3},{}));
    std::stop_source stopped;stopped.request_stop();
    for(const PageRequest &page : std::array<PageRequest,3>{{{"",1},{"bad",1},{"",0}}})
        same(detail::resolveSource(db,"f:1",2,1,page,stopped.get_token()),baseline::resolveSource(db,"f:1",2,1,page,stopped.get_token()));
    REQUIRE(detail::resolveSource(db,"f:1",2,1,{first->result.next,3},{}));
    auto run=[](bool old){auto front=std::make_unique<Frontend>();std::stop_source stop;front->stop=&stop;db::DesignDb local(std::move(front),0);return old?baseline::resolveSource(local,"f:1",1,1,{},stop.get_token()):detail::resolveSource(local,"f:1",1,1,{},stop.get_token());};
    const auto old=run(true),current=run(false);REQUIRE_FALSE(old);REQUIRE_FALSE(current);CHECK(json(old.error())==json(current.error()));
}
