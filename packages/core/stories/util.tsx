import { assign, createMachine, interpret, InterpreterFrom, PayloadSender, State, StateFrom } from "xstate";
import { useSelector, useService } from "@xstate/react";
import { produce } from "immer";
import React from "react";


import { WriteDebouncer } from "../src/debouncer.machine";

export let database = createMachine({
    id: "database",
    initial: "running",
    context: {
      data: {},
    },
    states: {
      running: {
        on: {
          WRITE: {
            actions: assign({
              data: ((ctx: any, event: any) => {
                return produce(ctx.data, (draft) => {
                  draft[event.key] = event.value;
                });
              }) as any,
            }),
          },
        },
      },
    },
  });


export let stringOutputDebouncer = WriteDebouncer<string>();

/* let DebouncerServiceContext: React.Context<{
  debouncerService: InterpreterFrom<typeof stringOutputDebouncer>;
}> = React.createContext({} as any);
*/

export let DemoEditor = (props) => {
  let [contents, setContents] = React.useState(props.initialContents);
  let onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      props.onChange(event.target.value);
    },
    [props.onChange]
  );
  return (
    <div>
      <textarea rows={8} cols={60} onChange={onChange} defaultValue={contents}>
      </textarea>
    </div>
  );
};

export let DemoIndicator = function<T>(props: {
  debouncer: T
  useDebouncer: (p: T) => [StateFrom<typeof stringOutputDebouncer>, PayloadSender<any>];
  
}) {
  let [state, _] = props.useDebouncer(props.debouncer);

  return (
    <div>
      <div>
        <div><h4>Debounce Status</h4></div>
        <div>{state.value == 'IDLE' ? "👍 fully saved" : "🕜 saving..."}</div>
        <div>{state.context.error ? "❌ " + state.context.error : "✅ no errors"}</div>
      </div>
    </div>
  );
};

export let DemoDbInspector = (props: { db: InterpreterFrom<typeof database> }) => {
  let [state, _] = useService(props.db);
  return (
    <div>
      <div><h4>DB State</h4></div>
      <pre>{JSON.stringify(state.context.data, null, 2)}</pre>
    </div>
  );
};