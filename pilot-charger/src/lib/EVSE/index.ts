"use strict"

import {
  EChargingScheduleAllowedChargingRateUnit,
  ECurrentLevel,
  EEnergyMeterType,
  EEventsQueueDBType,
  ENetworkModeEVSE,
  EPowerType,
  EVoltageLevel,
  IEVSE,
  IEVSEConfiguration,
  IEVSEEventsQueue,
  IEVSEOptions,
  IEVSEManufacturerConfiguration,
} from "./interfaces.ts"
import { IPayload } from "../Transport/interfaces.ts"

import { EVSEConnector } from  "../EVSEConnector/index.ts"

import Logger from "../Logger.ts"
import Transport from "../Transport/Transport.ts"
import { EventsQueue } from "../Queue/index.ts"

const logger = new Logger(/*{out:"./logs/ocpp_log.log"}*/)
// TODO: Abstract Logger, and set in options of base objects
// TODO: Add output file, and file rotation to logging
const validateOptions = options => {
  switch( true ) {
    case !options.id && typeof options.id !== 'number': throw SyntaxError( "EVSEBase Constructor: Options argument is missing required property(id)" );
    case !options.serialNumber                        : throw SyntaxError( "EVSEBase Constructor: Options argument is missing required property(serialNumber)" );
    case options.connectors.length < 1                : logger.warn( "Will not distribute power, no connectors registered")
      default: break
  }
}

export class EVSE implements IEVSE {
  connectors: EVSEConnector[] = []
  voltage:EVoltageLevel = EVoltageLevel.AC_LEVEL_2_SINGLE_PHASE
  current:ECurrentLevel = ECurrentLevel.AC_LEVEL_2
  powerType:EPowerType = EPowerType.SPLIT_PHASE_AC
  meterValue:number = 0
  id: number
  vendorId: string
  model: string
  firmwareVersion: string
  serialNumber: string
  lastHeartbeat: string
  location: string
  maxPower: number
  transport: Transport[]
  eventsQueue: IEVSEEventsQueue = {
    queue: null,
    dbType: EEventsQueueDBType.MEMORY,
    host: "",
    port: 0
  }
  configuration: IEVSEConfiguration
  manufacturer: IEVSEManufacturerConfiguration = {
    chargeRate: EChargingScheduleAllowedChargingRateUnit.W,
    autoReset: true,
    energyMeterType: EEnergyMeterType.REVENUE_GRADE,
    overheatProtection: false,
    networkMode: ENetworkModeEVSE.WIFI,
    userInterfaceEnabled: true,
    voltageLimit: null,
    currentLimit: null,
    firmware: {
      downloadInterval: 300,  // Download interval in seconds
      downloadRetries: 10     // Number of retries
    }
  }
  
  constructor( options:IEVSEOptions ){
    validateOptions( options )
    this.id = options.id
    this.serialNumber = options.serialNumber
    this.connectors = options.connectors
    this.transport = typeof options.transport === 'object' ? options.transport : [ options.transport ]
    this.configuration = { ...this.configuration, ...options.configuration }
    this.eventsQueue = {
      ...this.eventsQueue,
      dbType: options.eventsQueue.dbType,
      host  : options.eventsQueue.host,
      port  : options.eventsQueue.port
    }

    if ( !(this instanceof EVSE ) ) {
      return new EVSE( options )
    }
    return (async ()=> {
      try {
        await this.#setupEventsQueue()
        this.#startUp()
        await this.#connectToCentralSystem()
      } catch ( warn ) {
        console.warn( warn )
      }
      return this
    })()
  }
  async emit( method:string, payload?: IPayload ):Promise<void>{
    let recieved = false
    try {
      for ( const transport of this.transport ) {
        if ( !transport.isConnected() ) continue
        try {
          await transport.sendMessage( method, payload )
          recieved = true
        } catch (e) {
          console.error(e)
        }
      }
      if ( recieved === false ) throw "No available transport connection"
    } catch ( e ) {
      if ( this.eventsQueue.queue instanceof EventsQueue )
      this.eventsQueue.queue.enqueueEvent( method, payload )
    }
  }
  #startUp(){
    this.#boot()
    this.#heartbeatSetup()
  }
  async #setupEventsQueue(){
    if ( !this.eventsQueue ){
      logger.warn( "ONLY USE FOR TESTING PURPOSES: Default Event Queue is only using ram. Power reset will result in data loss." )
    }
    const { dbType, host, port } = this.eventsQueue
    this.eventsQueue.queue = await new EventsQueue( { dbType, host, port } )
    await this.eventsQueue.queue.hydrate()
  }
  async #connectToCentralSystem(){
    for ( const transport of this.transport ) {
      await transport.connect()
    }
    while ( this.eventsQueue.queue && this.eventsQueue.queue.length > 0 ){
      for ( const transport of this.transport ) {
        await transport.sendMessage( ...await this.eventsQueue.queue.dequeueEvent() )
      }
    }
  }
  #boot(){
    this.emit( "BootNotification", { chargePointVendor: "ExampleVendor", chargePointModel: "ExampleModel" } )
  }
  #heartbeatSetup(){
    setInterval(() => {
      this.lastHeartbeat = new Date().toISOString()
      this.emit( "Heartbeat" )
    }, this.configuration.heartbeatInterval || process.env.HEARTBEAT_INTERVAL || 120000);
    this.lastHeartbeat = new Date().toISOString()
    this.emit( "Heartbeat" )
  }
}
export default EVSE