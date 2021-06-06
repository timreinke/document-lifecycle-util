import { Meta, Story, Canvas } from "@storybook/addon-docs/blocks";
import { assign, createMachine, interpret, InterpreterFrom } from "xstate";
import { useSelector, useService } from "@xstate/react";
import { produce } from "immer";

import { demo, WriteDebouncer } from "../src/debouncer.machine";
import React, { useState } from "react";
import { init } from "xstate/lib/actionTypes";

/*
# Requirements

*/

export default {
  title: "Debouncer",
};

let database = createMachine({
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

let stringOutputDebouncer = WriteDebouncer<string>();

let DebouncerServiceContext: React.Context<{
  debouncerService: InterpreterFrom<typeof stringOutputDebouncer>;
}> = React.createContext({} as any);

let DemoEditor = (props) => {
  let [contents, setContents] = React.useState(props.initialContents);
  let onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      props.onChange(event.target.value);
    },
    [props.onChange]
  );
  return (
    <div>
      <div><h2>Editor</h2></div>
      <textarea rows={8} cols={60} onChange={onChange}>
        {contents}
      </textarea>
    </div>
  );
};

let DemoIndicator = (props: {
  debouncer: InterpreterFrom<typeof stringOutputDebouncer>;
}) => {
  let [state, _] = useService(props.debouncer);

  return (
    <div>
      <div>
        <div><h2>Debounce Status</h2></div>
        <div>{!state.context.dirty ? "👍 fully saved" : "🕜 saving..."}</div>
        <div>{state.context.error ? "❌ " + state.context.error : "✅ no errors"}</div>
      </div>
    </div>
  );
};

let DemoDbInspector = (props: { db: InterpreterFrom<typeof database> }) => {
  let [state, _] = useService(props.db);
  return (
    <div>
      <div><h2>DB State</h2></div>
      <pre>{JSON.stringify(state.context.data, null, 2)}</pre>
    </div>
  );
};

export const Basic = () => {
  let dbService = interpret(database);

  //demo();

  let machine = stringOutputDebouncer
    .withConfig({
      delays: {
        DEBOUNCE_TIME: 1500,
      },
      services: {
        flush: (context) => {
          return new Promise((resolve, reject) =>
            setTimeout(() => {
              console.log("sending");
              if (Math.random() < 0.6) {
                reject(`oh no there was a ${Math.random() < 0.5 ? 'client disconnect' : 'server'} error`)
                return
              }
              dbService.send({
                type: "WRITE",
                key: "foo",
                value: context.latestContents,
              });
              resolve(null);
            }, Math.random() * 500 + 500)
          );
        },
      },
    })
    .withContext({
      latestContents: "",
      dirty: false,
      error: undefined,
    });
  let debouncerService = interpret(machine);
  debouncerService.start();

  dbService.start();
  let initialContents =
    "this text field is debounced so you can edit it without getting spammed by database writes";
  debouncerService.send({ type: "WRITE", value: initialContents });

  return (
    <div>
      This editor writes to the database after debouncing for 1.5 seconds. The database write call is asynchronous
      with a latency uniform latency distribution over 0.5-1.0 seconds. The write handler injects
      failures 60% of the time for this demo.
      <DemoEditor
        initialContents={initialContents}
        onChange={(contents) => {
          debouncerService.send({ type: "WRITE", value: contents });
        }}
      />
      <DemoIndicator debouncer={debouncerService} />
      <DemoDbInspector db={dbService} />
    </div>
  );
};
