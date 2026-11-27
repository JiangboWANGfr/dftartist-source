// Deliberately reads heap memory after freeing it. Built only in sanitizer builds; the
// test passes only if AddressSanitizer reports it, which proves the sanitizer is really
// active in this build and not just named on the command line.
//
// A use-after-free rather than an out-of-bounds read, because only AddressSanitizer can
// see it: GCC's UndefinedBehaviorSanitizer catches an out-of-bounds read first, which
// would leave AddressSanitizer itself unproven.
#include <cstdio>

int main(int argc, char**) {
    // Allocated with operator new, the way the project's own code allocates: this also
    // proves no replacement allocator is hiding C++ allocations from the sanitizer.
    int* volatile data = new int[4];
    for (int i = 0; i < 4; i++)
        data[i] = i + argc;
    delete[] data;
    std::printf("%d\n", data[1]);
    return 0;
}
