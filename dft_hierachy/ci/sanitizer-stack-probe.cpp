// Compiler regression probe for GCC r13-9350. No Core or B oracle dependency.
// A single live frame must remain detectable after many sequential calls;
// missing generated flag cleanup exhausts the fake stack and loses UAR
// coverage.
#include <cstdio>
#include <sanitizer/asan_interface.h>
__attribute__((noinline)) bool hasFakeFrame(int input) {
  int local = input;
  void *begin = nullptr;
  void *end = nullptr;
  return __asan_addr_is_in_fake_stack(__asan_get_current_fake_stack(), &local,
                                      &begin, &end) != nullptr;
}
int main() {
  constexpr int calls = 65536;
  int fake = 0;
  for (int i = 0; i < calls; ++i)
    fake += hasFakeFrame(i) ? 1 : 0;
  std::printf("fake_stack_calls=%d total_calls=%d\n", fake, calls);
  return fake == calls ? 0 : 1;
}
