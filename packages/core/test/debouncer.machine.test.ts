import { interpret } from 'xstate'
import { mkWriteDebouncer } from '../src/debouncer.machine'

test('WriteDebouncer', async () => {
    let resolveFlushed: ((contents: string) => void) = undefined as any
    let flushed = new Promise<string>((resolve) => {
        resolveFlushed = resolve
    })
    let testMachine = mkWriteDebouncer('contents').withConfig({
        delays: { DEBOUNCE_TIME: 0 },
        services: {
            flush: async (context, _event) => {
                resolveFlushed(context.latestContents)
            }
        }
    })
    let service = interpret(testMachine)
    let expectedEvents = ['xstate.init', 'WRITE', 'xstate.after(DEBOUNCE_TIME)#debouncer.DEBOUNCE', 'done.invoke.flush']
    let expectedStates = ['IDLE', 'DEBOUNCE', { FLUSHING: 'CLEAN' }, 'IDLE']
    let sawEvents = new Promise((resolve) => {
        service.onTransition((state, event) => {
            let nextEvent = expectedEvents.shift()
            let nextState = expectedStates.shift()
            expect(event.type).toBe(nextEvent)
            expect(state.value).toStrictEqual(nextState)
            if (expectedEvents.length == 0 && expectedStates.length == 0) {
                resolve(null)
            }
        })
    })
    service.send({ type: 'WRITE', value: 'new contents' })
    service.start()
    expect(await flushed).toBe('new contents')
    await sawEvents
    expect(service.state.value).toBe('IDLE')
})


test('WriteDebouncer unhappy', () => {
    var testMachine = mkWriteDebouncer('contents').withConfig({
        delays: { DEBOUNCE_TIME: 0 },
        services: {
            flush: async (_context, _event) => {

            }
        },
        guards: {
            shouldWrite: (ctx, evt: any) => {
                return ctx.latestContents != evt.value
            }
        }
    })
    var currentState = testMachine.initialState

    currentState = testMachine.transition(currentState, { type: 'WRITE', value: 'contents' })
    expect(currentState.value).toBe('IDLE')

    currentState = testMachine.transition(currentState, { type: 'WRITE', value: 'new contents' })
    expect(currentState.value).toBe('DEBOUNCE')
    expect(currentState.context.latestContents).toBe('new contents')

    currentState = testMachine.transition(currentState, { type: 'WRITE', value: 'new contents again' })
    expect(currentState.value).toBe('DEBOUNCE')
    expect(currentState.context.latestContents).toBe('new contents again')


    currentState = testMachine.transition(currentState, { type: 'xstate.after(DEBOUNCE_TIME)#debouncer.DEBOUNCE' } as any)
    expect(currentState.value).toStrictEqual({ FLUSHING: 'CLEAN' })

    currentState = testMachine.transition(currentState, { type: 'WRITE', value: 'new contents prime' })
    expect(currentState.value).toStrictEqual({ FLUSHING: 'DIRTY' })
    expect(currentState.context.latestContents).toBe('new contents prime')

    currentState = testMachine.transition(currentState, { type: 'error.platform.flush', data: 'foo' } as any)
    expect(currentState.value).toStrictEqual('DEBOUNCE')
    expect(currentState.context.error).toBe('foo')


    currentState = testMachine.transition(currentState, { type: 'xstate.after(DEBOUNCE_TIME)#debouncer.DEBOUNCE' } as any)
    expect(currentState.value).toStrictEqual({ FLUSHING: 'CLEAN' })


    currentState = testMachine.transition(currentState, { type: 'done.invoke.flush' } as any)
    expect(currentState.value).toStrictEqual('IDLE')
})