#include "SourceGroups.h"
#include <catch2/catch_test_macros.hpp>
#include <algorithm>
#include <array>
#include <map>
#include <tuple>
using namespace hier;
namespace {
struct Record {model::SourceRange range;model::SourceKind kind;db::SourceSequence sequence;};
using Key=std::tuple<size_t,size_t,size_t,model::SourceKind>;
auto key(const Record &r){return Key{r.range.file,r.range.start,r.range.end,r.kind};}
auto identity(const db::SourceSequence &s){return std::tie(s.owner,s.id,s.ref);}
auto values(const std::vector<db::SourceSequence> &s){std::vector<std::tuple<db::SourceSequence::Owner,size_t,std::string>> v;for(const auto &x:s)v.emplace_back(x.owner,x.id,x.ref);return v;}
bool order(std::vector<db::SourceSequence> &s,size_t,Cancel){std::sort(s.begin(),s.end(),[](const auto &a,const auto &b){return identity(a)<identity(b);});s.erase(std::unique(s.begin(),s.end(),[](const auto &a,const auto &b){return identity(a)==identity(b);}),s.end());return true;}
void same(const std::vector<Record> &input){
 // Full original map grouping is an A compatibility reference, not B oracle.
 std::map<Key,std::vector<db::SourceSequence>> expected;db::detail::SourceGroups actual;
 for(const auto &r:input){expected[key(r)].push_back(r.sequence);actual.add(r.range,r.kind,r.sequence);}
 std::vector<db::SourceGroup> out;size_t group=0;auto old=expected.begin();
 REQUIRE(actual.finish(out,{},[&](auto &sequences,size_t ordinal,Cancel cancel){
  REQUIRE(old!=expected.end());CHECK(ordinal==group++);CHECK(values(sequences)==values(old->second));CHECK(sequences.capacity()==old->second.capacity());
  order(old->second,ordinal,cancel);++old;return order(sequences,ordinal,cancel);
 }));REQUIRE(out.size()==expected.size());old=expected.begin();
 for(const auto &g:out){CHECK(Key{g.range.file,g.range.start,g.range.end,g.kind}==old->first);CHECK(values(g.sequences)==values(old->second));CHECK(g.sequences.capacity()==old->second.capacity());++old;}
}
}
TEST_CASE("A source group ordering retains literal range kind and sequence identities", "[a-source-groups]"){
 using Owner=db::SourceSequence::Owner;using Kind=model::SourceKind;
 db::detail::SourceGroups groups;
 groups.add({1,7,9},Kind::Statement,{Owner::Body,9,"s::10"});
 groups.add({0,7,9},Kind::Instantiation,{Owner::Instances,3,"i:"});
 groups.add({0,7,9},Kind::Definition,{Owner::Body,2,"s::2"});
 groups.add({0,7,9},Kind::Definition,{Owner::Definition,4,""});
 groups.add({0,7,9},Kind::Definition,{Owner::Body,2,"s::10"});
 groups.add({0,7,9},Kind::Definition,{Owner::Definition,4,""});
 groups.add({0,2,9},Kind::Statement,{Owner::Body,0,"x::0"});
 std::vector<db::SourceGroup> out;REQUIRE(groups.finish(out,{},order));REQUIRE(out.size()==4);
 CHECK(out[0].range.file==0);CHECK(out[0].range.start==2);CHECK(out[0].kind==Kind::Statement);
 CHECK(out[1].kind==Kind::Definition);CHECK(values(out[1].sequences)==std::vector<std::tuple<Owner,size_t,std::string>>{{Owner::Definition,4,""},{Owner::Body,2,"s::10"},{Owner::Body,2,"s::2"}});
 CHECK(out[2].kind==Kind::Instantiation);CHECK(out[3].range.file==1);CHECK(out[3].kind==Kind::Statement);
}
TEST_CASE("A source grouping matches full original map across ordering and duplicate shapes", "[a-source-groups]"){
 using Owner=db::SourceSequence::Owner;using Kind=model::SourceKind;
 same({});
 for(size_t n:std::array<size_t,10>{1,2,3,15,16,17,127,128,1024,16384})for(size_t shape=0;shape<5;++shape){
  std::vector<Record> input;uint32_t random=17;
  for(size_t i=0;i<n;++i){random=random*1664525U+1013904223U;auto position=shape==0?i:shape==1?n-i:shape==2?size_t(7):size_t(random%std::max(size_t(1),n/3));
   input.push_back({{shape==4?i%3:0,position,position+1+i%2},Kind(i%3),{Owner(i%3),i%17,i%2?"s::2":"s::10"}});
   if(i%5==0)input.push_back(input.back());
  }
  same(input);
 }
 std::vector<Record> contiguous;
 for(size_t i=0;i<2048;++i)contiguous.push_back({{0,10,20},Kind::Statement,{Owner::Body,i%17,"s::"+std::to_string(i%29)}});
 same(contiguous);
 contiguous.insert(contiguous.begin()+1024,{{0,1,2},Kind::Definition,{Owner::Definition,0,""}});same(contiguous);

}
TEST_CASE("A source grouping cancellation keeps unfinished local output disposable", "[a-source-groups]"){
 using Owner=db::SourceSequence::Owner;using Kind=model::SourceKind;
 for(bool reverse:{false,true}){
  db::detail::SourceGroups groups;for(size_t i=0;i<100;++i){auto start=reverse?100-i:i;groups.add({0,start,start+1},Kind::Definition,{Owner::Definition,i,""});}
  std::stop_source stop;stop.request_stop();std::vector<db::SourceGroup> out;CHECK_FALSE(groups.finish(out,stop.get_token(),order));CHECK(out.empty());
 }
 db::detail::SourceGroups groups;groups.add({0,1,2},Kind::Definition,{Owner::Definition,0,""});groups.add({0,2,3},Kind::Definition,{Owner::Definition,1,""});
 std::stop_source stop;std::vector<db::SourceGroup> local;CHECK_FALSE(groups.finish(local,stop.get_token(),[&](auto &s,size_t g,Cancel c){auto result=order(s,g,c);stop.request_stop();return result;}));CHECK(local.size()==1);
 // A fresh builder owns fresh values after a failed local attempt.
 same({{{0,1,2},Kind::Definition,{Owner::Definition,0,""}},{{0,2,3},Kind::Definition,{Owner::Definition,1,""}}});
 std::vector<db::SourceGroup> retained;
 {db::detail::SourceGroups scoped;scoped.add({3,5,11},Kind::Statement,{Owner::Body,7,"x::"+std::string(200,'9')});REQUIRE(scoped.finish(retained,{},order));}
 REQUIRE(retained.size()==1);CHECK(retained[0].range.file==3);CHECK(retained[0].sequences[0].ref=="x::"+std::string(200,'9'));
}
