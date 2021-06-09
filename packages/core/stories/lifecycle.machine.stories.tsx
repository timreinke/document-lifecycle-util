import { DocLifecycleContext, DocLifecycleEvent, mkAppLifecycleMachine } from '../src/lifecycle.machine'
import { mkWriteDebouncer } from "../src/debouncer.machine";
import { interpret, InterpreterFrom, StateMachine } from 'xstate';

import { database, DemoDbInspector, DemoEditor, DemoIndicator } from './util'
import React from 'react';
import { useActor, useSelector, useService } from '@xstate/react';

export default {
    title: "Document Lifecycle",
};

export const MultidocumentEditor = () => {
    // `database` is a machine that accepts events of the shape 
    //   {type: 'WRITE', key: string, value: string}
    // We read the machine state directly to query - fine for our demo!
    let dbService = interpret(database.withContext({ data: { foo: 'hello world' } }));

    let testDocMachine: StateMachine<DocLifecycleContext<string>, any, DocLifecycleEvent> = mkAppLifecycleMachine(
        async (context) => {
            return dbService.state.context.data[context.href]
        },
        (href, contents) => {
            return mkWriteDebouncer(contents)
                .withConfig({
                    delays: { DEBOUNCE_TIME: 1000 },
                    services: {
                        flush: async (context) => {
                            dbService.send({ type: 'WRITE', key: href, value: context.latestContents })
                        }
                    }
                })
        })
    dbService.start()

    let AppToolbar = (props) => {
        let [state, setState] = React.useState("foo");
        return <div >
            <input id="openHref" type="text" value={state} onChange={
                e => setState(e.target.value)} /> <button onClick={() => props.onOpen(state)}>Open</button>
        </div>
    }

    let EditorContainer_ = (props: { service: InterpreterFrom<typeof testDocMachine> }) => {
        let initialContents = useSelector(props.service, s => s.context.contents)
        let persister = useSelector(props.service, (s) => s.context.persister)
        let href = useSelector(props.service, s => s.context.href)
        return <div>
            <div><span style={{ fontSize: "1.2em" }}>{href}</span>
                <button style={{ marginLeft: "2em" }} onClick={() => props.service.send({ type: 'EXIT' })}>X</button>
            </div>
            <DemoEditor initialContents={initialContents}
                onChange={
                    (contents) => persister.send({ type: "WRITE", value: contents })}
            />
        </div>
    }

    let EditorContainer = React.memo(EditorContainer_)

    type ServiceProp = { service: InterpreterFrom<typeof testDocMachine> }

    let Loading = (props: ServiceProp) => {
        let [state, _] = useService(props.service)
        return <div>Loading {state.context.href}</div>
    }


    let WaitRetry = (props: ServiceProp) => {
        let [state, _] = useService(props.service)
        return <div>Load failed with {state.context.error}. About to retry...</div>
    }

    let Running_ = (props: ServiceProp) => {
        let initialState = useSelector(props.service, state => state.context.contents)
        let persister = useSelector(props.service, (s) => s.context.persister)
        return <div>
            <EditorContainer service={props.service} />
            <DemoIndicator useDebouncer={useActor as any} debouncer={persister} />
        </div>

    }

    let Running = React.memo(Running_)

    let Cleanup = (props: ServiceProp) => {
        let [state, _] = useService(props.service)
        return <div>
            <pre>
                {state.context.persister.getSnapshot().context.latestContents}
            </pre>
        </div>

    }

    let LifecycledEditor = (props: { service: InterpreterFrom<typeof testDocMachine> }) => {
        // Using useSelector causes the Cleanup component to rerender after transitioning from CLEANUP to STOPPED 
        //let stateValue = useSelector(props.service, (s) => s.value)
        let [state, _] = useService(props.service)
        let stateValue = state.value
        switch (stateValue) {
            case 'PRE_LOAD':
                return <Loading service={props.service} />
            case 'LOADING':
                return <Loading service={props.service} />
            case 'WAIT_RETRY':
                return <WaitRetry service={props.service} />
            case 'RUNNING':
                return <Running service={props.service} />
            case 'CLEANUP':
                return <Cleanup service={props.service} />
            case 'STOPPED':
                return <div>done</div>
        }
    }

    let EditorGroup = (props) => {
        let editorMachines = React.useRef({})
        let editorComponents = props.editors.map(key => {
            if (!editorMachines.current[key]) {
                let svc = interpret(testDocMachine.withContext({ href: key }))
                svc.onDone(() => {
                    delete editorMachines.current[key]
                    props.removeEditor(key)
                })
                svc.start()
                editorMachines.current[key] = svc
                svc.send({ type: "LOAD" })
            }
            return <LifecycledEditor key={key} service={editorMachines.current[key]} />
        })
        return <div>
            {editorComponents}
        </div>
    }

    let Application = () => {
        let [editors, setEditors] = React.useState([])
        return <div>
            <AppToolbar onOpen={(key) => {
                if (!editors.find((v) => v == key)) {
                    let newEditors = [...editors, key]
                    setEditors(newEditors)
                }
            }} />
            <EditorGroup editors={editors} removeEditor={
                (key) => {
                    let i = editors.findIndex(v => v == key)
                    let newEditors = [...editors]
                    newEditors.splice(i, 1)
                    setEditors(newEditors)
                }
            } />
        </div>
    }


    return <div id="multidocumenteditor">
        <Application />
        <DemoDbInspector db={dbService} />
    </div>
}