"use strict"

import { TLED, TLEDStrip } from "./types"
import { ELEDPattern } from "./enums"
import { EColor } from "../common/enums"

function ColoredLED( color, resistance, pins = 2 ){
  return function ( constructor ){
    (constructor as any).setColor( color )
    (constructor as any).resistance = resistance
    (constructor as any).pins = pins
  }
}

export class LED implements TLED{
  id;
  name;
  description;
  pins = 2;
  resistance = 0;
  #color;
  #pattern:ELEDPattern = ELEDPattern.SOLID;
  #active:boolean      = false;
  constructor( id, name?, description? ) {
    this.id = id
    this.name = name || ""
    this.description = description || ""
  }
  setColor( color: EColor ): void{
    this.#color = color
  }
  isActive(): boolean{
    return this.#active
  }
  get solid(): TLED {
    return ( this.#pattern = ELEDPattern.SOLID, this )
  }
  get blinkSlow(): TLED {
    return ( this.#pattern = ELEDPattern.BLINK_SLOW, this )
  }
  get blinkFast(): TLED {
    return ( this.#pattern = ELEDPattern.BLINK_FAST, this )
  }
  on(): void{
    this.#active = true
  }
  off(): void{
    this.#active = false
  }
}

@ColoredLED( EColor.RED, 1.8 )
export class RedLED    extends LED implements TLED {}
@ColoredLED( EColor.GREEN, 2.5 )
export class GreenLED  extends LED implements TLED {}
@ColoredLED( EColor.BLUE, 3.5 )
export class BlueLED   extends LED implements TLED {}
@ColoredLED( EColor.PURPLE, 3 )
export class PurpleLED extends LED implements TLED {}
@ColoredLED( EColor.WHITE, 3.8, 3 )
export class WhiteLED  extends LED implements TLED {}

@ColoredLED( EColor.MULTI, 4, 3 )

export class MultiColorLED extends LED implements LED {
  get red()   : TLED { return ( this.setColor( EColor.RED )   , this ) }
  get blue()  : TLED { return ( this.setColor( EColor.BLUE )  , this ) }
  get green() : TLED { return ( this.setColor( EColor.GREEN ) , this ) }
  get yellow(): TLED { return ( this.setColor( EColor.YELLOW ), this ) }
}


function ColoredLEDStrip( color, resistance, pins = 4 ){
  return function ( constructor ){
    (constructor as any).color = color
    (constructor as any).resistance = resistance
    (constructor as any).pins = pins
  }
}
export class LEDStrip extends LED implements TLED {
  pins = 4;
}

@ColoredLEDStrip( EColor.RED, 4 )
export class RedLEDStrip        extends LEDStrip      implements TLEDStrip {}
@ColoredLEDStrip( EColor.GREEN, 4 )
export class GreenLEDStrip      extends LEDStrip      implements TLEDStrip {}
@ColoredLEDStrip( EColor.YELLOW, 4 )
export class YellowLEDStrip      extends LEDStrip     implements TLEDStrip {}
@ColoredLEDStrip( EColor.MULTI, 4 )
export class MultiColorLEDStrip extends MultiColorLED implements TLEDStrip {}