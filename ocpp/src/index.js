"use strict"

import https from "https"
import neo4j from "neo4j-driver"
import { readFileSync, writeFileSync } from "fs"
import { RPCServer, createRPCError } from "ocpp-rpc"
import { EventEmitter } from "events"
import { v4 as uuidv4 } from "uuid"
import { exec } from "child_process"

(async ()=>{
    const serviceUUID = uuidv4()
    const neo4JDriver = neo4j.driver( "neo4j://neo4j:7687", neo4j.auth.basic( "neo4j", "password" ) );
    const server = new RPCServer({
        protocols: [ 'ocpp1.6','ocpp2.0.1' ],
        strictMode: true,
        pingIntervalMs: 400000,
        respondWithDetailedErrors: true
    })
    server.auth((accept, reject, handshake) => {
        console.log(`Authing [${handshake.identity}]`)
        const tlsClient = handshake.request.client;

        if (!tlsClient) {
            return reject();
        }
        //dblookup, identity(evse_SN, evse_pass->evse_pass_hash)

        // accept the incoming client
        // anything passed to accept() will be attached as a 'session' property of the client.
        accept( { sessionId: uuidv4() } )
    });

    server.on('client', async (client) => {
        console.log(`${client.session.sessionId} connected!`);
        // [
        //     'badMessage',
        //     'strictValidationFailure',
        //     'message',
        //     'call',
        //     'callResult',
        //     'callError',
        //     'close',
        //     'closing',
        //     'connecting',
        //     'disconnect',
        //     'open',
        //     'ping',
        //     'protocol',
        //     'response',
        //     'socketError'
        // ].forEach( evtName => {
        //     client.on( evtName, (...args ) => {
        //         console.log( "Event Name: ", evtName )
        //         console.log( ...args )
        //         console.log( "---------" )
        //     })
        // })

        // create a specific handler for handling BootNotification requests
        client.handle('BootNotification', ({params}) => {
            console.log(`Server got BootNotification from ${client.identity}:`, params);
            // respond to accept the client
            return {
                status: "Accepted",
                interval: 30000,
                currentTime: new Date().toISOString()
            };
        });
        
        // create a specific handler for handling Heartbeat requests
        client.handle('Heartbeat', ({params}) => {
            console.log(`Server got Heartbeat from ${client.identity}:`, params);

            // respond with the server's current time.
            return { currentTime: new Date().toISOString() }
        });
        
        // create a specific handler for handling StatusNotification requests
        client.handle('StatusNotification', (...args) => {
            console.log(`Server got StatusNotification from ${client.identity}:`, ...args);
            return {};
        });

        // create a wildcard handler to handle any RPC method
        client.handle(({method, params}) => {
            // This handler will be called if the incoming method cannot be handled elsewhere.
            console.log(`Server got ${method} from ${client.identity}:`, params);

            // throw an RPC error to inform the server that we don't understand the request.
            throw createRPCError("NotImplemented");
        });
        client.on( "ping", ( ...args ) => {
            console.log("pong", ...args )
        })
        client.on( "disconnect", ( ...args ) => {
            console.log( "Disconnect: ", ...args )
        })
        client.on( "close", ( ...args ) => {
            console.log( "Close: ", ...args )
        })
    })

    writeFileSync(
        "./openssl-san.cnf",
        readFileSync( "./openssl-san.cnf.template", "utf-8" )
            .replace( "{{CN}}", process.env.HOSTNAME )
            .replace( "{{IP}}", process.env.IP )
    )
    await new Promise( async (resolve, reject) => {
        try {
            exec("openssl req -x509 -nodes -newkey rsa:2048 -keyout ./server.key -out ./server.crt -days 365 -config ./openssl-san.cnf", resolve )
        } catch ( e ){
            reject(e)
        }
    })
    const [ key, cert ] = [ readFileSync( "./server.key", "utf-8" ), readFileSync( "./server.crt", "utf-8" ) ]   
    const httpsServer = https.createServer({
        key, cert,
        minVersion        : "TLSv1.2",
        rejectUnauthorized: true,
        enableTrace       : true
    })
    httpsServer.listen( process.env.PORT, async () => {
        console.log("listenting on: ", process.env.PORT )
        const session = neo4JDriver.session()
        const now = new Date().getTime()
        try {
            await session.run(`
                MERGE (o:ocppService {hostname:$hostname})
                ON CREATE SET   o.uuid = $serviceUUID,
                                o.createdDate = $createdDate,
                                o.updatedDate = $updatedDate,
                                o.cert = $cert
                ON MATCH SET    o.updatedDate = $updatedDate,
                                o.cert = $cert
                `,
                {
                    serviceUUID,
                    hostname   : process.env.HOSTNAME,
                    createdDate: now,
                    updatedDate: now,
                    cert
                }
            )
        } catch ( e ) {
            console.error( e )
        } finally {
            await session.close()
        }
    })
    httpsServer.on( 'error', ( err ) => console.log( "error", err ) );
    httpsServer.on( 'upgrade', server.handleUpgrade );

    const processEmitter = new EventEmitter( { captureRejections: true } )
    const signals = [ "SIGINT", "SIGTERM", "SIGUSR2", "exit" ]
    signals.forEach( signal => processEmitter.once( signal, () => processEmitter.emit( "processKill", signal ) ) )
    processEmitter.on("processKill", async () => {
        const session = neo4JDriver.session();
        try{
            await session.run(`
                MATCH (o:ocppService {uuid:$serviceUUID})
                DETACH DELETE o 
                `,
                { serviceUUID }
            )
        } catch ( e ) {
            console.error( e )
        } finally {
            await session.close()
        }
    })
})()