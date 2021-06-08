import { DocLifecycleContext, DocLifecycleEvent, mkAppLifecycleMachine } from '../src/lifecyle.machine'
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

    let EditorContainer_ = (props: { initialState: string, service: InterpreterFrom<typeof testDocMachine> }) => {
        let initialContents = React.useRef(props.initialState)
        let [state, send] = useService(props.service)
        return <DemoEditor initialContents={initialContents.current}
            onChange={
                (contents) => state.context.persister.send({ type: "WRITE", value: contents })}
        />
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
        let [state, _] = useService(props.service)
        console.log('running', state)
        return  <div>
                <EditorContainer initialState={state.context.contents} service={props.service} />
                <DemoIndicator useDebouncer={useActor as any} debouncer={state.context.persister} />

            </div>
    }

    let Running = React.memo(Running_, () => true)

    let Cleanup = (props: ServiceProp) => {
        let [state, _] = useService(props.service)
        return <div>
            <pre>
                {state.context.persister.getSnapshot().context.latestContents}
            </pre>
        </div>

    }

    let LifecycledEditor = (props: { service: InterpreterFrom<typeof testDocMachine> }) => {
        let stateValue = useSelector(props.service, (s) => s.value)
        console.log('lifecycle', stateValue)
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
            default: throw new Error()
        }
    }

    let EditorGroup = (props) => {
        let editorMachines = React.useRef({})
        let editorComponents = props.editors.map(key => {
            if (!editorMachines.current[key]) {
                let svc = interpret(testDocMachine.withContext({ href: key }))
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
                let newEditors = [...editors, key]
                setEditors(newEditors)
            }} />
            <EditorGroup editors={editors} />
        </div>
    }


    return <div id="multidocumenteditor">
        <Application />
        <DemoDbInspector db={dbService} />
    </div>
}