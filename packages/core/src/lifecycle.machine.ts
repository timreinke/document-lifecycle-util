import {
  actions,
  assign,
  createMachine,
  ServiceConfig,
  DoneInvokeEvent,
  spawn,
  ActorRefFrom,
  sendParent,
} from "xstate";

import { DebouncerMachine } from "./debouncer.machine";

export type DocLifecycleEvent =
  | { type: "LOAD" }
  | { type: "RETRY" }
  | { type: "EXIT" }
  | { type: "WRITE.DONE" };
export type DocLifecycleContext<T> = {
  href: string;
  contents?: T;
  error?: string;
  // TODO: limit to interface for actor that accepts WRITE events
  // it's irrelevant that this is a debouncer, what matters is that it accepts
  // writes
  persister?: ActorRefFrom<DebouncerMachine<T>>;
};

export let mkAppLifecycleMachine = <T>(
  load: ServiceConfig<DocLifecycleContext<T>, DocLifecycleEvent>,
  mkSaveMachine: (href: string, contents: T) => DebouncerMachine<T>
) => {
  return createMachine<DocLifecycleContext<T>, DocLifecycleEvent>({
    initial: "PRE_LOAD",
    on: {
      EXIT: { target: "STOPPED" },
    },
    states: {
      PRE_LOAD: {
        on: { LOAD: { target: "LOADING" } },
      },
      LOADING: {
        invoke: {
          id: "loader",
          src: load,
          onDone: {
            target: "RUNNING",
            actions: assign({
              contents: (_context: any, event: DoneInvokeEvent<any>) =>
                event.data,
            }) as any,
          },
          onError: {
            target: "WAIT_RETRY",
            actions: assign({ error: (_, event) => event.data }),
          },
        },
      },
      WAIT_RETRY: {
        entry: actions.send(
          { type: "RETRY" },
          {
            delay: 1000,
            id: "retry_timer",
          }
        ),
        on: { RETRY: "LOADING" },
      },
      RUNNING: {
        entry: assign({
          persister: (context, _event) =>
            spawn(mkSaveMachine(context.href, context.contents as T).withConfig({
              actions: {
                onWrite:
                  sendParent({ type: 'WRITE.DONE' })
              }
            }), {
              sync: true,
            }),
        }),
        on: {
          EXIT: [
            {
              target: "CLEANUP",
              cond: (ctx) => {
                return ctx.persister?.getSnapshot()?.value != "IDLE";
              },
            },
            { target: "STOPPED" },
          ],
        },
      },
      CLEANUP: {
        on: { "WRITE.DONE": { target: "STOPPED" } },
      },
      STOPPED: {
        type: "final",
        entry: assign({
          persister: (ctx) => {
            (ctx.persister as any).stop()
            return undefined
          }
        })
      },
    },
  });
};
