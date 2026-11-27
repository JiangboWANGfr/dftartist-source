// Deliberately overflows a signed integer, to prove UndefinedBehaviorSanitizer is active;
// see use_after_free.cpp.
#include <climits>
#include <cstdio>

int main(int argc, char**) {
    volatile int big = INT_MAX;
    int sum = big + argc;  // undefined behaviour
    std::printf("%d\n", sum);
    return 0;
}
