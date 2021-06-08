import {
  actions,
  assign,
  createMachine,
  GuardMeta,
  StateMachine,
} from "xstate";

export type DebounceContext<Contents> = {
  latestContents: Contents;
  error: string | undefined;
};

export type WriteEvent<T> = { type: "WRITE"; value: T };
export type DebounceEvent<T> =
  | { type: "FLUSH" }
  | WriteEvent<T>
  | { type: "SUCCESS" }
  | { type: "ERROR"; message: string };

const wasFlushDirtied = <T>(_ctx: DebounceContext<T>, _e: any, meta: GuardMeta<DebounceContext<T>, any>) =>
  (meta.state.value as any).FLUSHING == 'DIRTY'

export type Schema<T> = {
  value: "IDLE" | "DEBOUNCE" | "FLUSH";
  context: DebounceContext<T>;
};

export type DebouncerMachine<T> = StateMachine<DebounceContext<T>, Schema<T>, DebounceEvent<T>>

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
          invoke: {
            src: "flush",
            onDone:
              [{
                cond: wasFlushDirtied,
                target: "DEBOUNCE",
                actions: [assign({
                  error: (_ctx, _e) => undefined,
                }), 'onWrite'],
              },
              {
                actions: ['onWrite', assign({
                  error: (_ctx, _e) => undefined,
                })],
                target: "IDLE",
              }],
            onError: {
              actions:
                actions.pure((_context, event) => [
                  actions.raise({ type: "ERROR", message: event.data }),
                ]),
            },
          },
          initial: 'CLEAN',
          states: { CLEAN: {}, DIRTY: {} },
          on: {
            WRITE: {
              target: '.DIRTY',
              actions: "handleWrite",
              cond: "shouldWrite",
            },
            ERROR: {
              target: "DEBOUNCE",
              actions: assign({ error: (_ctx, e) => e.message })
            },
            SUCCESS: [{
              cond: wasFlushDirtied,
              target: "DEBOUNCE",
              /*actions: [assign({
                error: (_ctx, _e) => undefined,
              }), 'onWrite'],*/

            },
            {
              actions: assign({
                error: (_ctx, _e) => undefined,
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
        }),
      },
      guards: {
        shouldWrite: () => {
          return true;
        },
      },
    }
  );

export function mkWriteDebouncer<T>(initialContents: T): StateMachine<DebounceContext<T>, any, DebounceEvent<T>, Schema<T>> {
  return WriteDebouncer<T>().withContext({
    latestContents: initialContents,
    error: undefined,
  });
}
