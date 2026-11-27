// Agent B compile-only consumer for C-70; never executed as runtime evidence.
// Uses only the proposed public declarations and ES2022 Error.cause.
import {
  SelectionModel,
  SelectionError,
  type Selection,
  type SelectionItem,
  type SelectionOptions,
  type SelectionOrigin,
} from "@hier/viewmodel";
import type { ObjectRef, DefRef, SnapshotId, Side } from "@hier/protocol-types";

declare const ref: ObjectRef;
declare const def: DefRef;
declare const snapshotId: SnapshotId;
declare const side: Side;
declare const externalCause: unknown;
const m = new SelectionModel({ snapshotId });

class Bits {
  get lsb(): number {
    return 0;
  }
  get width(): number {
    return 1;
  }
}
class ItemParent {
  get ref(): ObjectRef {
    return ref;
  }
}
class InheritedItem extends ItemParent {
  get bits(): Bits {
    return new Bits();
  }
  get side(): Side {
    return side;
  }
}
class InputParent {
  get snapshotId(): SnapshotId {
    return snapshotId;
  }
  get origin(): SelectionOrigin {
    return "source";
  }
}
class InheritedInput extends InputParent {
  get items(): readonly SelectionItem[] {
    return [new InheritedItem(), { def }];
  }
}
const inherited: Selection = new InheritedInput();
m.select(inherited);

const input: Selection = {
  get snapshotId() {
    return snapshotId;
  },
  get origin(): SelectionOrigin {
    try {
      m.select(inherited);
    } catch (error) {
      const unknownError: unknown = error;
      void unknownError;
    }
    return "tree";
  },
  get items(): readonly SelectionItem[] {
    const before: Selection = m.current;
    const back: boolean = m.canGoBack;
    const remove = m.subscribe(() => {});
    remove();
    void [before, back];
    return [
      {
        ref,
        get bits() {
          return new Bits();
        },
        get side() {
          return side;
        },
      },
    ];
  },
};
m.select(input);
m.select({
  snapshotId,
  origin: "external",
  get items(): readonly SelectionItem[] {
    m.dispose();
    throw externalCause;
  },
});
m.select({
  snapshotId,
  origin: "props",
  items: new Proxy<SelectionItem[]>([{ ref }], {
    get(target, key, receiver): unknown {
      return Reflect.get(target, key, receiver);
    },
    has(target, key): boolean {
      return Reflect.has(target, key);
    },
  }),
});

class OptionsParent {
  get snapshotId(): SnapshotId {
    return snapshotId;
  }
}
class InheritedOptions extends OptionsParent {
  get historyLimit(): number {
    return 1;
  }
}
const options: SelectionOptions = new InheritedOptions();
new SelectionModel(options);
new SelectionModel({
  get snapshotId(): SnapshotId {
    throw externalCause;
  },
  get historyLimit(): number {
    return 128;
  },
});
const local = new SelectionError("invalid_selection", "B diagnostic");
const standard: Error = local;
const preserved: unknown = standard.cause;
const property: unknown = local.cause;
void [preserved, property];
