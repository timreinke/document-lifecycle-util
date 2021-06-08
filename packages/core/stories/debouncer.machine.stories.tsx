import { Meta, Story, Canvas } from "@storybook/addon-docs/blocks";
import { assign, createMachine, interpret, InterpreterFrom } from "xstate";
import { useSelector, useService } from "@xstate/react";
import { produce } from "immer";

import { WriteDebouncer } from "../src/debouncer.machine";
import { database, DemoDbInspector, DemoEditor, DemoIndicator, stringOutputDebouncer } from './util'
import React, { useState } from "react";
import { init } from "xstate/lib/actionTypes";

export default {
  title: "Debouncer",
};


export const Basic = () => {
  let dbService = interpret(database);

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
      error: undefined,
    });
  let debouncerService = interpret(machine);
  debouncerService.start();

  dbService.start();
  let initialContents =
    "this text field is debounced so you can edit it without getting spammed by database writes";
  debouncerService.send({ type: "WRITE", value: initialContents });

  return (
    <div style={{}}>
      This editor writes to the database after debouncing for 1.5 seconds. The database write call is asynchronous
      with a latency uniform latency distribution over 0.5-1.0 seconds. The write handler injects
      failures 60% of the time for this demo.
      <div>
        <h4>Editor</h4>
        <DemoEditor
          initialContents={initialContents}
          onChange={(contents) => {
            debouncerService.send({ type: "WRITE", value: contents });
          }}
        />
      </div>

      <DemoIndicator useDebouncer={useService} debouncer={debouncerService} />
      <DemoDbInspector db={dbService} />
    </div>
  );
};
