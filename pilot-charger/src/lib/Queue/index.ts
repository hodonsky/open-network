"use strict"
import { EEventsQueueDBType, IEventsQueue, IEventsQueueOptions, IPayload } from "./interfaces"
import { EEvent } from "../Transport/enums"
import { EventEmitter } from "events"
import Database from "./Database"

export class EventsQueue implements IEventsQueue{
  queue      :string[]           = []
  eventStream:Generator
  db         :Database
  emitter    :EventEmitter       = new EventEmitter()
  events     : EEvent | EEvent[] = []
  constructor({ dbType = EEventsQueueDBType.MEMORY, host, path, port , events }: IEventsQueueOptions) {
    this.events = events
    this.eventStream = this._eventGenerator();
    if ( !(this instanceof EventsQueue) ) {
      return new EventsQueue( arguments[0] )
    }
    return (async () => {
      if ( dbType === EEventsQueueDBType.MEMORY){
        console.warn( "Queue will not persist, dbType[memory]" )
      } else {
        if ( !host ){
          throw new Error( `Missing {host} on intilizer` )
        } else if (!port ) {
          throw new Error( `Missing {port} on intilizer` )
        } else if ( !path ) {
          throw new Error( `Missing {path} on intilizer` )
        }
        const db = await new Database( dbType, { path, host, port } )
        if ( !(db instanceof Database) ) {
          console.warn("Invalid database instance provided.");
        } else {
          this.db = db;
          try {
            await this.db.initialize();
          } catch ( e ) {
            console.error( e );
          }
        }
      }
      return this
    })()
  }
  async hydrate():Promise<void>{
    try {
      if (this.db) { this.queue.push( ...( await this.db.fetchAll() ) ) }
    } catch (e) {
      console.error( e )
    }
  }
  *_eventGenerator():Generator {
    while (true) {
      yield this.queue.length === 0 ? null : this.queue.shift()
    }
  }
  async enqueue( event: string ):Promise<boolean>{
    try{
      if (this.db) {
        await this.db.insert(event);
      }
    } catch ( e ){
      console.error( e )
    } finally {
      this.queue.push(event)
      return true
    }
  }
  async dequeue():Promise<string> {
    const event:string = this.eventStream.next().value
    try{
      event && this.db ? await this.db.delete(event) : null
    } catch ( e ){
      console.error( e )
    }
    return event
  }
  get length():number {
    return this.queue.length
  }
  on( eventName: string, callBack: Function | any ):void{
    this.emitter.on( eventName, callBack )
  }
  off( eventName: string, callBack: Function | any ):void{
    this.emitter.off( eventName, callBack )
  }
  async enqueueEvent( method: string, payload?: IPayload ):Promise<void>{
    const event = JSON.stringify({ method, payload})
    try {
      await this.enqueue( event )
      this.emitter.emit( "EVENT_QUEUED", event )
    } catch ( e ){
      console.error( e )
    }
  }
  async dequeueEvent():Promise<{method:string,payload:IPayload}>{
    const event = JSON.parse(await this.dequeue())
    try{
      this.emitter.emit( "EVENT_DEQUEUED", event )
    } catch ( e ){
      console.error( e )
    } finally {
      return event
    }
  }
}