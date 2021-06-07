import {mkAppLifecycleMachine} from '../src/lifecyle.machine'
import { mkWriteDebouncer } from "../src/debouncer.machine";
import { interpret } from 'xstate';

import { database } from './util'

export default {
    title: "Document Lifecycle",
  };

export const MultidocumentEditor = () =>{
    let dbService = interpret(database.withContext({data: {foo: 'hello world'}}));

    let testDocMachine = mkAppLifecycleMachine(
        async (context) => {
            return dbService.state.context.data[context.href]
        },
        (href, contents) => {
            return mkWriteDebouncer(contents)
                .withConfig({
                    services: {
                        flush: async (context) => {
                            console.log("write", context.latestContents)
                        }
                    }
                })
        })
    let fooMachine = testDocMachine.withContext({href: 'foo'})
    let service = interpret(fooMachine)
    service.start()
    dbService.start()
    //service.send("LOAD")
    return <div>Hello world</div>
}