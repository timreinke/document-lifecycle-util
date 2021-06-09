import { DocLifecycleContext, DocLifecycleEvent, mkAppLifecycleMachine } from "../src/lifecycle.machine";
import { mkWriteDebouncer } from "../src/debouncer.machine";
import { interpret, StateMachine } from "xstate";

test("mkAppLifecycleMachine", (done) => {
  var testMachine : StateMachine<DocLifecycleContext<string>, any, DocLifecycleEvent> = mkAppLifecycleMachine<string>(
    async () => "",
    (_, contents) => {
      return mkWriteDebouncer(contents).withConfig({ delays: { DEBOUNCE_TIME: 0 }, services: { flush: () => new Promise((resolve) => { resolve("") }) } })
    }
  ).withContext({ href: "foo" });
  let svc = interpret(testMachine);
  svc.onTransition((_s, _e) => {
  });

  svc.start();
  svc.send({ type: "LOAD" });

  setTimeout(() => {
    svc.state.context.persister?.send({ type: 'WRITE', value: '2' });
  }, 5)
  setTimeout(() => { svc.send({ type: 'EXIT' }); done() }, 100)
  //setTimeout(() => { (svc.state.context as any).persister?.stop() }, 10)
  //setTimeout(() => { done() }, 20)
  //svc.stop()
  //done()


  /*var currentState = testMachine.initialState;

  currentState = testMachine.transition(currentState, { type: "LOAD" });
  expect(currentState.value).toBe("LOADING");

  currentState = testMachine.transition(currentState, {
    type: "done.invoke.loader",
    data: "hello world",
  } as any);
  expect(currentState.value).toBe("RUNNING");
  console.log("here here", currentState.context.persister?.getSnapshot())

  currentState = testMachine.transition(currentState, { type: "EXIT" });
  expect(currentState.value).toBe("CLEANUP");

  // go right to stop elsewhere
  currentState = testMachine.initialState;
  currentState = testMachine.transition(currentState, { type: "EXIT" });
  expect(currentState.value).toBe("STOPPED");
*/
});
