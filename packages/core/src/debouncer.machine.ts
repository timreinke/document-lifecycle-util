import {
  actions,
  assign,
  createMachine,
} from "xstate";

type DebounceContext<Contents> = {
  latestContents: Contents;
  dirty: boolean;
  error: string | undefined;
};

export type WriteEvent<T> = { type: "WRITE"; value: T };
export type DebounceEvent<T> =
  | { type: "FLUSH" }
  | WriteEvent<T>
  | { type: "SUCCESS" }
  | { type: "ERROR"; message: string };

const isDirty = <T>(ctx: DebounceContext<T>, _e: DebounceEvent<T>, meta) => ctx.dirty;

type Schema<T> = {
  value: "IDLE" | "DEBOUNCE" | "FLUSHING";
  context: DebounceContext<T>;
};

export let WriteDebouncer = <T>() =>
  createMachine<DebounceContext<T>, DebounceEvent<T>, Schema<T>>(
    {
      id: "debouncer",
      initial: "IDLE",
      states: {
        IDLE: {
          on: {
            WRITE: {
              actions: "handleWrite",
              target: "DEBOUNCE",
              cond: "shouldWrite",
            },
          },
        },
        DEBOUNCE: {
          on: {
            WRITE: {
              target: "DEBOUNCE",
              actions: "handleWrite",
              cond: "shouldWrite",
            },
          },
          after: {
            DEBOUNCE_TIME: { target: "FLUSHING" },
          },
        },
        FLUSHING: {
            entry: assign({dirty: (_ctx, _e) => false})
            ,
          invoke: {
            src: "flush",
            onDone: 
              {
                actions: actions.raise({ type: "SUCCESS" }),
              }
            
            ,
            onError: {
              actions:
                actions.pure((context, event) => [
                  actions.raise({ type: "ERROR", message: event.data }),
                ]),
            },
          },
          on: {
            WRITE: {
              actions: "handleWrite",
              cond: "shouldWrite",
            },
            ERROR: {
              target: "DEBOUNCE",
              actions: assign({error: (ctx, e) => e.message})
            },
            SUCCESS: [{
                target: "DEBOUNCE",
                actions: assign({
                    error: (ctx, e) => undefined,
                  }),    
                cond: isDirty,
              },
              {
              actions: assign({
                error: (ctx, e) => undefined,
                dirty: (_ctx, _e) => false,
              }),
              target: "IDLE",
            }],
          },
        },
      },
    },
    {
      actions: {
        handleWrite: assign({
          latestContents: (_ctx, e: DebounceEvent<T>) =>
            (e as WriteEvent<T>).value,
          dirty: (_ctx, _e) => true,
        }),
      },
      guards: {
        shouldWrite: (_ctx, _e, meta) => {
          console.log(meta);
          return true;
        },
      },
    }
  );

export function mkWriteDebouncer<T>(initialContents: T) {
  return WriteDebouncer<T>().withContext({
    latestContents: initialContents,
    dirty: false,
    error: undefined,
  });
}
